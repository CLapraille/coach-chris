import { expect, it } from 'vitest';
import { buildApp } from '../app.ts';
import { MemoryStore } from '../store/store.ts';
import type { Sync } from '../sync/sync.ts';

const NOW = '2026-11-23T08:00:00.000Z';
const BOUCLES = {
  name: 'Les Boucles Ardennaises',
  date: '2027-06-05',
  dateConfirmed: true,
  place: 'La Roche-en-Ardenne',
  country: 'Belgique',
  terrain: 'trail',
  priority: 'A',
  options: [{ km: 21, dPlus: 600 }],
  chosen: 0,
};

function setup() {
  const app = buildApp({
    store: new MemoryStore(),
    sync: {} as Sync,
    clock: { today: () => '2026-11-23', now: () => NOW },
  });
  const season = async () => (await app.inject({ method: 'GET', url: '/api/season' })).json();
  return { app, season };
}

it('ajoute une course sans saison importée : saison créée, identifiant lisible (D165)', async () => {
  const { app, season } = setup();
  const res = await app.inject({ method: 'POST', url: '/api/season/events', payload: BOUCLES });
  expect(res.statusCode).toBe(200);
  expect(res.json().id).toBe('les-boucles-ardennaises-2027');
  const s = await season();
  expect(s.season).toBe('2027');
  expect(s.events.map((e: { id: string }) => e.id)).toEqual(['les-boucles-ardennaises-2027']);
  // Même nom, même année : identifiant suffixé plutôt qu'écrasé.
  const twin = await app.inject({ method: 'POST', url: '/api/season/events', payload: BOUCLES });
  expect(twin.json().id).toBe('les-boucles-ardennaises-2027-2');
  await app.close();
});

it('modifie puis supprime une course', async () => {
  const { app, season } = setup();
  const { id } = (await app.inject({ method: 'POST', url: '/api/season/events', payload: BOUCLES })).json();
  const put = await app.inject({
    method: 'PUT',
    url: `/api/season/events/${id}`,
    payload: { ...BOUCLES, priority: 'B', options: [{ km: 14 }, { km: 21, dPlus: 600 }], chosen: 1 },
  });
  expect(put.json()).toMatchObject({ id, priority: 'B', chosen: 1 });
  expect((await season()).events[0]).toMatchObject({ priority: 'B', chosen: 1 });
  expect((await app.inject({ method: 'DELETE', url: `/api/season/events/${id}` })).json()).toEqual({
    deleted: id,
  });
  expect((await season()).events).toEqual([]);
  expect((await app.inject({ method: 'DELETE', url: `/api/season/events/${id}` })).statusCode).toBe(404);
  await app.close();
});

it('refuse une course invalide avec la liste des problèmes, sans rien écrire', async () => {
  const { app, season } = setup();
  const bad = await app.inject({
    method: 'POST',
    url: '/api/season/events',
    payload: { ...BOUCLES, date: '05/06/2027', chosen: 3 },
  });
  expect(bad.statusCode).toBe(422);
  expect(bad.json().problems.length).toBeGreaterThan(0);
  const unknown = await app.inject({ method: 'PUT', url: '/api/season/events/inconnue', payload: BOUCLES });
  expect(unknown.statusCode).toBe(422);
  expect((await season()).events).toEqual([]);
  await app.close();
});
