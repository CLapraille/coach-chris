import { S1_3_BLOCKS } from '@coach-chris/domain/fixtures/run-s1-3';
import { S2_DETAILS, S2_WEEK } from '@coach-chris/domain/fixtures/campus-s2';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.ts';
import { mcpFromEnv, ToolError, ToolNotAllowedError, type McpCaller } from '../mcp/client.ts';
import { MemoryStore } from '../store/store.ts';
import { Sync, type Clock } from '../sync/sync.ts';

interface Call {
  tool: string;
  args: Record<string, unknown>;
  write: boolean;
}

/** MCP rejoué qui note chaque appel et le drapeau d'écriture reçu. */
function recorder(responses: Record<string, (args: Record<string, unknown>) => unknown>) {
  const calls: Call[] = [];
  const mcp: McpCaller = {
    call: async <T>(tool: string, args: Record<string, unknown> = {}, opts: { write?: boolean } = {}) => {
      const r = responses[tool];
      if (!r) throw new Error(`appel inattendu : ${tool}`);
      calls.push({ tool, args, write: opts.write === true });
      return r(args) as T;
    },
    close: async () => {},
  };
  return { mcp, calls, writes: () => calls.filter((c) => c.write) };
}

const RUN_0810 = 24650000001;
/** Course du jeudi 08/10, rattachée par règle à Retour_Blessure_S2_2 (pas encore validée dans Campus). */
const ACTIVITY = {
  id: RUN_0810,
  name: 'Messancy Course à pied',
  type: 'running',
  start_time_local: '2026-10-08T20:30:00.0',
  start_time_gmt: '2026-10-08T18:30:00.0',
  duration_seconds: 2160.4,
  distance_meters: 4520.5,
  avg_hr_bpm: 131,
  calories: 330,
  avg_cadence: 141.6,
  elevation_gain_meters: 30,
  elevation_loss_meters: 31,
  workout_rpe: 10,
  workout_feel: 50,
};

function setup(
  overrides: {
    garmin?: Record<string, (a: Record<string, unknown>) => unknown>;
    campus?: Record<string, (a: Record<string, unknown>) => unknown>;
  } = {},
) {
  let now = '2026-10-08T05:00:00.000Z';
  const clock: Clock = { today: () => '2026-10-08', now: () => now };
  const garmin = recorder({
    get_activities_by_date: () => ({
      activities: [
        { id: 24631672339, type: 'running', start_time: '2026-10-06 20:58:51', duration_seconds: 1801.4 },
        { id: RUN_0810, type: 'running', start_time: '2026-10-08 20:30:00', duration_seconds: 2160.4 },
      ],
    }),
    get_weigh_ins: () => ({ measurements: [] }),
    get_hrv_data: () => 'No HRV data',
    get_sleep_data: () => 'No sleep data',
    get_training_readiness: () => [],
    get_device_last_used: () => ({ device_name: 'fēnix 7X Pro' }),
    get_body_battery: () => [],
    get_stress_data: () => ({ avgStressLevel: -1 }),
    get_activity: () => ACTIVITY,
    upload_workout: () => ({ status: 'success', workout_id: 9001, name: 'CC · Course S2-3' }),
    schedule_workout: () => ({ status: 'success', workout_id: 9001 }),
    delete_workout: () => ({ status: 'success' }),
    set_activity_name: () => ({ success: true }),
    set_activity_description: () => ({ success: true }),
    set_perceived_effort: () => ({ success: true }),
    set_activity_feel: () => ({ success: true }),
    ...overrides.garmin,
  });
  const campus = recorder({
    get_active_goal: () => [],
    get_training_plan: () => ({ weeks: [S2_WEEK] }),
    get_session_details: ({ session_index }) =>
      session_index === 4
        ? { exercisesBlocks: S1_3_BLOCKS, description: '8 blocs de 2′ de footing suivis de 1′ de marche.' }
        : (S2_DETAILS.get(session_index as number) ?? {}),
    complete_session: () => ({ status: 'success', sessionStatus: 'done' }),
    ...overrides.campus,
  });
  const store = new MemoryStore();
  const sync = new Sync(store, { garmin: garmin.mcp, campus: campus.mcp }, clock);
  const app = buildApp({ store, sync, clock, garmin: garmin.mcp, campus: campus.mcp });
  return {
    store,
    app,
    garmin,
    campus,
    later: (iso: string) => (now = iso),
    async ready() {
      expect(await sync.run('garmin', 'job')).toMatchObject({ outcome: 'ok' });
      expect(await sync.run('campus', 'job')).toMatchObject({ outcome: 'ok' });
    },
    preview: (body: unknown) =>
      app.inject({ method: 'POST', url: '/api/actions/preview', payload: body as object }),
    confirm: (token: string) =>
      app.inject({ method: 'POST', url: '/api/actions/confirm', payload: { token } }),
  };
}

