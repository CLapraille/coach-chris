import {
  addDays,
  assessZones,
  chooseDailySlot,
  chooseSocle,
  DECLARED_ZONES,
  exercise,
  MORNING,
  regularity,
  ZONE_LABEL,
  type DayContext,
  type MobilityBlock,
  type MobilityToday,
  type MobilityView,
  type RoutineItem,
  type RoutineItemView,
  type RoutineLog,
  type Slot,
  type TestResults,
  type WeekSession,
  type ZoneAssessment,
  type ZoneId,
  type ZoneView,
} from '@coach-chris/domain';
import type { Doc, Store } from '../store/store.ts';

/**
 * Données de mobilité propres à l'app, dans le conteneur `user` :
 * routines cochées (D38), séances de tests (D74), blocs validés (D78).
 */
const LOG = 'routine-log';
const TEST = 'mobility-test';
const BLOCK = 'mobility-block';
/** Durée d'un bloc du soir (D78). */
const BLOCK_DAYS = 14;

type TestDoc = Doc & { day: string; results: TestResults };
type BlockDoc = Doc & MobilityBlock & { socleItems: RoutineItem[] };

export async function routineLogs(store: Store): Promise<RoutineLog[]> {
  const docs = await store.list<Doc & RoutineLog>('user', LOG);
  return docs.map(({ day, slot }) => ({ day, slot }));
}

export async function setRoutineLog(store: Store, day: string, slot: Slot, done: boolean, now: string) {
  const id = `${day}:${slot}`;
  if (!done) return store.delete('user', id, LOG);
  return store.upsert('user', { id, kind: LOG, source: 'app', fetchedAt: now, schemaVersion: 1, day, slot });
}

export function itemView(code: string, reason?: string, slot?: RoutineItemView['slot']): RoutineItemView {
  const e = exercise(code);
  return {
    code,
    name: e.name,
    durationS: e.durationS,
    perSide: e.perSide,
    ...(reason !== undefined && { reason }),
    ...(slot && { slot }),
  };
}

/** Dernier résultat de chaque test, toutes séances confondues : refaire un seul test ne fait pas oublier les autres. */
async function latestTests(store: Store): Promise<MobilityView['tests']> {
  const docs = (await store.list<TestDoc>('user', TEST)).sort((a, b) => a.day.localeCompare(b.day));
  const out: Record<string, { day: string; value: unknown }> = {};
  for (const d of docs) {
    for (const [k, v] of Object.entries(d.results)) if (v !== undefined) out[k] = { day: d.day, value: v };
  }
  return out as MobilityView['tests'];
}

const resultsOf = (tests: MobilityView['tests']): TestResults =>
  Object.fromEntries(Object.entries(tests).map(([k, v]) => [k, v!.value])) as TestResults;

export async function saveTests(store: Store, day: string, results: TestResults, now: string): Promise<void> {
  const existing = await store.get<TestDoc>('user', day, TEST);
  await store.upsert('user', {
    id: day,
    kind: TEST,
    source: 'app',
    fetchedAt: now,
    schemaVersion: 1,
    day,
    results: { ...existing?.results, ...results },
  });
}

/** Bloc en cours : le plus récent dont la fin n'est pas passée. */
async function activeBlock(store: Store, today: string): Promise<BlockDoc | undefined> {
  const blocks = await store.list<BlockDoc>('user', BLOCK);
  return blocks
    .filter((b) => b.start <= today && b.end >= today)
    .sort((a, b) => b.start.localeCompare(a.start))[0];
}

interface MobilityState {
  zones: ZoneAssessment[];
  tests: MobilityView['tests'];
  block: BlockDoc | undefined;
}

async function state(store: Store, today: string): Promise<MobilityState> {
  const [tests, block] = await Promise.all([latestTests(store), activeBlock(store, today)]);
  return { tests, zones: assessZones(resultsOf(tests), DECLARED_ZONES), block };
}

export class BlockError extends Error {}

/**
 * Valider le bloc proposé (D78) : seul le socle calculé à partir des derniers tests est accepté,
 * pour qu'un écran périmé ne valide pas une autre proposition.
 */
