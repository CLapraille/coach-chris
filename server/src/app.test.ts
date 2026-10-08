import { S2_DETAILS, S2_WEEK } from '@coach-chris/domain/fixtures/campus-s2';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app.ts';
import { ToolError, type McpCaller } from './mcp/client.ts';
import { MemoryStore } from './store/store.ts';
import { Sync, type Clock } from './sync/sync.ts';

it('répond à la sonde de santé', async () => {
  const app = buildApp();
  const res = await app.inject({ method: 'GET', url: '/api/health' });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ status: 'ok' });
  await app.close();
});

/** Réponses rejouées : formes réelles des deux MCP, semaine S2 relevée le 07/10 au soir. */
function fakeMcp(responses: Record<string, (args: Record<string, unknown>) => unknown>): McpCaller {
  return {
    call: async <T>(tool: string, args: Record<string, unknown> = {}) => {
      const r = responses[tool];
      if (!r) throw new Error(`appel inattendu : ${tool}`);
      return r(args) as T;
    },
    close: async () => {},
  };
}

const clock: Clock = { today: () => '2026-10-08', now: () => '2026-10-08T05:00:00.000Z' };

const garmin = fakeMcp({
  get_activities_by_date: () => ({
    activities: [
      { id: 24631672339, type: 'running', start_time: '2026-10-06 20:58:51', duration_seconds: 1801.4 },
      { id: 24636237784, type: 'walking', start_time: '2026-10-07 09:17:35', duration_seconds: 946.9 },
    ],
  }),
  get_weigh_ins: () => ({
    measurements: [
      { date: '2026-09-29', weight_kg: 84.09 },
      { date: '2026-10-08', weight_kg: 83.39 },
    ],
  }),
  get_hrv_data: ({ date }) =>
    date === '2026-10-08'
      ? {
          last_night_avg_hrv_ms: 68,
          weekly_avg_hrv_ms: 77,
          baseline_balanced_low_ms: 81,
          baseline_balanced_upper_ms: 105,
        }
      : 'No HRV data',
  get_sleep_data: () => ({ dailySleepDTO: { sleepTimeSeconds: 26280 } }),
  get_training_readiness: () => [{ context: 'AFTER_WAKEUP_RESET', score: 76, level: 'HIGH' }],
  get_device_last_used: () => ({
    device_name: 'fenix 7X Pro Sapphire Solar',
    last_upload_time: '2026-10-08 22:11:54',
  }),
  get_body_battery: () => [
    { events: [{ type: 'SLEEP', body_battery_impact: 65 }], body_battery_level: 'HIGH' },
  ],
  get_stress_data: ({ date }) =>
    date === '2026-10-07'
      ? {
          avgStressLevel: 33,
          stressValuesArray: [
            [1, 20],
            [2, 60],
            [3, -1],
            [4, 25],
          ],
        }
      : { avgStressLevel: -1 },
});

const campus = fakeMcp({
  get_active_goal: () => [
    {
      goalType: 'back-from-injury',
      startDate: '2026-09-28 00:00',
      endDate: '2026-11-22 00:00',
      durationInWeeks: 8,
      stats: { trainingsCount: 40, trainingsDoneCount: 7 },
    },
  ],
  get_training_plan: () => ({ weeks: [{ ...S2_WEEK, goalWeek: { durationInWeeks: 8, index: 2 } }] }),
  get_session_details: ({ session_index }) => S2_DETAILS.get(session_index as number) ?? {},
});

async function syncedApp() {
  const store = new MemoryStore();
  const sync = new Sync(store, { garmin, campus }, clock);
  expect(await sync.run('garmin', 'job')).toMatchObject({ outcome: 'ok' });
  expect(await sync.run('campus', 'job')).toMatchObject({ outcome: 'ok' });
  return { store, sync, app: buildApp({ store, sync, clock }) };
}

