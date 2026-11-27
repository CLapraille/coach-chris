import {
  activitySport,
  addDays,
  matchWeek,
  mondayOf,
  type DataStatus,
  type SourceName,
} from '@coach-chris/domain';
import type { Doc, Store } from '../store/store.ts';
import type { SyncOrigin, SyncOutcome } from '../sync/sync.ts';
import { activeGoal, activities, night, planWeek, weighIns } from './cache.ts';
import { readLinks } from './links.ts';

type LogDoc = Doc & {
  source: SourceName;
  origin: SyncOrigin;
  startedAt: string;
  outcome: SyncOutcome;
  durationMs: number;
  message?: string;
  attempts?: number;
};
type ActionLogDoc = Doc & { title: string; outcome: 'ok' | 'error'; message: string };

/** Fenêtre de l'écran Données (D84). */
const WINDOW_DAYS = 14;
const LOG_SIZE = 10;
/** Recherche de la dernière activité et de la dernière pesée. */
const LOOKBACK_DAYS = 90;

/** État des sources (D81), fraîcheur des données (D84), journal des synchros (D83) et des écritures (D123). */
export async function dataStatus(store: Store, today: string): Promise<DataStatus> {
  const windowDays = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(today, i - WINDOW_DAYS + 1));
  const [states, logs, nights, acts, weights, plan, goal, device, writes, links] = await Promise.all([
    store.list<Doc & { lastOkAt?: string }>('ops', 'sync-state'),
    store.list<LogDoc>('ops', 'sync-log'),
    Promise.all(windowDays.map((d) => night(store, d))),
    activities(store, addDays(today, -LOOKBACK_DAYS), today),
    weighIns(store, addDays(today, -LOOKBACK_DAYS), today),
    planWeek(store, mondayOf(today)),
    activeGoal(store),
    store.get<Doc & { name: string; lastUpload?: string }>('cache', 'garmin', 'device'),
    store.list<ActionLogDoc>('ops', 'action-log'),
    readLinks(store, mondayOf(today)),
  ]);
  const sorted = logs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const source = (name: SourceName): DataStatus['sources'][SourceName] => {
    const last = sorted.find((l) => l.id.endsWith(`:${name}`));
    return {
      lastOkAt: states.find((s) => s.id === `sync-state:${name}`)?.lastOkAt ?? null,
      last: last
        ? {
            at: last.startedAt,
            outcome: last.outcome,
            ...(last.message !== undefined && { message: last.message }),
          }
        : null,
    };
  };

  // Une nuit jamais synchronisée n'est pas « manquante » : seule une nuit relue sans donnée l'est.
  const synced = nights.filter((n): n is NonNullable<typeof n> => !!n);
  const withSleep = synced.filter((n) => n.sleep);
  const withHrv = synced.filter((n) => n.hrv?.lastNightMs !== undefined);
  const lastHrv = withHrv.at(-1);
  const sports = acts.filter((a) => activitySport(a.type) !== 'other');
  const lastWeight = weights.at(-1);
  const sessions = plan?.sessions.filter((s) => s.status !== 'skipped') ?? [];
  // Plan Claude : une séance rattachée à une activité de la semaine est faite (D175).
  const monday = mondayOf(today);
  const weekActs = acts.filter(
    (a) => a.startLocal.slice(0, 10) >= monday && a.startLocal.slice(0, 10) <= addDays(monday, 6),
  );
  const matched = new Set(matchWeek(sessions, weekActs, links).matches.map((m) => m.sessionKey));
  const isDone = (s: (typeof sessions)[number]) =>
    s.status === 'done' || (s.source === 'claude' && matched.has(s.key));

  return {
    sources: { garmin: source('garmin'), campus: source('campus') },
    missingNights: synced.filter((n) => n.day >= addDays(today, -6) && !n.sleep && !n.hrv).map((n) => n.day),
    device: device
      ? { name: device.name, ...(device.lastUpload && { lastUpload: device.lastUpload }) }
      : null,
    plan: plan
      ? {
          ...(goal && { goalType: goal.goalType }),
          ...(plan.goalWeek && {
            weekIndex: plan.goalWeek.index,
            durationInWeeks: plan.goalWeek.durationInWeeks,
          }),
          done: sessions.filter(isDone).length,
          total: sessions.length,
        }
      : null,
    freshness: {
      sleep: {
        last: withSleep.at(-1)?.day ?? null,
        missing: synced.filter((n) => !n.sleep).map((n) => n.day),
        present: withSleep.length,
        days: WINDOW_DAYS,
      },
      hrv: {
        last: lastHrv?.day ?? null,
        ...(lastHrv?.hrv?.lastNightMs !== undefined && { lastMs: lastHrv.hrv.lastNightMs }),
        missing: synced.filter((n) => n.hrv?.lastNightMs === undefined).map((n) => n.day),
      },
      activities: {
        lastStart: sports.at(-1)?.startLocal ?? null,
        lastRun: acts.filter((a) => activitySport(a.type) === 'run').at(-1)?.startLocal ?? null,
      },
      weight: { last: lastWeight?.day ?? null, ...(lastWeight && { kg: lastWeight.kg }) },
      plan: { week: plan ? mondayOf(today) : null, fetchedAt: plan?.fetchedAt ?? null },
    },
    log: sorted.slice(0, LOG_SIZE).map((l) => ({
      at: l.startedAt,
      source: l.source,
      origin: l.origin,
      outcome: l.outcome,
      durationMs: l.durationMs,
      ...(l.message !== undefined && { message: l.message }),
      ...(l.attempts !== undefined && { attempts: l.attempts }),
    })),
    actions: writes
      .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))
      .slice(0, LOG_SIZE)
      .map((w) => ({ at: w.fetchedAt, title: w.title, ok: w.outcome === 'ok', message: w.message })),
  };
}
