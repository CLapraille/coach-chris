import {
  addDays,
  mondayOf,
  type CampusSessionDetails,
  type CampusWeek,
  type Night,
} from '@coach-chris/domain';
import { createHash } from 'node:crypto';
import { ToolError, type McpCaller, type SourceName } from '../mcp/client.ts';
import type { Doc, Store } from '../store/store.ts';
import * as garmin from './garmin.ts';

export type SyncOrigin = 'job' | 'open' | 'button';
export type SyncOutcome = 'ok' | 'token-expired' | 'error';

export interface SyncResult {
  source: SourceName;
  outcome: SyncOutcome;
  durationMs: number;
  /** Message lisible en cas d'échec. */
  message?: string;
}

export interface Clock {
  /** Jour courant à Paris, AAAA-MM-JJ. */
  today(): string;
  /** Instant courant, ISO 8601 UTC. */
  now(): string;
}

export const parisClock: Clock = {
  today: () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }),
  now: () => new Date().toISOString(),
};

/** Historique chargé au premier passage : 4 semaines complètes pour le repère de volume (D90). */
const HISTORY_WEEKS = 4;
/** Nuits chargées au premier passage : la fenêtre de l'écran Données (D84). */
const NIGHT_DAYS = 14;
const LOG_TTL_S = 90 * 24 * 3600;
const SCHEMA = 1;
/** Version du contenu d'une nuit : 2 = Body Battery, stress, temps éveillé, récupération. */
const NIGHT_VERSION = 2;
/** Au plus loin, le plan est lu sur 12 semaines (un objectif Campus dure en général 8 semaines). */
const MAX_WEEKS_AHEAD = 12;

interface SyncState extends Doc {
  lastDay: string;
  nightVersion?: number;
  lastOkAt?: string;
}

/** Garde les données des MCP dans le cache Cosmos (ARCHITECTURE §5). */
export class Sync {
  private readonly store: Store;
  private readonly mcp: Record<SourceName, McpCaller>;
  private readonly clock: Clock;
  private readonly running = new Map<SourceName, Promise<SyncResult>>();

  constructor(store: Store, mcp: Record<SourceName, McpCaller>, clock: Clock = parisClock) {
    this.store = store;
    this.mcp = mcp;
    this.clock = clock;
  }

  /** Lance la synchro d'une source ; un appel concurrent attend le passage en cours au lieu d'en ouvrir un second. */
  run(source: SourceName, origin: SyncOrigin): Promise<SyncResult> {
    let p = this.running.get(source);
    if (!p) {
      p = this.pass(source, origin).finally(() => this.running.delete(source));
      this.running.set(source, p);
    }
    return p;
  }

  /** Rattrapage à l'ouverture : seulement si le dernier passage réussi date de plus de `maxAgeMin`. */
  async ensureFresh(source: SourceName, maxAgeMin = 30): Promise<SyncResult | null> {
    const state = await this.state(source);
    const age = state?.lastOkAt ? Date.parse(this.clock.now()) - Date.parse(state.lastOkAt) : Infinity;
    return age > maxAgeMin * 60_000 ? this.run(source, 'open') : null;
  }

  private async pass(source: SourceName, origin: SyncOrigin): Promise<SyncResult> {
    const startedAt = this.clock.now();
    const t0 = performance.now();
    let result: SyncResult;
    try {
      const state = await this.state(source);
      await (source === 'garmin' ? this.garmin(state) : this.campus());
      await this.store.upsert('ops', {
        ...this.doc(`sync-state:${source}`, 'app'),
        kind: 'sync-state',
        lastDay: this.clock.today(),
        ...(source === 'garmin' && { nightVersion: NIGHT_VERSION }),
        lastOkAt: this.clock.now(),
      } satisfies SyncState);
      result = { source, outcome: 'ok', durationMs: Math.round(performance.now() - t0) };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      result = { source, outcome: tokenExpired(e) ? 'token-expired' : 'error', message, durationMs: 0 };
      result.durationMs = Math.round(performance.now() - t0);
    }
    await this.store.upsert('ops', {
      ...this.doc(`${startedAt}:${source}`, 'app'),
      kind: 'sync-log',
      origin,
      startedAt,
      ...result,
      ttl: LOG_TTL_S,
    });
    return result;
  }

  private state(source: SourceName): Promise<SyncState | undefined> {
    return this.store.get<SyncState>('ops', `sync-state:${source}`, 'sync-state');
  }

  private doc(id: string, source: Doc['source']): Doc {
    return { id, source, fetchedAt: this.clock.now(), schemaVersion: SCHEMA };
  }

