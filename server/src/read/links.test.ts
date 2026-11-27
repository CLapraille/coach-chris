import { expect, it } from 'vitest';
import { buildApp } from '../app.ts';
import { importPlan } from '../plan/claude.ts';
import { MemoryStore } from '../store/store.ts';
import { pk, type Sync } from '../sync/sync.ts';

const NOW = '2026-11-27T10:00:00.000Z';
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
          id: 'facile',
          date: '2026-11-24',
          sport: 'course',
          role: 'fixe',
          titre: 'Course facile',
          dureeMin: 30,
          corps: [],
        },
        {
          id: 'longue',
          date: '2026-11-28',
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

it('rattacher puis détacher une activité hors plan (D177)', async () => {
  const store = new MemoryStore();
  await importPlan(store, PLAN, { now: NOW });
  // Course faite jeudi (2 jours après le jour prévu) : aucune règle ne la rattache.
  await store.upsert('cache', {
    id: '555',
    source: 'garmin',
    fetchedAt: NOW,
    schemaVersion: 1,
    pk: pk('activity', '2026-11-26'),
    day: '2026-11-26',
    startLocal: '2026-11-26 18:00:00',
    type: 'treadmill_running',
    durationS: 1900,
  });
  const sync = { ensureFresh: async () => {} } as unknown as Sync;
  const app = buildApp({ store, sync, clock: { today: () => '2026-11-27', now: () => NOW } });
  const url = '/api/calendar/week/2026-11-23/links';
  const key = '2026-11-23#0#facile';

  const before = (await app.inject({ method: 'GET', url: '/api/calendar/week?start=2026-11-23' })).json();
  expect(before.offPlan.map((a: { id: string }) => a.id)).toEqual(['555']);

  const linked = await app.inject({ method: 'PUT', url, payload: { sessionKey: key, activityId: '555' } });
  expect(linked.statusCode).toBe(200);
  const s = linked.json().sessions.find((x: { key: string }) => x.key === key);
  expect(s).toMatchObject({
    status: 'done',
    match: { method: 'manual', activityId: '555', day: '2026-11-26' },
  });
  expect(linked.json().offPlan).toEqual([]);

  expect(
    (await app.inject({ method: 'PUT', url, payload: { sessionKey: 'inconnue', activityId: '555' } }))
      .statusCode,
  ).toBe(409);
  expect(
    (await app.inject({ method: 'PUT', url, payload: { sessionKey: key, activityId: '999' } })).statusCode,
  ).toBe(409);

  const unlinked = await app.inject({ method: 'DELETE', url: `${url}/${encodeURIComponent(key)}` });
  expect(unlinked.json().offPlan.map((a: { id: string }) => a.id)).toEqual(['555']);
  await app.close();
});
