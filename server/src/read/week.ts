import {
  checkPlacement,
  dayLabel,
  matchWeek,
  proposePlacement,
  weekDays,
  type Match,
  type PlannedSession,
  type RuleWarning,
} from '@coach-chris/domain';
import type { Store } from '../store/store.ts';
import type { CachedActivity } from '../sync/garmin.ts';
import { activities, planWeek, type PlanWeek } from './cache.ts';

export interface WeekSession {
  key: string;
  displayName: string;
  sport: PlannedSession['sport'];
  trainingType: string;
  durationMin: number;
  status: PlannedSession['status'];
  intense: boolean;
  legs: boolean;
  legsFrom: PlannedSession['legsFrom'];
  /** Jour placé ; `null` si la séance n'a plus de jour possible (semaine passée, non faite). */
  day: string | null;
  /** Jour connu (fait ou rattaché) : il ne bouge plus. */
  fixed: boolean;
  match?: Omit<Match, 'sessionKey'>;
}

export interface WeekView {
  start: string;
  days: { day: string; label: string }[];
  /** `null` quand Campus n'a pas (encore) fourni cette semaine. */
  plan: { fetchedAt: string; goalWeek?: PlanWeek['goalWeek'] } | null;
  sessions: WeekSession[];
  activities: CachedActivity[];
  offPlan: CachedActivity[];
  warnings: RuleWarning[];
}

/**
 * Semaine du Calendrier (D50, D60) : séances rapprochées des activités Garmin,
 * jours connus figés, reste placé par la proposition ; avertissements des règles.
 */
export async function weekView(store: Store, start: string, today: string): Promise<WeekView> {
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

  return {
    start,
    days: days.map((day) => ({ day, label: dayLabel(day) })),
    plan: plan ? { fetchedAt: plan.fetchedAt, ...(plan.goalWeek && { goalWeek: plan.goalWeek }) } : null,
    sessions: sessions.map((s) => {
      const m = matchByKey.get(s.key);
      const out: WeekSession = {
        key: s.key,
        displayName: s.displayName,
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
}
