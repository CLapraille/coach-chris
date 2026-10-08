import {
  activitySport,
  addDays,
  capStatus,
  chooseDailySlot,
  hrvSignal,
  hrvStatus,
  matchWeek,
  MORNING,
  mondayOf,
  offPlanSignals,
  volumeCap,
  weeklyVolume,
  weightTrend,
  type Signal,
  type VolumeEntry,
  type WeekVolume,
} from '@coach-chris/domain';
import type { Store } from '../store/store.ts';
import { activeGoal, activities, night, planWeek, weighIns } from './cache.ts';
import { weekView, type WeekSession } from './week.ts';

/** Fenêtre de recherche de la dernière pesée (les pesées ne sont pas quotidiennes). */
const WEIGHT_LOOKBACK_DAYS = 90;
const HISTORY_WEEKS = 4;

/** Écran Aujourd'hui (maquette v21 validée) : tout vient du cache, une absence reste une absence. */
export async function todayView(store: Store, today: string) {
  const monday = mondayOf(today);
  const historyFrom = addDays(monday, -7 * HISTORY_WEEKS);
  const historyWeeks = Array.from({ length: HISTORY_WEEKS }, (_, i) => addDays(historyFrom, 7 * i));
  const [goal, week, lastNight, weights, history, historyPlans] = await Promise.all([
    activeGoal(store),
    weekView(store, monday, today),
    night(store, today),
    weighIns(store, addDays(today, -WEIGHT_LOOKBACK_DAYS), today),
    activities(store, historyFrom, addDays(monday, -1)),
    Promise.all(historyWeeks.map((w) => planWeek(store, w))),
  ]);
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

  const next = week.sessions
    .filter((s) => s.status === 'todo' && s.day && s.day >= today)
    .sort((a, b) => a.day!.localeCompare(b.day!))[0];

  const hrvReading = lastNight?.hrv ?? null;
  const signals: Signal[] = [
    ...(hrvReading ? [hrvSignal(hrvReading)].filter((s): s is Signal => s !== null) : []),
    ...offPlanSignals(week.offPlan),
  ];

  return {
    today,
    goal: goal ? { ...goal, ...(week.plan?.goalWeek && { week: week.plan.goalWeek }) } : null,
    nextSession: next ?? null,
    form: {
      night: lastNight
        ? {
            sleep: lastNight.sleep,
            readiness: lastNight.readiness,
            hrv: hrvReading && { ...hrvReading, position: hrvStatus(hrvReading) },
            fetchedAt: lastNight.fetchedAt,
          }
        : null,
      weight: weightTrend(weights),
    },
    volume: volume(week.sessions, [...history, ...week.activities], campusOnly, monday),
    week,
    mobility: mobility(week.sessions, today),
    signals,
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
) {
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
  const capOf = (values: number[], plannedMin: number) => {
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

/** Mobilité du jour : routine du matin fixe, créneau du soir selon le contexte (D78). */
function mobility(sessions: WeekSession[], today: string) {
  const on = (day: string) => sessions.filter((s) => s.day === day && s.status !== 'skipped');
  const todays = on(today);
  const ctx = {
    legsStrengthToday: todays.some((s) => s.sport === 'strength' && s.legs),
    runToday: todays.some((s) => s.sport === 'run'),
    intenseTomorrow: on(addDays(today, 1)).some((s) => s.intense),
    restDay: todays.length === 0,
  };
  return {
    morning: MORNING.map((e) => e.code),
    // Sans résultats de tests, pas de socle ni de zone prioritaire : seul le créneau du jour est proposé.
    evening: { socle: [], slot: chooseDailySlot([], ctx, []), testsMissing: true },
    context: ctx,
  };
}