const S2_2 = `2026-10-05#2#Retour_Blessure_S2_2`;
const S2_3 = `2026-10-05#4#Retour_Blessure_S2_3`;

describe('protocole aperçu → confirmation', () => {
  it('l’aperçu n’écrit rien ; la confirmation exécute exactement ce qui a été signé, une seule fois', async () => {
    const t = setup();
    await t.ready();
    const p = await t.preview({ type: 'campus.complete', sessionKey: S2_2 });
    expect(p.statusCode).toBe(200);
    expect(t.campus.writes()).toEqual([]);
    const { token, title, target, fields, warnings } = p.json();
    expect({ title, target }).toEqual({ title: 'Valider dans Campus', target: 'Campus Coach' });
    expect(fields).toEqual(
      expect.arrayContaining([
        { label: 'Séance', value: 'Course S2-2 · Retour de blessure' },
        { label: 'Distance', value: '4,52 km' },
        { label: 'Durée', value: '36:00' },
        { label: 'FC moyenne', value: '131 bpm' },
        { label: 'Montre', value: 'fēnix 7X Pro' },
      ]),
    );
    // Formulaire route pas encore capturé (D125).
    expect(warnings[0]).toMatch(/route/);

    const c = await t.confirm(token);
    expect(c.json()).toEqual({ ok: true, message: 'Séance validée dans Campus.' });
    expect(t.campus.writes()).toEqual([
      {
        tool: 'complete_session',
        write: true,
        args: {
          week_date: '2026-10-05',
          session_index: 2,
          session_name: 'Retour_Blessure_S2_2',
          racing_note: expect.objectContaining({
            externalId: String(RUN_0810),
            distance: 4.5205,
            time: 2160,
            averageHeartRateInBeatsPerMinute: 131,
            averageRunCadenceInStepsPerMinute: 142,
            completionDate: Date.parse('2026-10-08T18:30:00Z'),
          }),
        },
      },
    ]);
    expect((await t.confirm(token)).statusCode).toBe(410);
    expect(t.campus.writes()).toHaveLength(1);
    const log = await t.store.list('ops', 'action-log');
    expect(log).toEqual([
      expect.objectContaining({ outcome: 'ok', type: 'campus.complete', tools: ['complete_session'] }),
    ]);
    const st = (await t.app.inject({ method: 'GET', url: '/api/data/status' })).json();
    expect(st.actions).toEqual([
      {
        at: '2026-10-08T05:00:00.000Z',
        title: 'Valider dans Campus',
        ok: true,
        message: 'Séance validée dans Campus.',
      },
    ]);
  });

  it('jeton modifié → 400 ; aperçu de plus de 5 min → 410', async () => {
    const t = setup();
    await t.ready();
    const { token } = (await t.preview({ type: 'campus.complete', sessionKey: S2_2 })).json();
    const [body, mac] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), title: 'x' }),
    ).toString('base64url');
    expect((await t.confirm(`${forged}.${mac}`)).statusCode).toBe(400);
    t.later('2026-10-08T05:06:00.000Z');
    expect((await t.confirm(token)).statusCode).toBe(410);
    expect(t.campus.writes()).toEqual([]);
  });

  it('Campus ne confirme pas à la relecture → échec affiché, jamais un succès', async () => {
    const t = setup({
      campus: { complete_session: () => ({ status: 'unverified', sessionStatus: 'todo' }) },
    });
    await t.ready();
    const { token } = (await t.preview({ type: 'campus.complete', sessionKey: S2_2 })).json();
    const r = (await t.confirm(token)).json();
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/n’apparaît pas validée/);
  });

  it('séance déjà validée ou sans activité rattachée → refus dès l’aperçu', async () => {
    const t = setup();
    await t.ready();
    expect(
      (await t.preview({ type: 'campus.complete', sessionKey: '2026-10-05#1#Retour_Blessure_S2_1' }))
        .statusCode,
    ).toBe(409);
    expect((await t.preview({ type: 'campus.complete', sessionKey: S2_3 })).json().error).toMatch(
      /Aucune activité/,
    );
    expect((await t.preview({ type: 'campus.complete', sessionKey: 'n importe quoi' })).statusCode).toBe(404);
  });
});