describe('BFF en lecture', () => {
  it('GET /api/calendar/week : séances faites figées, reste placé selon les règles', async () => {
    const { app } = await syncedApp();
    const res = await app.inject({ method: 'GET', url: '/api/calendar/week?start=2026-10-07' });
    expect(res.statusCode).toBe(200);
    const w = res.json();
    expect(w.start).toBe('2026-10-05');
    expect(w.sessions.map((s: { day: string; fixed: boolean }) => [s.day, s.fixed])).toEqual([
      ['2026-10-07', true], // renfo S2-1 validé mercredi sans montre
      ['2026-10-06', true], // course S2-1, lien Campus
      ['2026-10-08', false],
      ['2026-10-09', false],
      ['2026-10-10', false],
    ]);
    expect(w.offPlan).toEqual([]);
    expect(w.warnings).toEqual([]);
  });

  it('GET /api/calendar/week : semaine sans plan → plan null, aucune séance inventée', async () => {
    const { app } = await syncedApp();
    const w = (await app.inject({ method: 'GET', url: '/api/calendar/week?start=2026-10-19' })).json();
    expect(w.plan).toBeNull();
    expect(w.sessions).toEqual([]);
  });

  it('GET /api/calendar/week : date invalide → 400', async () => {
    const { app } = await syncedApp();
    expect((await app.inject({ method: 'GET', url: '/api/calendar/week?start=demain' })).statusCode).toBe(
      400,
    );
  });

  it('GET /api/today : prochaine séance, forme, poids, signaux', async () => {
    const { app } = await syncedApp();
    const t = (await app.inject({ method: 'GET', url: '/api/today' })).json();
    expect(t.goal).toMatchObject({ goalType: 'back-from-injury', weekIndex: 2 });
    expect(t.nextSession).toMatchObject({ displayName: 'Retour de blessure', day: '2026-10-08' });
    expect(t.form.night.hrvPosition).toEqual({ lastNight: 'below', weekly: 'below' });
    expect(t.form.weight).toMatchObject({ deltaKg: -0.7, direction: 'down' });
    expect(t.signals.map((s: { id: string }) => s.id)).toEqual(['hrv-weekly-below']);
    // Course de mardi + renfo validé sans montre (30 min prévues).
    expect(t.volume.weeks.at(-1)).toEqual({ start: '2026-10-05', run: 30, bike: 0, strength: 30 });
    expect(t.mobility).toMatchObject({ testsMissing: true, evening: [{ code: 'C3' }] });
    expect(t.form.stressYesterday).toEqual({ avg: 33, restPercent: 67 });
    expect(t.form.night).toMatchObject({ bodyBattery: { sleepGain: 65, level: 'HIGH' } });
    expect(t.form.hrvHistory.at(-1)).toEqual({ day: '2026-10-08', ms: 68 });
    expect(t.form.hrvHistory.at(-2)).toEqual({ day: '2026-10-07', ms: null });
    expect(t.nextSession.blocks).toEqual([]);
    expect(t.thenSession).toMatchObject({ sport: 'strength', day: '2026-10-09' });
    expect(t.evenings['2026-10-09']).toMatchObject({ reason: expect.stringContaining('renforcement') });
  });

  it("une nuit sans VFC reste sans VFC : pas d'interpolation", async () => {
    const { store } = await syncedApp();
    const doc = await store.get('cache', '2026-10-07', 'night#2026-10');
    expect(doc).toMatchObject({ hrv: null, sleep: { seconds: 26280 } });
  });
});

