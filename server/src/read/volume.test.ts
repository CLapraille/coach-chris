import { expect, it } from 'vitest';
import { buildApp } from '../app.ts';
import { importPlan } from '../plan/claude.ts';
import { MemoryStore } from '../store/store.ts';
import { pk, type Sync } from '../sync/sync.ts';

const NOW = '2026-11-27T10:00:00.000Z';
const course = (id: string, date: string, dureeMin: number) => ({
  id,
  date,
  sport: 'course',
  role: 'fixe',
  titre: id,
  dureeMin,
  echauffement: 'ech',
  retourAuCalme: 'rac',
  corps: [],
});
const PLAN = {
  format: 'coach-chris.plan/v1',
  source: 'claude',
  generatedAt: '2026-11-20',
  block: { id: 'b', phase: 'Base', name: 'Base', start: '2026-11-23', end: '2026-11-29' },
  routines: {
    ech: { name: 'Échauffement course', dureeMin: 8, steps: [] },
    rac: { name: 'Retour au calme', dureeMin: 9, steps: [] },
  },
  weeks: [
    {
      index: 1,
      start: '2026-11-23',
      sessions: [course('facile', '2026-11-26', 30), course('longue', '2026-11-28', 45)],
    },
  ],
};

it('volume : course prévue = corps de séance (30 + 45), réalisé = temps couru (D180)', async () => {
  const store = new MemoryStore();
  await importPlan(store, PLAN, { now: NOW });
  // Course facile faite jeudi : 47 min dont 8 de marche d'échauffement et 9 de retour au calme.
  await store.upsert('cache', {
    id: '1',
    source: 'garmin',
    fetchedAt: NOW,
    schemaVersion: 1,
    pk: pk('activity', '2026-11-26'),
    day: '2026-11-26',
    startLocal: '2026-11-26 18:00:00',
    type: 'treadmill_running',
    durationS: 2820,
  });
  await store.upsert('cache', {
    id: '1',
    pk: pk('detail', '2026-11-26'),
    source: 'garmin',
    fetchedAt: NOW,
    schemaVersion: 1,
    detail: {
      id: '1',
      startLocal: '2026-11-26 18:00:00',
      type: 'treadmill_running',
      durationS: 2820,
      zones: [],
      laps: [
        { n: 1, durationS: 480, movingS: 480, avgCadence: 115 },
        { n: 2, durationS: 1800, movingS: 1800, avgCadence: 162 },
        { n: 3, durationS: 540, movingS: 540, avgCadence: 100 },
      ],
    },
  });
  const sync = { ensureFresh: async () => {} } as unknown as Sync;
  const app = buildApp({ store, sync, clock: { today: () => '2026-11-27', now: () => NOW } });
  const t = (await app.inject({ method: 'GET', url: '/api/today' })).json();
  expect(t.volume.planned.run).toBe(75);
  expect(t.volume.remaining.run).toBe(45);
  expect(t.volume.weeks.at(-1).run).toBe(30);
  await app.close();
});
