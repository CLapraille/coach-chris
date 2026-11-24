// Ajouté par CoachChris (D169) au serveur communautaire mywhoosh-mcp-server : copié dans src/tools avant le build
// (server/Dockerfile). Lecture seule : télécharge le FIT d'une sortie en mémoire et le renvoie en base64.
// Aucun fichier n'est écrit sur disque.
import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MyWhooshClient } from '../clients/mywhoosh.js';
import { asMcpError, McpError } from './utils/toolHelpers.js';

export const method = 'downloadActivityFile';
export const description = 'Download the FIT file of one MyWhoosh ride (activityFileId from listActivities), as base64.';
export const parameters = z.object({
  fileId: z.string().min(1).describe('activityFileId of the ride'),
});

/** Le lien signé ne peut viser que le stockage de MyWhoosh (S3) : jamais un hôte arbitraire. */
function allowedUrl(raw: unknown): URL {
  if (typeof raw !== 'string') throw new McpError(-32603, 'MyWhoosh did not return a download link');
  const url = new URL(raw);
  const host = url.hostname;
  if (url.protocol !== 'https:' || !(host.endsWith('.amazonaws.com') || host.endsWith('.mywhoosh.com'))) {
    throw new McpError(-32603, `Unexpected download host: ${host}`);
  }
  return url;
}

export async function handler(
  args: z.infer<typeof parameters>,
  extra: { client: MyWhooshClient },
): Promise<CallToolResult> {
  try {
    const whooshId = extra.client.getWhooshId();
    if (!whooshId) throw new McpError(-32600, 'Not authenticated');
    const link = await extra.client.post<{ data?: unknown; error?: unknown; message?: unknown }>(
      '/../v2/rider/profile/download-activity-file',
      { baseUrl: 'SERVICE14', body: JSON.stringify({ key: whooshId, fileId: args.fileId }) },
    );
    if (link?.error) throw new McpError(-32603, `MyWhoosh: ${String(link.message ?? 'download refused')}`);
    const res = await fetch(allowedUrl(link?.data), { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new McpError(-32603, `FIT download failed: ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length < 14 || bytes.subarray(8, 12).toString('latin1') !== '.FIT') {
      throw new McpError(-32603, 'The downloaded file is not a FIT file');
    }
    return {
      content: [{ type: 'text', text: JSON.stringify({ fileId: args.fileId, bytes: bytes.length, fit: bytes.toString('base64') }) }],
    };
  } catch (e) {
    if (e instanceof McpError) throw e;
    throw asMcpError(e);
  }
}