describe('envoyer sur la montre', () => {
  it('crée le workout, le planifie au jour placé et s’en souvient ; un renvoi remplace l’ancien', async () => {
    const t = setup();
    await t.ready();
    const p = (await t.preview({ type: 'garmin.push', sessionKey: S2_3 })).json();
    expect(p.fields).toEqual(
      expect.arrayContaining([
        { label: 'Nom', value: 'CC · Course S2-3' },
        { label: 'Étapes', value: '8 × (2′ Course + 1′ Récupération)' },
        { label: 'Durée totale', value: '24:00' },
      ]),
    );
    const day = p.fields.find((f: { label: string }) => f.label === 'Jour').value;
    const r = (await t.confirm(p.token)).json();
    expect(r.ok).toBe(true);
    const writes = t.garmin.writes();
    expect(writes.map((w) => w.tool)).toEqual(['upload_workout', 'schedule_workout']);
    expect(writes[0]!.args.workout_data).toMatchObject({ workoutName: 'CC · Course S2-3' });
    expect(writes[1]!.args).toMatchObject({ workout_id: 9001 });
    expect(r.message).toContain(day);

    const week = (await t.app.inject({ method: 'GET', url: '/api/calendar/week?start=2026-10-05' })).json();
    const s = week.sessions.find((x: { key: string }) => x.key === S2_3);
    expect(s.pushed).toMatchObject({ workoutId: '9001', date: writes[1]!.args.calendar_date });

    const again = (await t.preview({ type: 'garmin.push', sessionKey: S2_3 })).json();
    expect(again.warnings[0]).toMatch(/Remplace l’envoi/);
    await t.confirm(again.token);
    expect(
      t.garmin
        .writes()
        .map((w) => w.tool)
        .slice(2),
    ).toEqual(['upload_workout', 'schedule_workout', 'delete_workout']);
    expect(t.garmin.writes().at(-1)!.args).toEqual({ workout_id: 9001 });
  });

  it('erreur Garmin en texte → échec, ce qui a déjà été fait est dit', async () => {
    const t = setup({ garmin: { schedule_workout: () => 'Error scheduling workout: 500' } });
    await t.ready();
    const { token } = (await t.preview({ type: 'garmin.push', sessionKey: S2_3 })).json();
    const r = (await t.confirm(token)).json();
    expect(r).toEqual({
      ok: false,
      message:
        'Envoyer sur la montre : échec (Error scheduling workout: 500). Déjà effectué : upload_workout.',
    });
    expect(await t.store.list('ops', 'push')).toEqual([]);
  });

  it('séance sans détail Campus ou renforcement → refus, rien d’inventé', async () => {
    const t = setup();
    await t.ready();
    expect((await t.preview({ type: 'garmin.push', sessionKey: S2_2 })).statusCode).toBe(409); // déjà faite (rattachée)
    expect(
      (
        await t.preview({
          type: 'garmin.push',
          sessionKey: '2026-10-05#3#MIX - MID - BLESSURE - SEMAINE 2 SEANCE 2',
        })
      ).json().error,
    ).toMatch(/courses/);
  });
});