describe('synchro', () => {
  it('jeton refusé → « jeton expiré », journalisé', async () => {
    const store = new MemoryStore();
    const broken = fakeMcp({
      get_active_goal: () => {
        throw new ToolError(
          "Campus Coach token refresh failed (401). Run 'campus-coach-auth' to sign in again.",
        );
      },
    });
    const sync = new Sync(store, { garmin, campus: broken }, clock);
    expect(await sync.run('campus', 'button')).toMatchObject({ outcome: 'token-expired' });
    const log = await store.list('ops', 'sync-log');
    expect(log).toMatchObject([{ source: 'campus', origin: 'button', outcome: 'token-expired' }]);
    expect(await store.get('ops', 'sync-state:campus', 'sync-state')).toBeUndefined();
  });

  it('le plan est versionné : un contenu identique ne crée pas de nouvelle version', async () => {
    const { store, sync } = await syncedApp();
    await sync.run('campus', 'job');
    const versions = (await store.list('plan', '2026-10-05')).filter((d) => d.id.startsWith('v:'));
    expect(versions).toHaveLength(1);
  });

  it('plan : semaines publiées jusqu’à la fin de l’objectif, détail relu seulement si la semaine change', async () => {
    const s3 = {
      ...S2_WEEK,
      weekId: 'w3',
      weekDate: '2026-10-12 00:00',
      sessions: S2_WEEK.sessions.map((x) => ({
        ...x,
        weekId: 'w3',
        weekDate: '2026-10-12 00:00',
        status: 'todo',
      })),
    };
    const ranges: unknown[] = [];
    let details = 0;
    const counting = fakeMcp({
      get_active_goal: () => [{ endDate: '2026-11-22 00:00' }],
      get_training_plan: (args) => {
        ranges.push(args);
        return { weeks: [S2_WEEK, s3] };
      },
      get_session_details: () => {
        details++;
        return {};
      },
    });
    const store = new MemoryStore();
    const sync = new Sync(store, { garmin, campus: counting }, clock);
    await sync.run('campus', 'job');
    expect(details).toBe(10);
    expect(ranges[0]).toMatchObject({ end_date: '2026-11-22' });
    await sync.run('campus', 'job');
    // Seule la semaine en cours (S2) est relue : S3 n'a pas changé.
    expect(details).toBe(15);
  });

  it('deux synchros simultanées de la même source ne font qu’un passage', async () => {
    const store = new MemoryStore();
    const sync = new Sync(store, { garmin, campus }, clock);
    const [a, b] = [sync.run('campus', 'open'), sync.run('campus', 'button')];
    expect(a).toBe(b);
    await a;
  });
});

describe('mobilité et état des données', () => {
  it('cocher une routine : visible dans Aujourd’hui, décochable, rattrapage limité à J-3', async () => {
    const { app } = await syncedApp();
    const put = (date: string, done: boolean) =>
      app.inject({ method: 'PUT', url: `/api/mobility/log/${date}/morning`, payload: { done } });
    expect((await put('2026-10-08', true)).statusCode).toBe(200);
    expect((await put('2026-10-06', true)).statusCode).toBe(200);
    expect((await put('2026-10-04', true)).statusCode).toBe(409);
    expect((await put('2026-10-09', true)).statusCode).toBe(409);
    let m = (await app.inject({ method: 'GET', url: '/api/today' })).json().mobility;
    expect(m.checked).toEqual({ morning: true, evening: false });
    expect(m.regularity.morning).toEqual({ done: 2, days: 7, streak: 1 });
    await put('2026-10-08', false);
    m = (await app.inject({ method: 'GET', url: '/api/today' })).json().mobility;
    expect(m.checked.morning).toBe(false);
  });

  it('GET /api/data/status : dernier passage par source', async () => {
    const { app } = await syncedApp();
    const st = (await app.inject({ method: 'GET', url: '/api/data/status' })).json();
    expect(st.sources.garmin).toMatchObject({ lastOkAt: clock.now(), last: { outcome: 'ok' } });
    expect(st.sources.campus.last.outcome).toBe('ok');
    expect(st.missingNights).toEqual([]);
    expect(st.device).toEqual({ name: 'fenix 7X Pro Sapphire Solar', lastUpload: '2026-10-08 22:11:54' });
    expect(st.plan).toMatchObject({ weekIndex: 2, durationInWeeks: 8, done: 2, total: 5 });
    expect(st.freshness.sleep).toMatchObject({ last: '2026-10-08', present: 14, days: 14 });
    // La VFC n'est fournie que pour la nuit du 08/10 : les 13 autres nuits relues sont des manques, pas des estimations.
    expect(st.freshness.hrv).toMatchObject({ last: '2026-10-08', lastMs: 68 });
    expect(st.freshness.hrv.missing).toHaveLength(13);
    expect(st.freshness.activities.lastRun).toBe('2026-10-06 20:58:51');
    expect(st.freshness.weight).toEqual({ last: '2026-10-08', kg: 83.39 });
    // Horloge figée : même instant pour les deux passages, l'ordre n'est pas significatif ici.
    expect(st.log.map((l: { source: string; origin: string }) => `${l.source}:${l.origin}`).sort()).toEqual([
      'campus:job',
      'garmin:job',
    ]);
  });
});

