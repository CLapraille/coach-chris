import { expect, it } from 'vitest';
import { buildApp } from '../app.ts';
import type { McpCaller } from '../mcp/client.ts';
import { importPlan } from '../plan/claude.ts';
import { MemoryStore } from '../store/store.ts';
import type { Sync } from '../sync/sync.ts';

const NOW = '2026-11-23T06:00:00.000Z';
const PLAN = {
  format: 'coach-chris.plan/v1',
  source: 'claude',
  generatedAt: '2026-11-20',
  athlete: { fcFacileCourseMax: 140, ftpW: 159 },
  block: { id: 'b', phase: 'Base', name: 'Base', start: '2026-11-23', end: '2026-11-29' },
  routines: { 'ech-course': { name: 'Échauffement course', dureeMin: 8, steps: [] } },
  weeks: [
    {
      index: 1,
      start: '2026-11-23',
      sessions: [
        {
          id: 's1-lun-course',
          date: '2026-11-23',
          sport: 'course',
          role: 'fixe',
          titre: 'Course facile',
          dureeMin: 30,
          echauffement: 'ech-course',
          corps: [],
          montre: [
            { type: 'warmup', fin: 'bouton tour' },
            { type: 'run', dureeMin: 30, cible: { fc: [null, 140] } },
            { type: 'cooldown', dureeMin: 5 },
          ],
        },
        {
          id: 's1-mer-flex',
          date: '2026-11-25',
          sport: 'velo',
          role: 'flexible',
          titre: 'Vélo endurance',
          dureeMin: 45,
          corps: [{ bloc: '45 min', cible: '100–115 W' }],
          alternatives: { course: { titre: 'Course facile', dureeMin: 35, corps: [] } },
          mywhoosh: {
            nom: 'CC · Endurance 45',
            etapes: [
              { type: 'E_WarmUp', dureeMin: 10, ftp: [0.5, 0.72] },
              { type: 'E_Normal', dureeMin: 45, ftp: 0.68 },
            ],
          },
        },
      ],
    },
  ],
};

function recorder(responses: Record<string, () => unknown>) {
  const calls: { tool: string; args: Record<string, unknown>; write: boolean }[] = [];
  const mcp: McpCaller = {
    call: async <T>(tool: string, args: Record<string, unknown> = {}, opts: { write?: boolean } = {}) => {
      const r = responses[tool];
      if (!r) throw new Error(`appel inattendu : ${tool}`);
      calls.push({ tool, args, write: opts.write === true });
      return r() as T;
    },
    close: async () => {},
  };
  return { mcp, calls };
}

async function setup() {
  const store = new MemoryStore();
  await importPlan(store, PLAN, { now: NOW });
  const garmin = recorder({
    upload_workout: () => ({ status: 'success', workout_id: 9001 }),
    schedule_workout: () => ({ status: 'success' }),
  });
  const mywhoosh = recorder({ uploadCoachWorkout: () => ({ ok: true }) });
  const app = buildApp({
    store,
    sync: {} as Sync,
    garmin: garmin.mcp,
    mywhoosh: mywhoosh.mcp,
    clock: { today: () => '2026-11-23', now: () => NOW },
  });
  const act = async (type: string, sessionKey: string) => {
    const preview = await app.inject({
      method: 'POST',
      url: '/api/actions/preview',
      payload: { type, sessionKey },
    });
    return preview;
  };
  const confirm = async (token: string) =>
    (await app.inject({ method: 'POST', url: '/api/actions/confirm', payload: { token } })).json();
  return { app, store, garmin, mywhoosh, act, confirm };
}

it('course du plan Claude vers la montre : aperçu puis confirmation (D160)', async () => {
  const t = await setup();
  const res = await t.act('garmin.push', '2026-11-23#0#s1-lun-course');
  expect(res.statusCode).toBe(200);
  const p = res.json();
  expect(p.target).toBe('Garmin Connect');
  expect(p.fields).toContainEqual({ label: 'Sport', value: 'running' });
  expect(t.garmin.calls).toEqual([]);
  const r = await t.confirm(p.token);
  expect(r.ok).toBe(true);
  const upload = t.garmin.calls[0]!;
  expect(upload).toMatchObject({ tool: 'upload_workout', write: true });
  const steps = (upload.args.workout_data as { workoutSegments: { workoutSteps: object[] }[] })
    .workoutSegments[0]!.workoutSteps;
  expect(steps[1]).toMatchObject({ endConditionValue: 1800, targetValueTwo: 140 });
  expect(t.garmin.calls[1]).toMatchObject({
    tool: 'schedule_workout',
    args: { calendar_date: '2026-11-23', workout_id: 9001 },
  });
  await t.app.close();
});

it('vélo du plan Claude vers MyWhoosh ; refusé sur la montre (D160)', async () => {
  const t = await setup();
  const key = '2026-11-23#1#s1-mer-flex';
  expect((await t.act('garmin.push', key)).statusCode).toBe(409);
  const p = (await t.act('mywhoosh.upload', key)).json();
  expect(p.target).toBe('MyWhoosh');
  expect(p.fields).toContainEqual({ label: 'Puissance max', value: '72 % FTP (≈ 114 W)' });
  const r = await t.confirm(p.token);
  expect(r.ok).toBe(true);
  const w = (t.mywhoosh.calls[0]!.args.workouts as { Name: string; StepCount: number }[])[0]!;
  expect([w.Name, w.StepCount]).toEqual(['CC · Vélo endurance', 2]);
  await t.app.close();
});

it('séance échangée en course : part sur la montre au plafond FC du plan, plus dans MyWhoosh', async () => {
  const t = await setup();
  await t.app.inject({
    method: 'PUT',
    url: '/api/checkins/2026-11-25/sessions/s1-mer-flex',
    payload: { swap: 'course' },
  });
  const key = '2026-11-23#1#s1-mer-flex';
  expect((await t.act('mywhoosh.upload', key)).statusCode).toBe(409);
  const p = (await t.act('garmin.push', key)).json();
  await t.confirm(p.token);
  const steps = (t.garmin.calls[0]!.args.workout_data as { workoutSegments: { workoutSteps: object[] }[] })
    .workoutSegments[0]!.workoutSteps;
  expect(steps[1]).toMatchObject({ endConditionValue: 35 * 60, targetValueTwo: 140 });
  await t.app.close();
});
