import {
  addDays,
  fromCampusWeek,
  type CampusSessionDetails,
  type CachedActivity,
  type CampusWeek,
  type GoalView,
  type Night,
  type PlannedSession,
  type WeighIn,
} from '@coach-chris/domain';
import type { Doc, Store } from '../store/store.ts';
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

/** Nuit en cache ; les documents d'avant la version 2 n'ont ni Body Battery ni stress : `null`, pas une estimation. */
export async function night(
  store: Store,
  day: string,
): Promise<(Night & { day: string; fetchedAt: string }) | undefined> {
  const d = await store.get<Doc & Partial<Night> & { day: string }>('cache', day, pk('night', day));
  return (
    d && {
      day: d.day,
      fetchedAt: d.fetchedAt,
      hrv: d.hrv ?? null,
      sleep: d.sleep ?? null,
      readiness: d.readiness ?? null,
      bodyBattery: d.bodyBattery ?? null,
      stress: d.stress ?? null,
    }
  );
}

export interface PlanWeek {
  sessions: PlannedSession[];
  details: Map<number, CampusSessionDetails & { description?: string; coachAdvice?: string }>;
  fetchedAt: string;
  goalWeek?: { index: number; durationInWeeks: number };
  cycleDescription?: string;
}

/** Dernière version connue du plan d'une semaine ; `undefined` si la source ne l'a jamais fournie. */
export async function planWeek(store: Store, weekStart: string): Promise<PlanWeek | undefined> {
  const d = await store.get<
    Doc & {
      week: CampusWeek & { goalWeek?: PlanWeek['goalWeek']; cycleDescription?: string };
      details: Record<string, CampusSessionDetails>;
    }
  >('plan', 'latest', weekStart);
  if (!d) return undefined;
  const details = new Map(Object.entries(d.details).map(([k, v]) => [Number(k), v]));
  const out: PlanWeek = { sessions: fromCampusWeek(d.week, details), details, fetchedAt: d.fetchedAt };
  if (d.week.goalWeek) out.goalWeek = d.week.goalWeek;
  if (d.week.cycleDescription) out.cycleDescription = d.week.cycleDescription;
  return out;
}

interface CampusGoal {
  goalType: string;
  startDate: string;
  endDate: string;
  durationInWeeks: number;
  stats?: {
    trainingsCount?: number;
    trainingsDoneCount?: number;
    distanceTotal?: number;
    timeTotal?: number;
  };
  sessionCompetitionInfo?: { sessionCompetition?: { displayName?: string; weekDate?: string } };
}

/** Objectif actif Campus, sans la description ni la semaine en cours (elles viennent du plan). */
export async function activeGoal(store: Store): Promise<GoalView | undefined> {
  const d = await store.get<Doc & { goals: unknown }>('cache', 'active', 'goal');
  const g = (Array.isArray(d?.goals) ? d.goals[0] : undefined) as CampusGoal | undefined;
  if (!g) return undefined;
  const out: GoalView = {
    goalType: g.goalType,
    startDate: g.startDate.slice(0, 10),
    endDate: g.endDate.slice(0, 10),
    durationInWeeks: g.durationInWeeks,
  };
  const st = g.stats;
  if (st?.trainingsDoneCount !== undefined) out.sessionsDone = st.trainingsDoneCount;
  if (st?.trainingsCount !== undefined) out.sessionsTotal = st.trainingsCount;
  if (st?.distanceTotal !== undefined) out.distanceKm = Math.round(st.distanceTotal * 10) / 10;
  if (st?.timeTotal !== undefined) out.timeS = st.timeTotal;
  const test = g.sessionCompetitionInfo?.sessionCompetition;
  if (test?.displayName && test.weekDate)
    out.test = { name: test.displayName, weekDate: test.weekDate.slice(0, 10) };
  return out;
}