describe('annoter dans Garmin', () => {
  it('seuls les champs modifiés partent ; effort sur l’échelle 1–10', async () => {
    const t = setup();
    await t.ready();
    const p = (
      await t.preview({
        type: 'garmin.annotate',
        activityId: String(RUN_0810),
        changes: { name: 'Messancy Course à pied', rpe: 4, feel: 75 },
      })
    ).json();
    expect(p.fields).toEqual([
      { label: 'Activité', value: 'Messancy Course à pied · 08/10' },
      { label: 'Effort perçu', value: '1/10 → 4/10' },
      { label: 'Ressenti', value: 'normal → fort' },
    ]);
    expect((await t.confirm(p.token)).json().ok).toBe(true);
    expect(t.garmin.writes().map((w) => [w.tool, w.args])).toEqual([
      ['set_perceived_effort', { activity_id: RUN_0810, rpe: 4 }],
      ['set_activity_feel', { activity_id: RUN_0810, feel: 75 }],
    ]);
  });

  it('rien à changer → 422 ; ressenti hors échelle → 400', async () => {
    const t = setup();
    await t.ready();
    const same = { type: 'garmin.annotate', activityId: String(RUN_0810), changes: { rpe: 1, feel: 50 } };
    expect((await t.preview(same)).statusCode).toBe(422);
    const bad = { type: 'garmin.annotate', activityId: String(RUN_0810), changes: { feel: 60 } };
    expect((await t.preview(bad)).statusCode).toBe(400);
  });
});

describe('client MCP', () => {
  it('un outil d’écriture sans le drapeau, ou une lecture avec, est refusé avant tout appel', async () => {
    const g = mcpFromEnv('garmin', { GARMIN_MCP_CMD: 'introuvable' });
    await expect(g.call('upload_workout', {})).rejects.toBeInstanceOf(ToolNotAllowedError);
    await expect(g.call('get_activity', {}, { write: true })).rejects.toBeInstanceOf(ToolNotAllowedError);
    await expect(g.call('delete_workouts', {}, { write: true })).rejects.toBeInstanceOf(ToolNotAllowedError);
  });
});

describe('reconnexion Campus depuis le navigateur', () => {
  const pasted = '﻿{"atk":"jeton-court","rtk":"jeton-long-secret"}\n';

  it('jetons transmis au MCP, synchro relancée, rien de secret dans le journal', async () => {
    const t = setup({ campus: { save_session: () => ({ status: 'success' }) } });
    await t.ready();
    const r = await t.app.inject({ method: 'POST', url: '/api/sources/campus/session', payload: { pasted } });
    expect(r.json()).toEqual({ ok: true, message: 'Campus reconnecté : synchro faite.' });
    expect(t.campus.writes()).toEqual([
      { tool: 'save_session', write: true, args: { atk: 'jeton-court', rtk: 'jeton-long-secret' } },
    ]);
    const ops = JSON.stringify([
      ...(await t.store.list('ops', 'action-log')),
      ...(await t.store.list('ops', 'sync-log')),
    ]);
    expect(ops).toContain('Reconnexion Campus');
    expect(ops).not.toContain('jeton-long-secret');
  });

  it('texte illisible ou sans jeton → 400 sans appel ; jetons refusés → échec lisible', async () => {
    const t = setup({
      campus: {
        save_session: () => {
          throw new ToolError(
            'campus.save_session : Error executing tool save_session: Campus Coach refused these tokens: sign in again and copy them again.',
          );
        },
      },
    });
    await t.ready();
    const post = (p: string) =>
      t.app.inject({ method: 'POST', url: '/api/sources/campus/session', payload: { pasted: p } });
    expect((await post('undefined')).statusCode).toBe(400);
    expect((await post('{"atk":null,"rtk":null}')).statusCode).toBe(400);
    expect(t.campus.writes()).toEqual([]);
    const r = (await post(pasted)).json();
    expect(r).toEqual({
      ok: false,
      message:
        'Reconnexion Campus : échec (Campus Coach refused these tokens: sign in again and copy them again.).',
    });
  });
});
