import {
  activitySport,
  addDays,
  resolveVariant,
  swapsOf,
  weeklyReview,
  type ClaudeWeek,
  type FlexDefault,
  type ReviewSession,
  type AcceptedReview,
  type ReviewView,
} from '@coach-chris/domain';
import {
  CLAUDE_ID,
  readSettings,
  SOURCE_ID,
  type ClaudePlanDoc,
  type PlanSourceDoc,
} from '../plan/claude.ts';
import type { Doc, Store } from '../store/store.ts';
import { activities } from './cache.ts';
import { readCheckins } from './checkin.ts';
import { weekData } from './week.ts';

/**
 * Revue du dimanche (D161) : partition `review` du conteneur `user`, un document par semaine revue,
 * écrit seulement quand l'utilisateur accepte (avec ses éventuelles retouches).
 */
const KIND = 'review';

type ReviewDoc = Doc & AcceptedReview & { kind: typeof KIND };

/** Semaine à revoir : la semaine en cours à partir du samedi, sinon la précédente. */
export function reviewWeekFor(today: string, monday: string): string {
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  return dow === 6 || dow === 0 ? monday : addDays(monday, -7);
}

async function claudeWeek(store: Store, week: string): Promise<ClaudeWeek | undefined> {
  const src = await store.get<PlanSourceDoc>('plan', SOURCE_ID, week);
  if (src?.active !== 'claude') return undefined;
  return (await store.get<ClaudePlanDoc>('plan', CLAUDE_ID, week))?.week;
}

const runMinutes = (acts: { type: string; durationS: number }[]) =>
  Math.round(acts.filter((a) => activitySport(a.type) === 'run').reduce((s, a) => s + a.durationS, 0) / 60);

export async function reviewView(
  store: Store,
  week: string,
  today: string,
): Promise<Omit<ReviewView, 'week'>> {
  const nextWeek = addDays(week, 7);
  const [plan, next, settings, accepted] = await Promise.all([
    claudeWeek(store, week),
    claudeWeek(store, nextWeek),
    readSettings(store),
    readAccepted(store, week),
  ]);
  if (!plan) {
    return {
      proposal: null,
      accepted,
      nextWeek,
      unavailable: 'La revue porte sur les semaines du plan Claude ; cette semaine suit Campus.',
    };
  }
  const [{ view }, checkins, nextCheckins, acts, history] = await Promise.all([
    weekData(store, week, today),
    readCheckins(store, week, addDays(week, 6)),
    readCheckins(store, nextWeek, addDays(nextWeek, 6)),
    activities(store, week, addDays(week, 6)),
    activities(store, addDays(week, -21), addDays(week, -1)),
  ]);
  const doneByIndex = new Set(view.sessions.filter((s) => s.match).map((s) => s.index));
  const swaps = swapsOf(checkins);
  const nextSwaps = swapsOf(nextCheckins);
  const sessions: ReviewSession[] = plan.sessions.map((s, i) => {
    const v = resolveVariant(s, settings.flexDefault, swaps[s.id]);
    return { id: s.id, role: s.role, sport: v.sport, dureeMin: v.dureeMin, done: doneByIndex.has(i) };
  });
  const nextSessions: ReviewSession[] = (next?.sessions ?? []).map((s) => {
    const v = resolveVariant(s, settings.flexDefault, nextSwaps[s.id]);
    const course = s.role === 'flexible' ? resolveVariant(s, 'course').dureeMin : undefined;
    return {
      id: s.id,
      role: s.role,
      sport: v.sport,
      dureeMin: v.dureeMin,
      done: false,
      ...(course !== undefined && v.sport !== 'course' && { courseMin: course }),
    };
  });
  const previous = [-21, -14, -7].map((d) => {
    const from = addDays(week, d);
    const to = addDays(from, 6);
    return runMinutes(
      history.filter((a) => a.startLocal.slice(0, 10) >= from && a.startLocal.slice(0, 10) <= to),
    );
  });
  const proposal = weeklyReview({
    week,
    sessions,
    checkins,
    runMinutes: runMinutes(acts),
    previousRunMinutes: previous,
    next: nextSessions,
  });
  return { proposal, accepted, nextWeek };
}

export async function readAccepted(store: Store, week: string): Promise<AcceptedReview | null> {
  const d = await store.get<ReviewDoc>('user', week, KIND);
  return d
    ? { week: d.week, verdict: d.verdict, durations: d.durations, flex: d.flex, acceptedAt: d.acceptedAt }
    : null;
}

/** Accepte la proposition, avec les retouches de l'utilisateur (durées, sport de la séance flexible). */
export async function acceptReview(
  store: Store,
  week: string,
  today: string,
  edits: { durations?: Record<string, number>; flex?: FlexDefault },
  now: string,
): Promise<AcceptedReview> {
  const { proposal } = await reviewView(store, week, today);
  if (!proposal) throw new ReviewError('Pas de revue possible pour cette semaine');
  const durations = {
    ...Object.fromEntries(Object.entries(proposal.adjustments).map(([id, a]) => [id, a.to])),
    ...edits.durations,
  };
  const accepted: AcceptedReview = {
    week,
    verdict: proposal.verdict,
    durations,
    flex: edits.flex ?? proposal.flex,
    acceptedAt: now,
  };
  await store.upsert('user', {
    ...accepted,
    id: week,
    source: 'app',
    fetchedAt: now,
    schemaVersion: 1,
    kind: KIND,
  });
  return accepted;
}

export async function cancelReview(store: Store, week: string): Promise<void> {
  await store.delete('user', week, KIND);
}

export class ReviewError extends Error {}