  private async garmin(state: SyncState | undefined): Promise<void> {
    const today = this.clock.today();
    // On reprend la veille du dernier passage : une activité ou une nuit peut arriver en retard sur Garmin.
    const from = state ? addDays(state.lastDay, -1) : addDays(mondayOf(today), -7 * HISTORY_WEEKS);
    const range = { start_date: from, end_date: today };

    for (const a of garmin.activities(await this.mcp.garmin.call('get_activities_by_date', range))) {
      const day = a.startLocal.slice(0, 10);
      await this.store.upsert('cache', { ...this.doc(a.id, 'garmin'), pk: pk('activity', day), day, ...a });
    }
    for (const w of garmin.weighIns(await this.mcp.garmin.call('get_weigh_ins', range))) {
      await this.store.upsert('cache', { ...this.doc(w.day, 'garmin'), pk: pk('weight', w.day), ...w });
    }
    // Toute la fenêtre est relue quand le contenu d'une nuit a changé de version.
    const nightsFrom = state?.nightVersion === NIGHT_VERSION ? from : addDays(today, -(NIGHT_DAYS - 1));
    for (let day = nightsFrom; day <= today; day = addDays(day, 1)) {
      const g = (tool: string, args: Record<string, unknown>) => this.mcp.garmin.call(tool, args);
      const night: Night = {
        hrv: garmin.hrv(await g('get_hrv_data', { date: day })),
        sleep: garmin.sleep(await g('get_sleep_data', { date: day })),
        readiness: garmin.readiness(await g('get_training_readiness', { date: day })),
        bodyBattery: garmin.bodyBattery(await g('get_body_battery', { start_date: day, end_date: day })),
        stress: garmin.stress(await g('get_stress_data', { date: day })),
      };
      await this.store.upsert('cache', { ...this.doc(day, 'garmin'), pk: pk('night', day), day, ...night });
    }
  }

  private async campus(): Promise<void> {
    const goal = await this.mcp.campus.call<{ endDate?: string }[]>('get_active_goal');
    await this.store.upsert('cache', { ...this.doc('active', 'campus'), pk: 'goal', goals: goal });

    // Du plan : les semaines d'historique encore absentes (une séance validée sans montre n'existe que dans Campus
    // et compte dans le repère de volume, D90), puis tout ce que Campus a publié jusqu'à la fin de l'objectif.
    const monday = mondayOf(this.clock.today());
    let start = monday;
    for (let w = HISTORY_WEEKS; w >= 1; w--) {
      const weekDate = addDays(monday, -7 * w);
      if (!(await this.store.get('plan', 'latest', weekDate))) {
        start = weekDate;
        break;
      }
    }
    const goalEnd = Array.isArray(goal) ? goal[0]?.endDate?.slice(0, 10) : undefined;
    const horizon = addDays(monday, 7 * MAX_WEEKS_AHEAD - 1);
    const end =
      goalEnd && goalEnd > addDays(monday, 13)
        ? goalEnd < horizon
          ? goalEnd
          : horizon
        : addDays(monday, 13);
    const plan = await this.mcp.campus.call<{ weeks?: CampusWeek[] }>('get_training_plan', {
      start_date: start,
      end_date: end,
    });
    for (const week of plan.weeks ?? []) {
      const weekDate = week.weekDate.slice(0, 10);
      const latest = await this.store.get<Doc & PlanContent>('plan', 'latest', weekDate);
      // Le détail d'une semaine ne change qu'avec son résumé (statuts, séances) : on le relit seulement alors,
      // et toujours pour la semaine en cours.
      const unchanged = latest && weekDate !== monday && hashOf(latest.week) === hashOf(week);
      const details: Record<number, CampusSessionDetails> = unchanged ? latest.details : {};
      if (!unchanged) {
        for (const s of week.sessions) {
          details[s.sessionIndex] = await this.mcp.campus.call<CampusSessionDetails>('get_session_details', {
            week_id: s.weekId,
            session_index: s.sessionIndex,
          });
        }
      }
      await this.savePlanWeek(week, details, latest);
    }
  }

  /** Le plan est archivé : chaque contenu différent devient une version, jamais écrasée (D45). */
  private async savePlanWeek(
    week: CampusWeek,
    details: Record<number, CampusSessionDetails>,
    latest: (Doc & PlanContent) | undefined,
  ): Promise<void> {
    const weekDate = week.weekDate.slice(0, 10);
    const hash = hashOf({ week, details });
    const content: PlanContent = { weekDate, hash, week, details };
    if (latest?.hash !== hash) {
      await this.store.upsert('plan', {
        ...this.doc(`v:${this.clock.now()}`, 'campus'),
        kind: 'version',
        ...content,
      });
    }
    await this.store.upsert('plan', { ...this.doc('latest', 'campus'), kind: 'latest', ...content });
  }
}

interface PlanContent {
  weekDate: string;
  hash: string;
  week: CampusWeek;
  details: Record<number, CampusSessionDetails>;
}

const hashOf = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

/** Clé de partition du cache : `<type>#<AAAA-MM>`. */
export const pk = (type: string, day: string): string => `${type}#${day.slice(0, 7)}`;

function tokenExpired(e: unknown): boolean {
  return e instanceof ToolError && /401|refresh|sign in|login|auth/i.test(e.message);
}
