import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import type { SourceName } from '@coach-chris/domain';

export type { SourceName };

/**
 * Liste blanche côté BFF (ARCHITECTURE §6) : seuls ces outils peuvent être appelés.
 * Les écritures (WRITE_TOOLS) exigent en plus le drapeau `write`, que seul le module actions passe (D124).
 */
export const ALLOWED_TOOLS: Record<SourceName, ReadonlySet<string>> = {
  garmin: new Set([
    'get_activities_by_date',
    'get_activity_splits',
    'get_activity_hr_in_timezones',
    'get_sleep_data',
    'get_hrv_data',
    'get_training_readiness',
    'get_body_battery',
    'get_stress_data',
    'get_weigh_ins',
    'get_devices',
    'get_device_last_used',
    'get_activity',
    'upload_workout',
    'schedule_workout',
    'delete_workout',
    'set_activity_name',
    'set_activity_description',
    'set_perceived_effort',
    'set_activity_feel',
    'create_manual_activity',
  ]),
  campus: new Set([
    'get_active_goal',
    'get_training_plan',
    'get_session_details',
    'get_logged_sessions',
    'get_training_logs',
    'get_paces',
    'get_stats_summary',
    'get_goal_history',
    'get_running_diary',
    'complete_session',
    'save_session',
  ]),
};

/** Outils qui modifient Garmin ou Campus : jamais appelés sans aperçu confirmé (D123). */
export const WRITE_TOOLS: ReadonlySet<string> = new Set([
  'upload_workout',
  'schedule_workout',
  'delete_workout',
  'set_activity_name',
  'set_activity_description',
  'set_perceived_effort',
  'set_activity_feel',
  'create_manual_activity',
  'complete_session',
  'save_session',
]);

export class ToolNotAllowedError extends Error {}

/** Erreur renvoyée par l'outil lui-même (jeton expiré, API indisponible…), texte lisible. */
export class ToolError extends Error {}

export interface McpCaller {
  call<T = unknown>(tool: string, args?: Record<string, unknown>, opts?: { write?: boolean }): Promise<T>;
  close(): Promise<void>;
}

/**
 * Connexion à un MCP : en local, processus lancé en stdio (`<SOURCE>_MCP_CMD`) ;
 * sur Azure, URL streamable-http interne (`<SOURCE>_MCP_URL`).
 */
export function mcpFromEnv(source: SourceName, env = process.env): McpCaller {
  const prefix = source.toUpperCase();
  const url = env[`${prefix}_MCP_URL`];
  const cmd = env[`${prefix}_MCP_CMD`];
  if (!url && !cmd) throw new Error(`${prefix}_MCP_URL ou ${prefix}_MCP_CMD doit être défini`);
  return new McpSource(source, () =>
    url
      ? // Le SDK déclare ses propriétés optionnelles sans `undefined` : incompatible avec exactOptionalPropertyTypes.
        (new StreamableHTTPClientTransport(new URL(url)) as Transport)
      : new StdioClientTransport({ command: cmd!, stderr: 'ignore' }),
  );
}

class McpSource implements McpCaller {
  private client: Promise<Client> | undefined;
  readonly source: SourceName;
  private readonly transport: () => Transport;

  constructor(source: SourceName, transport: () => Transport) {
    this.source = source;
    this.transport = transport;
  }

  private connect(): Promise<Client> {
    // Une seule connexion par source, ouverte au premier appel et rouverte si elle tombe.
    this.client ??= (async () => {
      const client = new Client({ name: 'coach-chris-bff', version: '0.1.0' });
      client.onclose = () => (this.client = undefined);
      await client.connect(this.transport());
      return client;
    })().catch((e: unknown) => {
      this.client = undefined;
      throw e;
    });
    return this.client;
  }

  async call<T>(tool: string, args: Record<string, unknown> = {}, opts: { write?: boolean } = {}): Promise<T> {
    if (!ALLOWED_TOOLS[this.source].has(tool)) throw new ToolNotAllowedError(`${this.source}.${tool}`);
    if (WRITE_TOOLS.has(tool) !== (opts.write === true)) {
      throw new ToolNotAllowedError(`${this.source}.${tool} : écriture hors du protocole de confirmation`);
    }
    const client = await this.connect();
    const res = await client.callTool({ name: tool, arguments: args });
    const text = (res.content as { type: string; text?: string }[])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('');
    if (res.isError) throw new ToolError(`${this.source}.${tool} : ${text}`);
    return parse(text) as T;
  }

  async close(): Promise<void> {
    const c = await this.client?.catch(() => undefined);
    this.client = undefined;
    await c?.close();
  }
}

/** Les MCP renvoient du JSON en texte ; certains outils répondent par une phrase (« No data… »). */
function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