export async function acceptBlock(store: Store, today: string, codes: string[], now: string): Promise<void> {
  const st = await state(store, today);
  if (st.block) throw new BlockError(`Un bloc est déjà en cours jusqu'au ${st.block.end}`);
  const socle = chooseSocle(st.zones);
  if (!socle.length) throw new BlockError('Aucune zone à travailler : pas de bloc à proposer');
  if (socle.map((s) => s.code).join() !== codes.join())
    throw new BlockError('La proposition a changé : recharge l’écran');
  const block: BlockDoc = {
    id: today,
    kind: BLOCK,
    source: 'app',
    fetchedAt: now,
    schemaVersion: 1,
    start: today,
    end: addDays(today, BLOCK_DAYS - 1),
    socle: socle.map((s) => itemView(s.code, s.reason, 'socle')),
    socleItems: socle,
    acceptedAt: now,
  };
  await store.upsert('user', block);
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

/** Créneau du jour (~2 min), sans doublon avec le socle du bloc en cours. */
function slotFor(sessions: WeekSession[], day: string, st: MobilityState): RoutineItemView | null {
  const slot = chooseDailySlot(st.block?.socleItems ?? [], dayContext(sessions, day), st.zones);
  return slot && itemView(slot.code, slot.reason, 'day');
}

/** Routine du soir d'un jour : socle du bloc + créneau du jour ; sans bloc, le créneau seul. */
function evening(sessions: WeekSession[], day: string, st: MobilityState): RoutineItemView[] {
  const slot = slotFor(sessions, day, st);
  const socle = st.block && day >= st.block.start && day <= st.block.end ? st.block.socle : [];
  return [...socle, ...(slot ? [slot] : [])];
}

/** Piste du soir de chaque jour (carte « Cette semaine ») : le créneau variable seul. */
export async function eveningSlots(
  store: Store,
  sessions: WeekSession[],
  days: string[],
  today: string,
): Promise<Record<string, RoutineItemView | null>> {
  const st = await state(store, today);
  return Object.fromEntries(days.map((d) => [d, slotFor(sessions, d, st)]));
}

const has = (logs: RoutineLog[], day: string, slot: Slot) =>
  logs.some((l) => l.day === day && l.slot === slot);

export async function mobilityToday(
  store: Store,
  sessions: WeekSession[],
  today: string,
): Promise<MobilityToday> {
  const [logs, st] = await Promise.all([routineLogs(store), state(store, today)]);
  return {
    morning: MORNING.map((e) => itemView(e.code)),
    evening: evening(sessions, today, st),
    testsMissing: !st.block,
    checked: { morning: has(logs, today, 'morning'), evening: has(logs, today, 'evening') },
    regularity: {
      morning: regularity(logs, 'morning', today, 7),
      evening: regularity(logs, 'evening', today, 7),
    },
    last7: Array.from({ length: 7 }, (_, i) => {
      const day = addDays(today, i - 6);
      return { day, morning: has(logs, day, 'morning'), evening: has(logs, day, 'evening') };
    }),
  };
}

/** Écran Mobilité (maquette v4) : routines, priorités, tests, bloc, régularité. */
export async function mobilityView(
  store: Store,
  sessions: WeekSession[],
  today: string,
): Promise<MobilityView> {
  const [logs, st] = await Promise.all([routineLogs(store), state(store, today)]);
  const assessed = new Map(st.zones.map((z) => [z.zone, z]));
  const zones: ZoneView[] = (Object.keys(ZONE_LABEL) as ZoneId[]).map((zone) => {
    const a = assessed.get(zone);
    const declared = DECLARED_ZONES.has(zone);
    return {
      zone,
      label: ZONE_LABEL[zone],
      status: a ? a.status : declared ? 'declared' : 'untested',
      detail: a ? a.reason : declared ? 'Limitation déclarée, pas encore testée' : 'Pas encore testée',
      declared,
    };
  });
  const proposal = st.block ? null : chooseSocle(st.zones);
  const reg = (slot: Slot) => ({
    d7: regularity(logs, slot, today, 7),
    d28: regularity(logs, slot, today, 28),
  });
  return {
    today,
    morning: MORNING.map((e) => itemView(e.code)),
    evening: st.block ? evening(sessions, today, st) : [],
    checked: { morning: has(logs, today, 'morning'), evening: has(logs, today, 'evening') },
    zones,
    tests: st.tests,
    block: st.block
      ? { start: st.block.start, end: st.block.end, socle: st.block.socle, acceptedAt: st.block.acceptedAt }
      : null,
    proposal: proposal?.length ? proposal.map((s) => itemView(s.code, s.reason, 'socle')) : null,
    regularity: { morning: reg('morning'), evening: reg('evening') },
    last28: Array.from({ length: 28 }, (_, i) => {
      const day = addDays(today, i - 27);
      return { day, morning: has(logs, day, 'morning'), evening: has(logs, day, 'evening') };
    }),
  };
}
