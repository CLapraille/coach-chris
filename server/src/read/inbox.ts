import type { InboxItem } from '@coach-chris/domain';
import { randomUUID } from 'node:crypto';
import type { Doc, Store } from '../store/store.ts';

/** Boîte à vidéos (D158) : partition `inbox` du conteneur `user`, un document par lien. */
const KIND = 'inbox';
type InboxDoc = Doc & InboxItem & { kind: typeof KIND };

export async function listInbox(store: Store): Promise<InboxItem[]> {
  const docs = await store.list<InboxDoc>('user', KIND);
  return docs
    .map(({ id, url, note, addedAt }) => ({ id, url, note, addedAt }))
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

export async function addToInbox(store: Store, url: string, note: string, now: string): Promise<InboxItem> {
  const item: InboxItem = { id: randomUUID(), url, note, addedAt: now };
  await store.upsert('user', { ...item, source: 'app', fetchedAt: now, schemaVersion: 1, kind: KIND });
  return item;
}

export async function removeFromInbox(store: Store, id: string): Promise<void> {
  await store.delete('user', id, KIND);
}
