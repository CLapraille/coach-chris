import {
  checkPlacement,
  dayLabel,
  matchWeek,
  proposePlacement,
  weekDays,
  type CachedActivity,
  type WeekSession,
  type WeekView,
} from '@coach-chris/domain';
import type { Store } from '../store/store.ts';
import { activities, planWeek, type PlanWeek } from './cache.ts';

export interface WeekData {
  view: WeekView;
  plan: PlanWeek | undefined;
}

/**
 * Semaine du Calendrier (D50, D60) : séances rapprochées des activités Garmin,
 * jours connus figés, reste placé par la proposition ; avertissements des règles.
 */
export async function weekView(store: Store, start: string, today: string): Promise<WeekView> {
  return (await weekData(store, start, today)).view;
}

/** Semaine et plan source (détails Campus) pour les écrans qui en ont besoin. */
export async function weekData(store: Store, start: string, today: string): Promise<WeekData> {
  const days = weekDays(start);
  const [plan, acts] = await Promise.all([planWeek(store, start), activities(store, start, days[6]!)]);
  const sessions = plan?.sessions ?? [];
  const { matches, offPlan } = matchWeek(sessions, acts);
  const matchByKey = new Map(matches.map((m) => [m.sessionKey, m]));

  const fixed = Object.fromEntries(matches.map((m) => [m.sessionKey, m.day]));
  // On ne place rien dans le passé : à partir d'aujourd'hui, ou du lundi pour une semaine à venir.
  const from = today > start ? today : start;
  const placement = proposePlacement({ days, from, sessions, fixed });
  const fixedKeys = new Set(Object.keys(fixed));

  const view: WeekView = {
    start,
    days: days.map((day) => ({ day, label: dayLabel(day) })),
    plan: plan ? { fetchedAt: plan.fetchedAt, ...(plan.goalWeek && { goalWeek: plan.goalWeek }) } : null,
    sessions: sessions.map((s) => {
      const m = matchByKey.get(s.key);
      const out: WeekSession = {
        key: s.key,
        displayName: s.displayName,
        name: s.name,
        index: s.index,
        sport: s.sport,
        trainingType: s.trainingType,
        durationMin: s.durationMin,
        status: s.status,
        intense: s.intense,
        legs: s.legs,
        legsFrom: s.legsFrom,
        day: placement[s.key] ?? null,
        fixed: fixedKeys.has(s.key),
      };
      if (m) {
        out.match = { day: m.day, method: m.method, confidence: m.confidence, reason: m.reason };
        if (m.activityId) out.match.activityId = m.activityId;
      }
      return out;
    }),
    activities: acts,
    // matchWeek renvoie les objets reçus : ce sont bien des activités du cache.
    offPlan: offPlan as CachedActivity[],
    warnings: checkPlacement(placement, sessions, days, fixedKeys),
  };
  return { view, plan };
}