describe('Calendrier', () => {
  const week = async (app: Awaited<ReturnType<typeof syncedApp>>['app']) =>
    (await app.inject({ method: 'GET', url: '/api/calendar/week?start=2026-10-05' })).json();
  const move = (app: Awaited<ReturnType<typeof syncedApp>>['app'], key: string, day: string) =>
    app.inject({ method: 'PUT', url: '/api/calendar/week/2026-10-05/placement', payload: { key, day } });
  const dayOf = (w: { sessions: { name: string; day: string }[] }, name: string) =>
    w.sessions.find((s) => s.name === name)?.day;

  it('déplacer une séance : gardé, avertissement si deux courses se suivent', async () => {
    const { app } = await syncedApp();
    const before = await week(app);
    const c3 = before.sessions.find((s: { name: string }) => s.name === 'Retour_Blessure_S2_3');
    const res = await move(app, c3.key, '2026-10-09');
    expect(res.statusCode).toBe(200);
    // Vendredi portait le renfo S2-2 : les deux séances sont échangées.
    const after = res.json();
    expect(dayOf(after, 'Retour_Blessure_S2_3')).toBe('2026-10-09');
    expect(dayOf(after, 'MIX - MID - BLESSURE - SEMAINE 2 SEANCE 2')).toBe('2026-10-10');
    expect(after.manual).toBe(true);
    expect(after.warnings.map((w: { rule: string }) => w.rule)).toContain('consecutive-runs');
    // Relu depuis le stockage.
    expect(dayOf(await week(app), 'Retour_Blessure_S2_3')).toBe('2026-10-09');
  });

  it('une séance faite ne se déplace pas ; un jour passé est refusé', async () => {
    const { app } = await syncedApp();
    const w = await week(app);
    const done = w.sessions.find((s: { fixed: boolean }) => s.fixed);
    expect((await move(app, done.key, '2026-10-11')).statusCode).toBe(409);
    const todo = w.sessions.find((s: { fixed: boolean; status: string }) => !s.fixed);
    expect((await move(app, todo.key, '2026-10-06')).statusCode).toBe(409);
  });

  it('revenir à la proposition efface le placement manuel', async () => {
    const { app } = await syncedApp();
    const w = await week(app);
    const c3 = w.sessions.find((s: { name: string }) => s.name === 'Retour_Blessure_S2_3');
    await move(app, c3.key, '2026-10-11');
    const reset = await app.inject({ method: 'DELETE', url: '/api/calendar/week/2026-10-05/placement' });
    expect(reset.json().manual).toBe(false);
    expect(dayOf(reset.json(), 'Retour_Blessure_S2_3')).toBe('2026-10-10');
  });

  it('vue mois : les semaines qui recouvrent octobre, disponibilité et routines par jour', async () => {
    const { app } = await syncedApp();
    const m = (await app.inject({ method: 'GET', url: '/api/calendar/month?m=2026-10' })).json();
    expect(m.weeks.map((w: { start: string }) => w.start)).toEqual([
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
    ]);
    const s2 = m.weeks[1];
    expect(s2.readiness['2026-10-08']).toBe(76);
    expect(s2.routines['2026-10-08']).toEqual({ morning: false, evening: false });
    expect(m.weeks[3].plan).toBeNull();
  });
});

