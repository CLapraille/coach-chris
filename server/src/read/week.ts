import {
  activitySport,
  addDays,
  checkPlacement,
  dayLabel,
  matchWeek,
  proposePlacement,
  weekDays,
  type CachedActivity,
  type Eve,
  type Placement,
  type PushRecord,
  type WeekSession,
  type WeekView,
} from '@coach-chris/domain';
import type { Doc, Store } from '../store/store.ts';
import { activities, night, planWeek, type PlanWeek } from './cache.ts';
import { routineLogs } from './mobility.ts';

export interface WeekData {
  view: WeekView;
  plan: PlanWeek | undefined;
}

/** Envois sur la montre (D126) : partition `push` du conteneur `ops`, un document par séance. */
export const PUSH_KIND = 'push';
export type PushDoc = Doc & PushRecord & { sessionKey: string };
/** Les clés de séance contiennent « # », interdit dans un identifiant Cosmos. */
export const pushId = (sessionKey: string) => sessionKey.replace(/[#/\\?]/g, ':');

/**
 * Séances épinglées à la main (D50, D147) : partition `placement` du conteneur `user`, un document par semaine.
 * Version 2 : seules les séances déplacées par l'utilisateur ; les autres sont replacées autour à chaque lecture.
 * Version 1 (avant le 13/10) : toutes les séances à faire, figées ; remplacée au premier déplacement.
 */
const PINS_VERSION = 2;
const KIND = 'placement';
type PlacementDoc = Doc & { placement: Placement };

/**
 * Semaine du Calendrier (D50, D60) : séances rapprochées des activités Garmin, jours connus figés,
 * placement ajusté à la main conservé, reste placé par la proposition ; avertissements des règles.
 */
export async function weekView(store: Store, start: string, today: string): Promise<WeekView> {
  return (await weekData(store, start, today)).view;
}

/** Semaine et plan source (détails Campus) pour les écrans qui en ont besoin. */
export async function weekData(
  store: Store,
  start: string,
  today: string,
  withEve = true,
): Promise<WeekData> {
  const days = weekDays(start);
  const [plan, acts, saved, nights, logs, pushes, eve] = await Promise.all([
    planWeek(store, start),
    activities(store, start, days[6]!),
    store.get<PlacementDoc>('user', start, KIND),
    Promise.all(days.map((d) => night(store, d))),
    routineLogs(store),
    store.list<PushDoc>('ops', PUSH_KIND),
    withEve ? eveOf(store, start, today) : undefined,
  ]);
  const pushByKey = new Map(pushes.map((p) => [p.sessionKey, p]));
  const sessions = plan?.sessions ?? [];
  const { matches, offPlan } = matchWeek(sessions, acts);
  const matchByKey = new Map(matches.map((m) => [m.sessionKey, m]));

  const done = Object.fromEntries(matches.map((m) => [m.sessionKey, m.day]));
  // On ne place rien dans le passé : à partir d'aujourd'hui, ou du lundi pour une semaine à venir.
  const from = today > start ? today : start;
  // Un placement manuel reste valable tant que la séance est à faire et que son jour n'est pas passé.
  const todo = new Set(sessions.filter((s) => s.status === 'todo' && !(s.key in done)).map((s) => s.key));
  const manual = Object.fromEntries(
    Object.entries(saved?.placement ?? {}).filter(([k, d]) => todo.has(k) && days.includes(d) && d >= from),
  );
  const placement = proposePlacement({
    days,
    from,
    sessions,
    fixed: { ...done, ...manual },
    ...(eve && { eve }),
  });
  const fixedKeys = new Set(Object.keys(done));

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
      const pushed = pushByKey.get(s.key);
      if (pushed) out.pushed = { workoutId: pushed.workoutId, date: pushed.date, at: pushed.at };
      if (m) {
        out.match = { day: m.day, method: m.method, confidence: m.confidence, reason: m.reason };
        if (m.activityId) out.match.activityId = m.activityId;
      }
      return out;
    }),
    activities: acts,
    // matchWeek renvoie les objets reçus : ce sont bien des activités du cache.
    offPlan: offPlan as CachedActivity[],
    warnings: checkPlacement(placement, sessions, days, fixedKeys, eve),
    manual: Object.keys(manual).length > 0,
    readiness: Object.fromEntries(days.map((d, i) => [d, nights[i]?.readiness?.score ?? null])),
    routines: Object.fromEntries(
      days.map((d) => [
        d,
        {
          morning: logs.some((l) => l.day === d && l.slot === 'morning'),
          evening: logs.some((l) => l.day === d && l.slot === 'evening'),
        },
      ]),
    ),
  };
  return { view, plan };
}

/**
 * Veille du lundi (D145) : le dimanche précédent tel que la semaine précédente le montre (séance faite ou
 * placée, activité Garmin hors plan). Cette semaine-là est lue sans sa propre veille, pour ne pas remonter le temps.
 */
async function eveOf(store: Store, start: string, today: string): Promise<Eve> {
  const day = addDays(start, -1);
  const { view } = await weekData(store, addDays(start, -7), today, false);
  const sessions = view.sessions.filter((s) => s.day === day && s.status !== 'skipped');
  return {
    day,
    run:
      sessions.some((s) => s.sport === 'run') ||
      view.activities.some((a) => a.startLocal.slice(0, 10) === day && activitySport(a.type) === 'run'),
    legs: sessions.some((s) => s.legs),
  };
}

export class PlacementError extends Error {}

/**
 * Déplace une séance à faire : elle est épinglée sur ce jour et le reste de la semaine est replacé autour,
 * selon les règles (D147). Les séances déplacées auparavant restent épinglées.
 */
export async function moveInWeek(
  store: Store,
  start: string,
  today: string,
  key: string,
  day: string,
  now: string,
): Promise<WeekView> {
  const { view } = await weekData(store, start, today);
  const s = view.sessions.find((x) => x.key === key);
  if (!s) throw new PlacementError('Séance inconnue dans cette semaine');
  if (s.fixed || s.status !== 'todo') throw new PlacementError('Séance déjà faite : elle ne se déplace pas');
  if (!view.days.some((d) => d.day === day) || day < today) {
    throw new PlacementError('Jour hors de la semaine ou déjà passé');
  }
  const saved = await store.get<PlacementDoc>('user', start, KIND);
  const pins = saved?.schemaVersion === PINS_VERSION ? saved.placement : {};
  await store.upsert('user', {
    id: start,
    kind: KIND,
    source: 'app',
    fetchedAt: now,
    schemaVersion: PINS_VERSION,
    placement: { ...pins, [key]: day },
  });
  return weekView(store, start, today);
}

/** Revenir à la proposition : le placement manuel de la semaine est oublié. */
export async function resetWeek(store: Store, start: string, today: string): Promise<WeekView> {
  await store.delete('user', start, KIND);
  return weekView(store, start, today);
}
