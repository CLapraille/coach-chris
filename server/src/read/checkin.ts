import type { CheckinDay, SessionCheckin } from '@coach-chris/domain';
import type { Doc, Store } from '../store/store.ts';

/** Check-ins (D159) : partition `checkin` du conteneur `user`, un document par jour. */
const KIND = 'checkin';
type CheckinDoc = Doc & CheckinDay & { kind: typeof KIND };

const strip = ({ date, foot, sessions }: CheckinDoc): CheckinDay => ({
  date,
  ...(foot !== undefined && { foot }),
  ...(sessions && { sessions }),
});

export async function readCheckins(store: Store, from?: string, to?: string): Promise<CheckinDay[]> {
  const docs = await store.list<CheckinDoc>('user', KIND);
  return docs
    .filter((d) => (!from || d.date >= from) && (!to || d.date <= to))
    .map(strip)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function readCheckin(store: Store, date: string): Promise<CheckinDay | undefined> {
  const d = await store.get<CheckinDoc>('user', date, KIND);
  return d && strip(d);
}

async function save(store: Store, day: CheckinDay, now: string): Promise<CheckinDay> {
  await store.upsert('user', {
    ...day,
    id: day.date,
    source: 'app',
    fetchedAt: now,
    schemaVersion: 1,
    kind: KIND,
  });
  return day;
}

/** Douleur du pied au premier pas ; `null` efface la saisie du jour. */
export async function setFoot(store: Store, date: string, foot: number | null, now: string) {
  const rest: CheckinDay = { ...((await readCheckin(store, date)) ?? { date }) };
  delete rest.foot;
  return save(store, foot === null ? rest : { ...rest, foot }, now);
}

/** Tibia, effort ressenti, sport choisi : seuls les champs fournis changent ; `null` efface un champ. */
export async function setSessionCheckin(
  store: Store,
  date: string,
  id: string,
  patch: { [K in keyof SessionCheckin]?: SessionCheckin[K] | null },
  now: string,
) {
  const day = (await readCheckin(store, date)) ?? { date };
  const merged: Record<string, unknown> = { ...day.sessions?.[id] };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete merged[k];
    else if (v !== undefined) merged[k] = v;
  }
  const sessions = { ...day.sessions, [id]: merged as SessionCheckin };
  if (Object.keys(merged).length === 0) delete sessions[id];
  return save(store, { ...day, sessions }, now);
}
