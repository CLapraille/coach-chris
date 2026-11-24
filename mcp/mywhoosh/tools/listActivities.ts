// Ajouté par CoachChris (D169) au serveur communautaire mywhoosh-mcp-server : copié dans src/tools avant le build
// (server/Dockerfile). Lecture seule : les dernières sorties du compte, sans aucun fichier.
import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MyWhooshClient } from '../clients/mywhoosh.js';
import { asMcpError, McpError } from './utils/toolHelpers.js';

export const method = 'listActivities';
export const description = 'List the most recent MyWhoosh rides (newest first), with the file id of each FIT file.';
export const parameters = z.object({
  limit: z.number().int().min(1).max(20).default(10).describe('Number of rides to return (1-20)'),
});

export async function handler(
  args: z.infer<typeof parameters>,
  extra: { client: MyWhooshClient },
): Promise<CallToolResult> {
  try {
    // L'API des sorties est en /v2 sur service14 (la base connue du serveur finit par /v1) : « /.. » remonte d'un
    // niveau, résolu par l'analyseur d'URL de fetch.
    const result = await extra.client.post<{ data?: { results?: Record<string, unknown>[] } }>(
      '/../v2/rider/profile/activities',
      { baseUrl: 'SERVICE14', body: JSON.stringify({ page: 1, limit: args.limit, sortDate: 'DESC' }) },
    );
    const rides = (result?.data?.results ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      routeName: a.routeName,
      sportType: a.sportType,
      startDatetime: a.startDatetime,
      date: a.date,
      rideDuration: a.rideDuration,
      distance: a.distance,
      elevation: a.elevation,
      watt: a.watt,
      heartrate: a.heartrate,
      activityFileId: a.activityFileId,
    }));
    return { content: [{ type: 'text', text: JSON.stringify({ rides }) }] };
  } catch (e) {
    if (e instanceof McpError) throw e;
    throw asMcpError(e);
  }
}
