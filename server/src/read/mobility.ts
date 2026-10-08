import {
  addDays,
  chooseDailySlot,
  exercise,
  MORNING,
  regularity,
  type DayContext,
  type MobilityToday,
  type RoutineItemView,
  type RoutineLog,
  type Slot,
  type WeekSession,
} from '@coach-chris/domain';
import type { Doc, Store } from '../store/store.ts';

/** Routines cochées (D38) : partition `routine-log` du conteneur `user`, un document par jour et créneau. */
const KIND = 'routine-log';

export async function routineLogs(store: Store): Promise<RoutineLog[]> {
  const docs = await store.list<Doc & RoutineLog>('user', KIND);
  return docs.map(({ day, slot }) => ({ day, slot }));
}

export async function setRoutineLog(store: Store, day: string, slot: Slot, done: boolean, now: string) {
  const id = `${day}:${slot}`;
  if (!done) return store.delete('user', id, KIND);
  return store.upsert('user', { id, kind: KIND, source: 'app', fetchedAt: now, schemaVersion: 1, day, slot });
}

export function itemView(code: string, reason?: string): RoutineItemView {
  const e = exercise(code);
  return {
    code,
    name: e.name,
    durationS: e.durationS,
    perSide: e.perSide,
    ...(reason !== undefined && { reason }),
  };
}

/** Contexte d'un jour pour le créneau du soir, d'après les séances placées (D78). */
export function dayContext(sessions: WeekSession[], day: string): DayContext {
  const on = (d: string) => sessions.filter((s) => s.day === d && s.status !== 'skipped');
  const todays = on(day);
  return {
    legsStrengthToday: todays.some((s) => s.sport === 'strength' && s.legs),
    runToday: todays.some((s) => s.sport === 'run'),
    intenseTomorrow: on(addDays(day, 1)).some((s) => s.intense),
    restDay: todays.length === 0,
  };
}

/** Sans résultats de tests, pas de socle ni de zone prioritaire : seul le créneau du jour est proposé. */
export function eveningSlot(sessions: WeekSession[], day: string): RoutineItemView | null {
  const slot = chooseDailySlot([], dayContext(sessions, day), []);
  return slot && itemView(slot.code, slot.reason);
}

export async function mobilityToday(
  store: Store,
  sessions: WeekSession[],
  today: string,
): Promise<MobilityToday> {
  const logs = await routineLogs(store);
  const has = (day: string, slot: Slot) => logs.some((l) => l.day === day && l.slot === slot);
  const slot = eveningSlot(sessions, today);
  return {
    morning: MORNING.map((e) => itemView(e.code)),
    evening: slot ? [slot] : [],
    testsMissing: true,
    checked: { morning: has(today, 'morning'), evening: has(today, 'evening') },
    regularity: {
      morning: regularity(logs, 'morning', today, 7),
      evening: regularity(logs, 'evening', today, 7),
    },
    last7: Array.from({ length: 7 }, (_, i) => {
      const day = addDays(today, i - 6);
      return { day, morning: has(day, 'morning'), evening: has(day, 'evening') };
    }),
  };
}