describe('Mobilité : tests → proposition → bloc validé', () => {
  // Résultats d'exemple : rotation de hanche et gros orteil faibles (zones déclarées → priorité), Thomas au-dessus.
  const RESULTS = {
    hipInternalRotationDeg: { left: 26, right: 27 },
    bigToeExtensionDeg: { left: 40, right: 44 },
    thomas: { left: 'above', right: 'level' },
    kneeToWallCm: { left: 12, right: 11 },
  };

  it('sans tests : zones déclarées signalées, pas de proposition ni de routine du soir', async () => {
    const { app } = await syncedApp();
    const m = (await app.inject({ method: 'GET', url: '/api/mobility' })).json();
    expect(m.proposal).toBeNull();
    expect(m.evening).toEqual([]);
    expect(m.zones.filter((z: { status: string }) => z.status === 'declared')).toHaveLength(4);
    expect(m.morning.map((e: { code: string }) => e.code)).toEqual(['M1', 'M2', 'M3', 'M4']);
  });

  it('résultats invalides refusés', async () => {
    const { app } = await syncedApp();
    const bad = await app.inject({
      method: 'POST',
      url: '/api/mobility/tests',
      payload: { kneeToWallCm: { left: -3, right: 10 } },
    });
    expect(bad.statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/mobility/tests', payload: {} })).statusCode).toBe(
      400,
    );
  });

  it('parcours complet', async () => {
    const { app } = await syncedApp();
    expect(
      (await app.inject({ method: 'POST', url: '/api/mobility/tests', payload: RESULTS })).statusCode,
    ).toBe(200);
    let m = (await app.inject({ method: 'GET', url: '/api/mobility' })).json();
    const status = Object.fromEntries(
      m.zones.map((z: { zone: string; status: string }) => [z.zone, z.status]),
    );
    expect(status).toMatchObject({
      'hip-rotation': 'priority',
      'big-toe': 'priority',
      'hip-flexors': 'priority',
      ankle: 'good',
      'foot-ankle-control': 'declared',
      'hip-knee-control': 'untested',
    });
    expect(m.tests.kneeToWallCm).toEqual({ day: '2026-10-08', value: { left: 12, right: 11 } });
    const codes = m.proposal.map((p: { code: string }) => p.code);
    expect(codes).toHaveLength(3);

    // Une proposition périmée est refusée ; la bonne est acceptée une seule fois.
    const accept = (c: string[]) =>
      app.inject({ method: 'POST', url: '/api/mobility/blocks/accept', payload: { codes: c } });
    expect((await accept(['R1'])).statusCode).toBe(409);
    expect((await accept(codes)).statusCode).toBe(200);
    expect((await accept(codes)).statusCode).toBe(409);

    m = (await app.inject({ method: 'GET', url: '/api/mobility' })).json();
    expect(m.block).toMatchObject({ start: '2026-10-08', end: '2026-10-21' });
    expect(m.proposal).toBeNull();
    expect(m.evening.map((e: { slot: string }) => e.slot)).toEqual(['socle', 'socle', 'socle', 'day']);

    // L'écran Aujourd'hui suit le bloc.
    const t = (await app.inject({ method: 'GET', url: '/api/today' })).json();
    expect(t.mobility.testsMissing).toBe(false);
    expect(t.mobility.evening).toHaveLength(4);
  });

  it('refaire un seul test garde les autres résultats', async () => {
    const { app } = await syncedApp();
    await app.inject({ method: 'POST', url: '/api/mobility/tests', payload: RESULTS });
    await app.inject({
      method: 'POST',
      url: '/api/mobility/tests',
      payload: { bigToeExtensionDeg: { left: 58, right: 60 } },
    });
    const m = (await app.inject({ method: 'GET', url: '/api/mobility' })).json();
    expect(m.tests.bigToeExtensionDeg.value).toEqual({ left: 58, right: 60 });
    expect(m.tests.hipInternalRotationDeg.value).toEqual({ left: 26, right: 27 });
  });
});
