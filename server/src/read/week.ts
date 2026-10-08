import {
  checkPlacement,
  dayLabel,
  matchWeek,
  moveSession,
  proposePlacement,
  weekDays,
  type CachedActivity,
  type Placement,
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

/** Placement ajusté à la main (D50) : partition `placement` du conteneur `user`, un document par semaine. */
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
export async function weekData(store: Store, start: string, today: string): Promise<WeekData> {
  const days = weekDays(start);
  const [plan, acts, saved, nights, logs] = await Promise.all([
    planWeek(store, start),
    activities(store, start, days[6]!),
    store.get<PlacementDoc>('user', start, KIND),
    Promise.all(days.map((d) => night(store, d))),
    routineLogs(store),
  ]);
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
  const placement = proposePlacement({ days, from, sessions, fixed: { ...done, ...manual } });
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

export class PlacementError extends Error {}

/** Déplace une séance à faire (échange si le jour cible porte une autre séance modifiable) et garde le résultat. */
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
  const movable = view.sessions.filter((x) => !x.fixed && x.status === 'todo' && x.day);
  const current = Object.fromEntries(movable.map((x) => [x.key, x.day!]));
  const next = moveSession(current, key, day);
  await store.upsert('user', {
    id: start,
    kind: KIND,
    source: 'app',
    fetchedAt: now,
    schemaVersion: 1,
    placement: next,
  });
  return weekView(store, start, today);
}

/** Revenir à la proposition : le placement manuel de la semaine est oublié. */
export async function resetWeek(store: Store, start: string, today: string): Promise<WeekView> {
  await store.delete('user', start, KIND);
  return weekView(store, start, today);
}
