import {
  addDays,
  fromCampusWeek,
  type CampusSessionDetails,
  type CampusWeek,
  type PlannedSession,
  type WeighIn,
} from '@coach-chris/domain';
import type { Doc, Store } from '../store/store.ts';
import type { CachedActivity, Night } from '../sync/garmin.ts';
import { pk } from '../sync/sync.ts';

/** Lectures du cache Cosmos alimenté par la synchro. Rien n'est complété ni estimé. */

function months(from: string, to: string): string[] {
  const out = new Set<string>();
  for (let d = from; d <= to; d = addDays(d, 1)) out.add(d.slice(0, 7));
  return [...out];
}

async function between<T extends Doc & { day: string }>(
  store: Store,
  type: string,
  from: string,
  to: string,
) {
  const parts = await Promise.all(months(from, to).map((m) => store.list<T>('cache', pk(type, `${m}-01`))));
  return parts
    .flat()
    .filter((d) => d.day >= from && d.day <= to)
    .sort((a, b) => a.day.localeCompare(b.day));
}

export async function activities(store: Store, from: string, to: string): Promise<CachedActivity[]> {
  const docs = await between<Doc & CachedActivity & { day: string }>(store, 'activity', from, to);
  return docs.map(({ id, startLocal, type, durationS, name, distanceM, avgHr }) => ({
    id,
    startLocal,
    type,
    durationS,
    ...(name !== undefined && { name }),
    ...(distanceM !== undefined && { distanceM }),
    ...(avgHr !== undefined && { avgHr }),
  }));
}

export async function weighIns(store: Store, from: string, to: string): Promise<WeighIn[]> {
  const docs = await between<Doc & WeighIn>(store, 'weight', from, to);
  return docs.map(({ day, kg }) => ({ day, kg }));
}

export type NightDoc = Night & { day: string; fetchedAt: string };

export async function night(store: Store, day: string): Promise<NightDoc | undefined> {
  const d = await store.get<Doc & NightDoc>('cache', day, pk('night', day));
  return d && { day: d.day, fetchedAt: d.fetchedAt, hrv: d.hrv, sleep: d.sleep, readiness: d.readiness };
}

export interface PlanWeek {
  sessions: PlannedSession[];
  fetchedAt: string;
  goalWeek?: { index: number; durationInWeeks: number };
}

/** Dernière version connue du plan d'une semaine ; `undefined` si la source ne l'a jamais fournie. */
export async function planWeek(store: Store, weekStart: string): Promise<PlanWeek | undefined> {
  const d = await store.get<
    Doc & {
      week: CampusWeek & { goalWeek?: PlanWeek['goalWeek'] };
      details: Record<string, CampusSessionDetails>;
    }
  >('plan', 'latest', weekStart);
  if (!d) return undefined;
  const details = new Map(Object.entries(d.details).map(([k, v]) => [Number(k), v]));
  const out: PlanWeek = { sessions: fromCampusWeek(d.week, details), fetchedAt: d.fetchedAt };
  if (d.week.goalWeek) out.goalWeek = d.week.goalWeek;
  return out;
}

export interface Goal {
  goalType: string;
  startDate: string;
  endDate: string;
  durationInWeeks: number;
  sessionsDone?: number;
  sessionsTotal?: number;
}

export async function activeGoal(store: Store): Promise<Goal | undefined> {
  const d = await store.get<Doc & { goals: unknown }>('cache', 'active', 'goal');
  const g = (Array.isArray(d?.goals) ? d.goals[0] : undefined) as
    | {
        goalType: string;
        startDate: string;
        endDate: string;
        durationInWeeks: number;
        stats?: { trainingsCount?: number; trainingsDoneCount?: number };
      }
    | undefined;
  if (!g) return undefined;
  const out: Goal = {
    goalType: g.goalType,
    startDate: g.startDate.slice(0, 10),
    endDate: g.endDate.slice(0, 10),
    durationInWeeks: g.durationInWeeks,
  };
  if (g.stats?.trainingsDoneCount !== undefined) out.sessionsDone = g.stats.trainingsDoneCount;
  if (g.stats?.trainingsCount !== undefined) out.sessionsTotal = g.stats.trainingsCount;
  return out;
}
