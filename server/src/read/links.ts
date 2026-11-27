import type { Doc, Store } from '../store/store.ts';

/**
 * Rattachements faits à la main (D177) : partition `link` du conteneur `user`, un document par semaine (id = lundi),
 * clé de séance → identifiant de l'activité Garmin. Ils passent avant toutes les règles de rattachement.
 */
const KIND = 'link';
type LinksDoc = Doc & { kind: typeof KIND; week: string; links: Record<string, string> };

export async function readLinks(store: Store, week: string): Promise<Record<string, string>> {
  return (await store.get<LinksDoc>('user', week, KIND))?.links ?? {};
}

async function save(store: Store, week: string, links: Record<string, string>, now: string) {
  if (!Object.keys(links).length) {
    await store.delete('user', week, KIND);
    return;
  }
  await store.upsert('user', {
    id: week,
    kind: KIND,
    source: 'app',
    fetchedAt: now,
    schemaVersion: 1,
    week,
    links,
  } satisfies LinksDoc);
}

/** Rattache une activité à une séance ; une activité n'appartient qu'à une séance à la fois. */
export async function setLink(
  store: Store,
  week: string,
  sessionKey: string,
  activityId: string,
  now: string,
) {
  const links = Object.fromEntries(
    Object.entries(await readLinks(store, week)).filter(([, id]) => id !== activityId),
  );
  links[sessionKey] = activityId;
  await save(store, week, links, now);
}

export async function removeLink(store: Store, week: string, sessionKey: string, now: string) {
  const links = await readLinks(store, week);
  delete links[sessionKey];
  await save(store, week, links, now);
}
