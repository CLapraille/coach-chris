import { expect, it } from 'vitest';
import { buildApp } from '../app.ts';
import { importPlan, importSeason } from '../plan/claude.ts';
import { MemoryStore } from '../store/store.ts';
import { pk, type Sync } from '../sync/sync.ts';
import { addToInbox } from './inbox.ts';
import { setFoot, setSessionCheckin } from './checkin.ts';

const NOW = '2026-11-26T18:00:00.000Z';
const PLAN = {
  format: 'coach-chris.plan/v1',
  source: 'claude',
  generatedAt: '2026-11-20',
  athlete: { fcFacileCourseMax: 140, ftpW: 159 },
  block: {
    id: 'base-1',
    phase: 'Base',
    name: 'Base · bloc 1',
    start: '2026-11-23',
    end: '2026-12-06',
    objectif: 'Reprise sans douleur',
  },
  routines: {},
  weeks: [
    {
      index: 1,
      start: '2026-11-23',
      focus: 'Chevilles et pieds',
      sessions: [
        {
          id: 's1-lun-cle',
          date: '2026-11-23',
          sport: 'renfo',
          role: 'cle',
          titre: 'Séance clé',
          dureeMin: 40,
          corps: [],
        },
        {
          id: 's1-mar-course',
          date: '2026-11-24',
          sport: 'course',
          role: 'fixe',
          titre: 'Course facile',
          dureeMin: 30,
          corps: [],
        },
        {
          id: 's1-sam-longue',
          date: '2026-11-28',
          sport: 'course',
          role: 'fixe',
          titre: 'Sortie longue',
          dureeMin: 45,
          corps: [],
        },
      ],
    },
    {
      index: 2,
      start: '2026-11-30',
      sessions: [
        {
          id: 's2-mar-course',
          date: '2026-12-01',
          sport: 'course',
          role: 'fixe',
          titre: 'Course facile',
          dureeMin: 35,
          corps: [],
        },
      ],
    },
  ],
};

async function activity(
  store: MemoryStore,
  id: string,
  startLocal: string,
  type: string,
  min: number,
  km?: number,
) {
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
    ...(km && { distanceM: km * 1000 }),
    avgHr: 128,
  });
}

it('bilan pour Claude : semaines, séances faites ou non, douleurs, suite du plan (D171)', async () => {
  const store = new MemoryStore();
  await importPlan(store, PLAN, { now: NOW });
  await importSeason(
    store,
    {
      format: 'coach-chris.season/v1',
      season: '2027',
      events: [
        {
          id: 'boucles',
          name: 'Les Boucles Ardennaises',
          date: '2027-06-05',
          dateConfirmed: true,
          place: 'La Roche',
          country: 'Belgique',
          terrain: 'trail',
          priority: 'A',
          options: [{ km: 21, dPlus: 600 }],
          chosen: 0,
        },
      ],
    },
    NOW,
  );
  await activity(store, 'g1', '2026-11-23 19:30:00', 'strength_training', 72);
  await activity(store, 'r1', '2026-11-24 19:00:00', 'running', 31, 4.9);
  await activity(store, 'v1', '2026-11-25 07:59:00', 'virtual_ride', 47);
  await setFoot(store, '2026-11-24', 2, NOW);
  await setFoot(store, '2026-11-25', 4, NOW);
  await setSessionCheckin(store, '2026-11-24', 's1-mar-course', { shin: 1, rpe: 4 }, NOW);
  await addToInbox(store, 'https://youtube.com/shorts/x', 'Mollets excentriques', NOW);

  const app = buildApp({ store, sync: {} as Sync, clock: { today: () => '2026-11-26', now: () => NOW } });
  const res = await app.inject({ method: 'GET', url: '/api/brief?weeks=2' });
  expect(res.statusCode).toBe(200);
  const text: string = res.json().text;
  expect(text).toContain('## Bloc en cours\n- Base · bloc 1 (phase Base), du 23/11 au 06/12');
  expect(text).toContain('- fcFacileCourseMax : 140');
  expect(text).toContain('- A · Les Boucles Ardennaises · 05/06 2027 · trail · 21 km D+600 · dans 191 jours');
  expect(text).toContain('## Semaine du 23/11 (plan Claude, Chevilles et pieds)');
  expect(text).toContain(
    '- FAITE lun 23/11 (72 min · FC 128) · Séance clé (renfo, clé, prévue lun 23/11, 40 min)',
  );
  expect(text).toContain(
    '- FAITE mar 24/11 (31 min · 4,9 km · FC 128) · Course facile (course, fixe, prévue mar 24/11, 30 min) · tibia 1/10 · effort 4/10',
  );
  expect(text).toContain('- à venir · Sortie longue (course, fixe, prévue sam 28/11, 45 min)');
  expect(text).toContain('- Hors plan : mer 25/11 vélo (47 min · FC 128)');
  expect(text).toContain('- Volume réel : course 31 min en 1 (4,9 km), vélo 47 min en 1, renfo 72 min en 1');
  expect(text).toContain('- Pied au premier pas : mar 2 · mer 4');
  expect(text).toContain('- Semaine du 30/11 : Course facile (course, 35 min)');
  expect(text).toContain('- Mollets excentriques : https://youtube.com/shorts/x');
  expect(text).toContain('## À compléter par moi');
  expect((await app.inject({ method: 'GET', url: '/api/brief?weeks=40' })).statusCode).toBe(400);
  await app.close();
});
