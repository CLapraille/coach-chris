import { expect, it } from 'vitest';
import { buildApp } from '../app.ts';
import { importPlan } from '../plan/claude.ts';
import { MemoryStore } from '../store/store.ts';
import { pk, type Sync } from '../sync/sync.ts';
import { planWeek } from './cache.ts';
import { reviewWeekFor } from './review.ts';

const NOW = '2026-11-29T19:00:00.000Z';
const run = (id: string, date: string, dureeMin: number, role = 'fixe') => ({
  id,
  date,
  sport: 'course',
  role,
  titre: 'Course',
  dureeMin,
  corps: [],
});
const PLAN = {
  format: 'coach-chris.plan/v1',
  source: 'claude',
  generatedAt: '2026-11-20',
  block: { id: 'b', phase: 'Base', name: 'Base', start: '2026-11-23', end: '2026-12-06' },
  routines: {},
  weeks: [
    {
      index: 1,
      start: '2026-11-23',
      sessions: [run('s1-lun', '2026-11-23', 30), run('s1-dim', '2026-11-29', 45)],
    },
    {
      index: 2,
      start: '2026-11-30',
      sessions: [
        run('s2-lun', '2026-11-30', 35),
        {
          id: 's2-mer',
          date: '2026-12-02',
          sport: 'velo',
          role: 'flexible',
          titre: 'Vélo',
          dureeMin: 50,
          corps: [],
          alternatives: { course: { titre: 'Course facile', dureeMin: 40, corps: [] } },
        },
        run('s2-dim', '2026-12-06', 50),
      ],
    },
  ],
};

async function setup() {
  const store = new MemoryStore();
  await importPlan(store, PLAN, { now: NOW });
  const activity = (id: string, day: string, min: number) =>
    store.upsert('cache', {
      id,
      source: 'garmin',
      fetchedAt: NOW,
      schemaVersion: 1,
      pk: pk('activity', day),
      day,
      startLocal: `${day} 18:00:00`,
      type: 'running',
      durationS: min * 60,
    });
  // Trois semaines d'historique (charge chronique), puis la semaine revue : 31 + 46 = 77 min.
  await activity('h1', '2026-11-04', 60);
  await activity('h2', '2026-11-11', 65);
  await activity('h3', '2026-11-18', 70);
  await activity('1', '2026-11-23', 31);
  await activity('2', '2026-11-29', 46);
  const app = buildApp({ store, sync: {} as Sync, clock: { today: () => '2026-11-29', now: () => NOW } });
  for (const [date, foot] of [
    ['2026-11-23', 2],
    ['2026-11-25', 1],
    ['2026-11-27', 2],
    ['2026-11-29', 1],
  ] as const) {
    await app.inject({ method: 'PUT', url: `/api/checkins/${date}`, payload: { foot } });
  }
  return { store, app };
}

it('semaine à revoir : la semaine en cours le week-end, sinon la précédente', () => {
  expect(reviewWeekFor('2026-11-29', '2026-11-23')).toBe('2026-11-23');
  expect(reviewWeekFor('2026-11-30', '2026-11-30')).toBe('2026-11-23');
});

it('dimanche : proposition verte, acceptée, puis appliquée à la semaine suivante (D161)', async () => {
  const { app, store } = await setup();
  const res = (await app.inject({ method: 'GET', url: '/api/review' })).json();
  expect(res.week).toBe('2026-11-23');
  expect(res.proposal.verdict).toBe('progress');
  expect(res.proposal.completion).toEqual({ fixedDone: 2, fixedTotal: 2, done: 2, total: 2 });
  expect(res.proposal.volume).toMatchObject({ actual: 77, chronic: 68, plannedNext: 85, proposedNext: 85 });
  expect(res.proposal.adjustments).toEqual({});
  // Avec la 3e course (40 min), la semaine passerait à 125 min : au-delà de +15 %.
  expect(res.proposal.flex).toBe('velo');
  expect(res.accepted).toBeNull();

  // Avant acceptation, la semaine suivante reste telle que le plan l'a écrite.
  expect((await planWeek(store, '2026-11-30'))!.sessions[1]!.sport).toBe('bike');

  const acc = await app.inject({
    method: 'POST',
    url: '/api/review/2026-11-23/accept',
    payload: { durations: { 's2-dim': 45 }, flex: 'course' },
  });
  // Retouches de l'utilisateur : sortie longue raccourcie, séance flexible en course malgré tout.
  expect(acc.json()).toMatchObject({ verdict: 'progress', flex: 'course', durations: { 's2-dim': 45 } });
  const next = (await planWeek(store, '2026-11-30'))!.sessions;
  expect(next.map((s) => [s.name, s.sport, s.durationMin])).toEqual([
    ['s2-lun', 'run', 35],
    ['s2-mer', 'run', 40],
    ['s2-dim', 'run', 45],
  ]);

  await app.inject({ method: 'DELETE', url: '/api/review/2026-11-23' });
  expect((await planWeek(store, '2026-11-30'))!.sessions[2]!.durationMin).toBe(50);
  await app.close();
});

it('semaine Campus : pas de revue', async () => {
  const app = buildApp({
    store: new MemoryStore(),
    sync: {} as Sync,
    clock: { today: () => '2026-11-29', now: () => NOW },
  });
  const res = (await app.inject({ method: 'GET', url: '/api/review' })).json();
  expect(res.proposal).toBeNull();
  expect(res.unavailable).toMatch(/Campus/);
  expect(
    (await app.inject({ method: 'POST', url: '/api/review/2026-11-23/accept', payload: {} })).statusCode,
  ).toBe(409);
  await app.close();
});
