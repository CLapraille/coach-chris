import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import type { SourceName } from '@coach-chris/domain';

export type { SourceName };
/** Sources de données (synchro) plus MyWhoosh, utilisé seulement pour écrire (D160). */
export type McpName = SourceName | 'mywhoosh';

/**
 * Liste blanche côté BFF (ARCHITECTURE §6) : seuls ces outils peuvent être appelés.
 * Les écritures (WRITE_TOOLS) exigent en plus le drapeau `write`, que seul le module actions passe (D124).
 */
export const ALLOWED_TOOLS: Record<McpName, ReadonlySet<string>> = {
  // Serveur communautaire mywhoosh-mcp-server (commit figé, D160) : envoi et suppression des workouts « CC · » ;
  // outils maison (D169) : liste des sorties et téléchargement d'un FIT en mémoire.
  mywhoosh: new Set(['uploadCustomWorkout', 'deleteCustomWorkout', 'listActivities', 'downloadActivityFile']),
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
    // Outil maison (D169, mcp/garmin/coach_tools.py) : import d'une sortie MyWhoosh.
    'upload_activity_fit',
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
  'upload_activity_fit',
  'complete_session',
  'save_session',
  'uploadCustomWorkout',
  'deleteCustomWorkout',
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
export function mcpFromEnv(source: McpName, env = process.env, idleMs = IDLE_CLOSE_MS): McpCaller {
  const prefix = source.toUpperCase();
  const url = env[`${prefix}_MCP_URL`];
  const cmd = env[`${prefix}_MCP_CMD`];
  if (!url && !cmd) throw new Error(`${prefix}_MCP_URL ou ${prefix}_MCP_CMD doit être défini`);
  // Arguments séparés (`<SOURCE>_MCP_ARGS`, ex. le chemin du script node) ; variables transmises au processus
  // en plus de l'environnement minimal du SDK (`<SOURCE>_MCP_ENV`, noms séparés par des virgules).
  const args = env[`${prefix}_MCP_ARGS`]?.split(' ').filter(Boolean) ?? [];
  const passed = Object.fromEntries(
    (env[`${prefix}_MCP_ENV`] ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k && env[k] !== undefined)
      .map((k) => [k, env[k]!]),
  );
  return new McpSource(source, () =>
    url
      ? // Le SDK déclare ses propriétés optionnelles sans `undefined` : incompatible avec exactOptionalPropertyTypes.
        (new StreamableHTTPClientTransport(new URL(url)) as Transport)
      : new StdioClientTransport({
          command: cmd!,
          args,
          env: { ...getDefaultEnvironment(), ...passed },
          stderr: 'ignore',
        }),
    idleMs,
  );
}

/** MCP optionnel : `undefined` quand rien n'est configuré (MyWhoosh n'est pas indispensable). */
export function optionalMcpFromEnv(source: McpName, env = process.env): McpCaller | undefined {
  const prefix = source.toUpperCase();
  return env[`${prefix}_MCP_URL`] || env[`${prefix}_MCP_CMD`] ? mcpFromEnv(source, env) : undefined;
}

/**
 * Fermeture après inactivité (D151) : une connexion streamable-http ouverte garde la Container App du MCP
 * « en service » ; tant que le BFF restait éveillé (6 h → 23 h), les deux MCP ne descendaient jamais à zéro
 * (≈ 1 €/jour à eux deux, octobre 2026). Fermée 60 s après le dernier appel, elle laisse le MCP s'arrêter.
 */
export const IDLE_CLOSE_MS = 60_000;

export class McpSource implements McpCaller {
  private client: Promise<Client> | undefined;
  readonly source: McpName;
  private readonly transport: () => Transport;
  private readonly idleMs: number;
  private idle: ReturnType<typeof setTimeout> | undefined;
  private inFlight = 0;

  constructor(source: McpName, transport: () => Transport, idleMs = IDLE_CLOSE_MS) {
    this.source = source;
    this.transport = transport;
    this.idleMs = idleMs;
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
    clearTimeout(this.idle);
    this.inFlight++;
    let res: Awaited<ReturnType<Client['callTool']>>;
    try {
      const client = await this.connect();
      res = await client.callTool({ name: tool, arguments: args });
    } finally {
      this.inFlight--;
      this.scheduleClose();
    }
    const text = (res.content as { type: string; text?: string }[])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('');
    if (res.isError) throw new ToolError(`${this.source}.${tool} : ${text}`);
    return parse(text) as T;
  }

  /** Ferme la connexion une fois tous les appels finis et `idleMs` écoulées sans nouvel appel. */
  private scheduleClose(): void {
    if (this.inFlight > 0 || !this.client) return;
    clearTimeout(this.idle);
    this.idle = setTimeout(() => void this.close().catch(() => undefined), this.idleMs);
    this.idle.unref?.();
  }

  async close(): Promise<void> {
    clearTimeout(this.idle);
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
