import { S2_DETAILS, S2_WEEK } from '@coach-chris/domain/fixtures/campus-s2';
import { expect, it } from 'vitest';
import { buildApp } from '../app.ts';
import { planWeek } from '../read/cache.ts';
import { MemoryStore } from '../store/store.ts';
import type { Sync } from '../sync/sync.ts';
import { importPlan } from './claude.ts';

const NOW = '2026-11-20T08:00:00.000Z';
const WEEK = '2026-11-23';
const PLAN = {
  format: 'coach-chris.plan/v1',
  source: 'claude',
  generatedAt: '2026-11-20',
  block: { id: 'b', phase: 'Base', name: 'Base', start: WEEK, end: '2026-11-29' },
  routines: {},
  weeks: [
    {
      index: 1,
      start: WEEK,
      sessions: [
        {
          id: 'a',
          date: WEEK,
          sport: 'course',
          role: 'fixe',
          titre: 'Course facile',
          dureeMin: 30,
          corps: [],
        },
        {
          id: 'b',
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

async function setup(activate: boolean) {
  const store = new MemoryStore();
  await store.upsert('plan', {
    id: 'latest',
    source: 'campus',
    fetchedAt: NOW,
    schemaVersion: 1,
    kind: 'latest',
    weekDate: WEEK,
    week: { ...S2_WEEK, weekDate: WEEK },
    details: S2_DETAILS,
  });
  await importPlan(store, PLAN, { now: NOW, activate });
  const app = buildApp({ store, sync: {} as Sync, clock: { today: () => '2026-11-20', now: () => NOW } });
  return { store, app };
}

it('compare les deux plans d’une semaine et indique le plan actif (D162)', async () => {
  const { app } = await setup(false);
  const c = (await app.inject({ method: 'GET', url: `/api/plans/compare?week=${WEEK}` })).json();
  expect(c.active).toBe('campus');
  expect(c.campus).toMatchObject({ runCount: 3, strengthCount: 2 });
  expect(c.claude).toMatchObject({ runCount: 2, runMinutes: 75, longRunMin: 45 });
  expect(c.differences.length).toBeGreaterThan(0);
  await app.close();
});

it('bascule la semaine sur l’autre plan, seulement s’il existe', async () => {
  const { app, store } = await setup(false);
  const put = (active: string, week = WEEK) =>
    app.inject({ method: 'PUT', url: `/api/plans/${week}/source`, payload: { active } });
  expect((await put('claude')).json()).toEqual({ week: WEEK, active: 'claude' });
  expect((await planWeek(store, WEEK))!.source).toBe('claude');
  expect((await put('campus')).statusCode).toBe(200);
  expect((await planWeek(store, WEEK))!.source).toBe('campus');
  expect((await put('claude', '2026-12-07')).statusCode).toBe(409);
  expect((await put('manuel')).statusCode).toBe(400);
  await app.close();
});
