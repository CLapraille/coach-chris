import { expect, it } from 'vitest';
import { buildApp } from '../app.ts';
import { importPlan } from '../plan/claude.ts';
import { MemoryStore } from '../store/store.ts';
import type { Sync } from '../sync/sync.ts';
import { planWeek } from './cache.ts';

const NOW = '2026-11-25T07:00:00.000Z';
const PLAN = {
  format: 'coach-chris.plan/v1',
  source: 'claude',
  generatedAt: '2026-11-20',
  block: { id: 'b', phase: 'Base', name: 'Base', start: '2026-11-23', end: '2026-11-29' },
  routines: {},
  weeks: [
    {
      index: 1,
      start: '2026-11-23',
      sessions: [
        {
          id: 's1-mer-flex',
          date: '2026-11-25',
          sport: 'velo',
          role: 'flexible',
          titre: 'Vélo endurance',
          dureeMin: 45,
          corps: [],
          alternatives: { rameur: { titre: 'Rameur endurance', dureeMin: 35, corps: [] } },
        },
        {
          id: 's1-dim-longue',
          date: '2026-11-29',
          sport: 'course',
          role: 'fixe',
          titre: 'Sortie longue',
          dureeMin: 45,
          corps: [],
        },
      ],
    },
  ],
};

async function setup() {
  const store = new MemoryStore();
  await importPlan(store, PLAN, { now: NOW });
  const app = buildApp({
    store,
    sync: {} as Sync,
    clock: { today: () => '2026-11-25', now: () => NOW },
  });
  return { store, app };
}

it('pied du matin : saisi, relu, effacé ; jamais dans le futur', async () => {
  const { app } = await setup();
  const put = (date: string, foot: number | null) =>
    app.inject({ method: 'PUT', url: `/api/checkins/${date}`, payload: { foot } });
  expect((await put('2026-11-25', 4)).json()).toEqual({ date: '2026-11-25', foot: 4 });
  expect((await put('2026-11-26', 2)).statusCode).toBe(409);
  expect((await put('2026-11-25', 11)).statusCode).toBe(400);
  await put('2026-11-25', null);
  expect((await app.inject({ method: 'GET', url: '/api/checkins' })).json()).toEqual([
    { date: '2026-11-25' },
  ]);
  await app.close();
});

it('séance : le choix du sport change le plan de la semaine, les scores se fusionnent', async () => {
  const { app, store } = await setup();
  const put = (date: string, id: string, payload: Record<string, unknown>) =>
    app.inject({ method: 'PUT', url: `/api/checkins/${date}/sessions/${id}`, payload });
  await put('2026-11-25', 's1-mer-flex', { swap: 'rameur' });
  await put('2026-11-25', 's1-mer-flex', { rpe: 5 });
  const flex = (await planWeek(store, '2026-11-23'))!.sessions[0]!;
  expect([flex.displayName, flex.durationMin]).toEqual(['Rameur endurance', 35]);
  const day = (
    await app.inject({ method: 'GET', url: '/api/checkins?from=2026-11-25&to=2026-11-25' })
  ).json();
  expect(day[0].sessions['s1-mer-flex']).toEqual({ swap: 'rameur', rpe: 5 });

  // Le choix d'une séance à venir est permis, pas ses scores.
  expect((await put('2026-11-29', 's1-dim-longue', { shin: 2 })).statusCode).toBe(409);
  expect((await put('2026-11-25', 's1-mer-flex', { swap: 'renfo' })).statusCode).toBe(400);
  await put('2026-11-25', 's1-mer-flex', { swap: null });
  expect((await planWeek(store, '2026-11-23'))!.sessions[0]!.displayName).toBe('Vélo endurance');
  await app.close();
});

it('détail de séance : contenu dans le sport choisi et check-in joint', async () => {
  const { app } = await setup();
  await app.inject({
    method: 'PUT',
    url: '/api/checkins/2026-11-25/sessions/s1-mer-flex',
    payload: { swap: 'rameur', rpe: 4 },
  });
  const key = encodeURIComponent('2026-11-23#0#s1-mer-flex');
  const view = (await app.inject({ method: 'GET', url: `/api/sessions/${key}` })).json();
  expect(view.claude.variants[0].sport).toBe('rameur');
  expect(view.checkin).toEqual({ swap: 'rameur', rpe: 4 });
  await app.close();
});
