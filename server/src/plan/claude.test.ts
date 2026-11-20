import { S2_DETAILS, S2_WEEK } from '@coach-chris/domain/fixtures/campus-s2';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.ts';
import { planWeek } from '../read/cache.ts';
import { MemoryStore } from '../store/store.ts';
import type { Clock, Sync } from '../sync/sync.ts';
import { ImportError, importPlan, importSeason, setWeekSource } from './claude.ts';

const PLAN = {
  format: 'coach-chris.plan/v1',
  source: 'claude',
  generatedAt: '2026-11-20',
  block: { id: 'base-s1', phase: 'Base', name: 'Base · semaine 1', start: '2026-11-23', end: '2026-11-29' },
  routines: {
    'ech-course': {
      name: 'Échauffement course',
      dureeMin: 8,
      steps: [{ name: 'Marche rapide', duree: '3 min' }],
    },
    'rac-course': { name: 'Retour au calme', dureeMin: 9, steps: [] },
    'routine-bureau': { name: 'Routine bureau', dureeMin: 10, steps: [] },
    inutilisee: { name: 'Jamais citée', dureeMin: 5, steps: [] },
  },
  weeks: [
    {
      index: 1,
      start: '2026-11-23',
      focus: 'Chevilles et pieds',
      sessions: [
        {
          id: 's1-lun-course',
          date: '2026-11-23',
          sport: 'course',
          role: 'fixe',
          titre: 'Course facile',
          dureeMin: 30,
          echauffement: 'ech-course',
          retourAuCalme: 'rac-course',
          corps: [{ bloc: '30 min', cible: 'FC ≤ 140' }],
        },
        {
          id: 's1-jeu-flex',
          date: '2026-11-26',
          sport: 'velo',
          role: 'flexible',
          titre: 'Vélo endurance',
          dureeMin: 45,
          corps: [{ bloc: '45 min' }],
          alternatives: {
            course: {
              titre: 'Course facile',
              dureeMin: 35,
              echauffement: 'ech-course',
              corps: [{ bloc: '35 min' }],
            },
          },
        },
      ],
    },
  ],
};

const NOW = '2026-11-20T08:00:00.000Z';

describe('importPlan', () => {
  it('stocke la semaine, active Claude et ne garde que les routines citées', async () => {
    const store = new MemoryStore();
    const r = await importPlan(store, PLAN, { now: NOW });
    expect(r).toEqual({
      block: 'base-s1',
      weeks: [{ weekDate: '2026-11-23', changed: true, active: 'claude' }],
    });
    const week = await planWeek(store, '2026-11-23');
    expect(week?.source).toBe('claude');
    expect(week?.sessions.map((s) => [s.displayName, s.sport, s.day])).toEqual([
      ['Course facile', 'run', '2026-11-23'],
      ['Vélo endurance', 'bike', '2026-11-26'],
    ]);
    expect(Object.keys(week!.claude!.routines).sort()).toEqual([
      'ech-course',
      'rac-course',
      'routine-bureau',
    ]);
  });

  it('archive une version seulement quand le contenu change', async () => {
    const store = new MemoryStore();
    await importPlan(store, PLAN, { now: NOW });
    const again = await importPlan(store, PLAN, { now: '2026-11-21T08:00:00.000Z' });
    expect(again.weeks[0]!.changed).toBe(false);
    const edited = structuredClone(PLAN);
    edited.weeks[0]!.sessions[0]!.dureeMin = 32;
    expect((await importPlan(store, edited, { now: '2026-11-22T08:00:00.000Z' })).weeks[0]!.changed).toBe(
      true,
    );
    const versions = (await store.list('plan', '2026-11-23')).filter((d) => d.kind === 'claude-version');
    expect(versions).toHaveLength(2);
  });

  it('en mode côte à côte, la semaine reste à Campus', async () => {
    const store = new MemoryStore();
    await store.upsert('plan', {
      id: 'latest',
      source: 'campus',
      fetchedAt: NOW,
      schemaVersion: 1,
      kind: 'latest',
      weekDate: '2026-11-23',
      week: { ...S2_WEEK, weekDate: '2026-11-23' },
      details: S2_DETAILS,
    });
    const r = await importPlan(store, PLAN, { now: NOW, activate: false });
    expect(r.weeks[0]!.active).toBe('campus');
    expect((await planWeek(store, '2026-11-23'))?.source).toBe('campus');
    await setWeekSource(store, '2026-11-23', 'claude', NOW);
    expect((await planWeek(store, '2026-11-23'))?.source).toBe('claude');
  });

  it('la séance flexible suit le réglage de la saison', async () => {
    const store = new MemoryStore();
    await importPlan(store, PLAN, { now: NOW });
    const app = buildApp({ store, sync: {} as Sync, clock: { today: () => '2026-11-20', now: () => NOW } });
    await app.inject({ method: 'PUT', url: '/api/season/settings', payload: { flexDefault: 'course' } });
    const flex = (await planWeek(store, '2026-11-23'))!.sessions[1]!;
    expect([flex.sport, flex.durationMin]).toEqual(['run', 35]);
    await app.close();
  });

  it('refuse un plan mal formé ou incohérent, avec la liste des problèmes', async () => {
    const store = new MemoryStore();
    await expect(importPlan(store, { ...PLAN, format: 'v0' }, { now: NOW })).rejects.toBeInstanceOf(
      ImportError,
    );
    const bad = structuredClone(PLAN);
    bad.weeks[0]!.sessions[0]!.retourAuCalme = 'absente';
    await expect(importPlan(store, bad, { now: NOW })).rejects.toThrow(/routine inconnue « absente »/);
    expect(await store.list('plan', '2026-11-23')).toEqual([]);
  });
});

describe('saison', () => {
  const clock: Clock = { today: () => '2026-11-20', now: () => NOW };
  const SEASON = {
    format: 'coach-chris.season/v1',
    season: '2027',
    events: [
      {
        id: 'boucles',
        name: 'Les Boucles Ardennaises',
        date: '2027-06-05',
        dateConfirmed: true,
        place: 'La Roche-en-Ardenne',
        country: 'Belgique',
        terrain: 'trail',
        priority: 'A',
        options: [{ km: 21, dPlus: 600 }],
        chosen: 0,
        series: 'Lupulus Trophy',
      },
      {
        id: 'sylvester',
        name: 'Sylvesterlaf',
        date: '2026-12-31',
        dateConfirmed: true,
        place: 'Rambrouch',
        country: 'Luxembourg',
        terrain: 'route',
        priority: 'C',
        options: [{ km: 10 }],
        chosen: 0,
      },
    ],
  };

  it('GET /api/season renvoie la saison triée et le réglage par défaut', async () => {
    const store = new MemoryStore();
    await importSeason(store, SEASON, NOW);
    const app = buildApp({ store, sync: {} as Sync, clock });
    const res = await app.inject({ method: 'GET', url: '/api/season' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.events.map((e: { id: string }) => e.id)).toEqual(['sylvester', 'boucles']);
    expect(body.nextA).toBe('boucles');
    expect(body.settings).toEqual({ flexDefault: 'velo' });
    await app.close();
  });

  it('PUT /api/season/settings valide la valeur', async () => {
    const app = buildApp({ store: new MemoryStore(), sync: {} as Sync, clock });
    const bad = await app.inject({
      method: 'PUT',
      url: '/api/season/settings',
      payload: { flexDefault: 'rameur' },
    });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({
      method: 'PUT',
      url: '/api/season/settings',
      payload: { flexDefault: 'course' },
    });
    expect(ok.json()).toEqual({ flexDefault: 'course' });
    await app.close();
  });
});
