import {
  activitySport,
  addDays,
  capStatus,
  hrvSignal,
  hrvStatus,
  matchWeek,
  mondayOf,
  offPlanSignals,
  sessionBlocks,
  volumeCap,
  weekDays,
  weeklyVolume,
  weightTrend,
  type CapView,
  type NextSession,
  type NightView,
  type Signal,
  type TodayView,
  type VolumeEntry,
  type VolumeView,
  type WeekSession,
  type WeekVolume,
} from '@coach-chris/domain';
import type { Store } from '../store/store.ts';
import { activeGoal, activities, night, planWeek, weighIns, type PlanWeek } from './cache.ts';
import { eveningSlot, mobilityToday } from './mobility.ts';
import { weekData } from './week.ts';

/** Fenêtre de recherche de la dernière pesée (les pesées ne sont pas quotidiennes). */
const WEIGHT_LOOKBACK_DAYS = 90;
const HISTORY_WEEKS = 4;
const HRV_NIGHTS = 8;

/** Écran Aujourd'hui (maquette v21 validée) : tout vient du cache, une absence reste une absence. */
export async function todayView(store: Store, today: string): Promise<TodayView> {
  const monday = mondayOf(today);
  const historyFrom = addDays(monday, -7 * HISTORY_WEEKS);
  const historyWeeks = Array.from({ length: HISTORY_WEEKS }, (_, i) => addDays(historyFrom, 7 * i));
  const nightDays = Array.from({ length: HRV_NIGHTS }, (_, i) => addDays(today, i - HRV_NIGHTS + 1));
  const [goal, { view: week, plan }, nights, weights, history, historyPlans] = await Promise.all([
    activeGoal(store),
    weekData(store, monday, today),
    Promise.all(nightDays.map((d) => night(store, d))),
    weighIns(store, addDays(today, -WEIGHT_LOOKBACK_DAYS), today),
    activities(store, historyFrom, addDays(monday, -1)),
    Promise.all(historyWeeks.map((w) => planWeek(store, w))),
  ]);
  const lastNight = nights.at(-1);
  const yesterday = nights.at(-2);

  // Séances validées dans Campus sans activité Garmin (ex. renforcement sans montre) : leur durée prévue compte.
  const campusOnly: VolumeEntry[] = [
    ...historyPlans.flatMap((p) => {
      const sessions = p?.sessions ?? [];
      return matchWeek(sessions, history).matches.flatMap((m) => {
        const s = sessions.find((x) => x.key === m.sessionKey)!;
        return s.status === 'done' && !m.activityId
          ? [{ day: m.day, sport: s.sport, minutes: s.durationMin }]
          : [];
      });
    }),
    ...week.sessions
      .filter((s) => s.status === 'done' && s.match && !s.match.activityId)
      .map((s) => ({ day: s.match!.day, sport: s.sport, minutes: s.durationMin })),
  ];

  const upcoming = week.sessions
    .filter((s) => s.status === 'todo' && s.day && s.day >= today)
    .sort((a, b) => a.day!.localeCompare(b.day!));

  const hrv = lastNight?.hrv ?? null;
  const signals: Signal[] = [
    ...(hrv ? [hrvSignal(hrv)].filter((s): s is Signal => s !== null) : []),
    ...offPlanSignals(week.offPlan),
  ];

  const nightView: NightView | null = lastNight ? { ...lastNight, hrvPosition: hrv && hrvStatus(hrv) } : null;

  return {
    today,
    goal: goal
      ? {
          ...goal,
          ...(plan?.cycleDescription && { description: plan.cycleDescription }),
          ...(plan?.goalWeek && { weekIndex: plan.goalWeek.index }),
        }
      : null,
    nextSession: upcoming[0] ? withDetails(upcoming[0], plan) : null,
    thenSession: upcoming[1] ?? null,
    form: {
      night: nightView,
      stressYesterday: yesterday?.stress ?? null,
      hrvHistory: nightDays.map((day, i) => ({ day, ms: nights[i]?.hrv?.lastNightMs ?? null })),
      weight: weightTrend(weights),
    },
    volume: volume(week.sessions, [...history, ...week.activities], campusOnly, monday),
    week,
    evenings: Object.fromEntries(weekDays(monday).map((d) => [d, eveningSlot(week.sessions, d)])),
    mobility: await mobilityToday(store, week.sessions, today),
    signals,
  };
}

function withDetails(s: WeekSession, plan: PlanWeek | undefined): NextSession {
  const d = plan?.details.get(s.index);
  return {
    ...s,
    blocks: sessionBlocks(d?.exercisesBlocks ?? []),
    ...(d?.description && { description: d.description }),
    ...(d?.coachAdvice && { coachAdvice: d.coachAdvice }),
  };
}

/**
 * Volume (D90) : minutes par semaine sur les 4 semaines complètes précédentes et la semaine en cours,
 * plus le repère (1,3 × moyenne) pour la course et le total, comparé au prévu de la semaine.
 */
function volume(
  sessions: WeekSession[],
  acts: { startLocal: string; type: string; durationS: number }[],
  campusOnly: VolumeEntry[],
  monday: string,
): VolumeView {
  const entries: VolumeEntry[] = [
    ...acts.map((a) => ({
      day: a.startLocal.slice(0, 10),
      sport: activitySport(a.type),
      minutes: Math.round(a.durationS / 60),
    })),
    ...campusOnly,
  ];
  const byWeek = weeklyVolume(entries);
  const weeks = Array.from({ length: HISTORY_WEEKS + 1 }, (_, i) =>
    addDays(monday, -7 * (HISTORY_WEEKS - i)),
  );
  const vol = (w: string): WeekVolume => byWeek.get(w) ?? { run: 0, bike: 0, strength: 0 };
  const total = (v: WeekVolume) => v.run + v.bike + v.strength;
  const previous = weeks.slice(0, HISTORY_WEEKS).map(vol);

  const counted = sessions.filter((s) => s.status !== 'skipped' && s.sport !== 'walk' && s.sport !== 'other');
  const planned = {
    run: counted.filter((s) => s.sport === 'run').reduce((n, s) => n + s.durationMin, 0),
    total: counted.reduce((n, s) => n + s.durationMin, 0),
  };
  const capOf = (values: number[], plannedMin: number): CapView | null => {
    const cap = volumeCap(values);
    return cap && { ...cap, planned: plannedMin, status: capStatus(plannedMin, cap) };
  };
  return {
    weeks: weeks.map((w) => ({ start: w, ...vol(w) })),
    cap: {
      run: capOf(
        previous.map((v) => v.run),
        planned.run,
      ),
      total: capOf(previous.map(total), planned.total),
    },
  };
}
