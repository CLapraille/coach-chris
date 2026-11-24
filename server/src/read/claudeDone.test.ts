import { expect, it } from 'vitest';
import { buildApp } from '../app.ts';
import { importPlan } from '../plan/claude.ts';
import { MemoryStore } from '../store/store.ts';
import { pk, type Sync } from '../sync/sync.ts';

const NOW = '2026-11-26T18:00:00.000Z';
const session = (id: string, date: string, sport: string, dureeMin: number) => ({
  id,
  date,
  sport,
  role: 'fixe',
  titre: id,
  dureeMin,
  corps: [],
});
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
        session('cle', '2026-11-23', 'renfo', 40),
        session('course', '2026-11-24', 'course', 30),
        session('longue', '2026-11-28', 'course', 45),
      ],
    },
  ],
};

it('plan Claude : une séance rattachée compte comme faite, au Calendrier et dans Données (D175)', async () => {
  const store = new MemoryStore();
  await importPlan(store, PLAN, { now: NOW });
  for (const [id, startLocal, type, min] of [
    ['g1', '2026-11-23 19:30:00', 'strength_training', 72],
    ['r1', '2026-11-24 19:00:00', 'running', 31],
  ] as const) {
    const day = startLocal.slice(0, 10);
    await store.upsert('cache', {
      id,
      source: 'garmin',
      fetchedAt: NOW,
      schemaVersion: 1,
      pk: pk('activity', day),
      day,
      startLocal,
      type,
      durationS: min * 60,
    });
  }
  const sync = { ensureFresh: async () => {} } as unknown as Sync;
  const app = buildApp({ store, sync, clock: { today: () => '2026-11-26', now: () => NOW } });
  const week = (await app.inject({ method: 'GET', url: '/api/calendar/week?start=2026-11-23' })).json();
  expect(week.sessions.map((s: { name: string; status: string }) => [s.name, s.status])).toEqual([
    ['cle', 'done'],
    ['course', 'done'],
    ['longue', 'todo'],
  ]);
  const status = (await app.inject({ method: 'GET', url: '/api/data/status' })).json();
  expect(status.plan).toMatchObject({ done: 2, total: 3 });
  await app.close();
});
