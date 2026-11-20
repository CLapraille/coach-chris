import { expect, it } from 'vitest';
import { buildApp } from '../app.ts';
import { MemoryStore } from '../store/store.ts';
import type { Sync } from '../sync/sync.ts';

it('boîte à vidéos : ajout, liste récente d’abord, suppression, validation', async () => {
  let now = '2026-11-20T08:00:00.000Z';
  const app = buildApp({
    store: new MemoryStore(),
    sync: {} as Sync,
    clock: { today: () => now.slice(0, 10), now: () => now },
  });
  const add = (payload: Record<string, string>) => app.inject({ method: 'POST', url: '/api/inbox', payload });
  const a = (await add({ url: 'https://youtube.com/shorts/abc', note: 'mollet sur marche, tibias' })).json();
  now = '2026-11-21T08:00:00.000Z';
  await add({ url: 'https://youtube.com/shorts/def', note: 'pied court' });
  const list = (await app.inject({ method: 'GET', url: '/api/inbox' })).json();
  expect(list.map((i: { note: string }) => i.note)).toEqual(['pied court', 'mollet sur marche, tibias']);

  expect((await add({ url: 'javascript:alert(1)', note: 'x' })).statusCode).toBe(400);
  expect((await add({ url: 'https://youtube.com/shorts/x', note: '  ' })).statusCode).toBe(400);

  await app.inject({ method: 'DELETE', url: `/api/inbox/${a.id}` });
  expect((await app.inject({ method: 'GET', url: '/api/inbox' })).json()).toHaveLength(1);
  await app.close();
});
