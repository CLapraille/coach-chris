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
  });
});
