import { FIT_EPOCH_S, fixMyWhooshFit } from '@coach-chris/domain';
import { mywhooshFit } from '@coach-chris/domain/fixtures/mywhoosh-fit';
import { expect, it } from 'vitest';
import { buildApp } from '../app.ts';
import type { McpCaller } from '../mcp/client.ts';
import { MemoryStore } from '../store/store.ts';
import { pk, type Sync } from '../sync/sync.ts';

const NOW = '2026-11-24T10:00:00.000Z';
const START = Date.UTC(2026, 10, 24, 7, 59, 29) / 1000;
const FIT = mywhooshFit({ start: START - FIT_EPOCH_S, seconds: 2820, localTs: START + 2820 });
const RIDE = {
  id: 'r1',
  title: 'Kluisbergen',
  startDatetime: '2026-11-24T07:59:29Z',
  rideDuration: '00:47:00',
  distance: 15.71,
  watt: 110,
  heartrate: 120,
  activityFileId: 'f1',
};

function recorder(responses: Record<string, (args: Record<string, unknown>) => unknown>) {
  const calls: { tool: string; args: Record<string, unknown>; write: boolean }[] = [];
  const mcp: McpCaller = {
    call: async <T>(tool: string, args: Record<string, unknown> = {}, opts: { write?: boolean } = {}) => {
      const r = responses[tool];
      if (!r) throw new Error(`appel inattendu : ${tool}`);
      calls.push({ tool, args, write: opts.write === true });
      return r(args) as T;
    },
    close: async () => {},
  };
  return { mcp, calls };
}

function setup(upload: () => unknown = () => ({ success: true, activity_id: 42 })) {
  const store = new MemoryStore();
  const whoosh = recorder({
    listActivities: () => ({ rides: [RIDE] }),
    downloadActivityFile: () => ({ fileId: 'f1', fit: Buffer.from(FIT).toString('base64') }),
  });
  const garmin = recorder({ upload_activity_fit: upload });
  const synced: string[] = [];
  const sync = { run: async (s: string) => (synced.push(s), { outcome: 'ok' }) } as unknown as Sync;
  const app = buildApp({
    store,
    sync,
    garmin: garmin.mcp,
    mywhoosh: whoosh.mcp,
    clock: { today: () => '2026-11-24', now: () => NOW },
  });
  const preview = () =>
    app.inject({ method: 'POST', url: '/api/actions/preview', payload: { type: 'mywhoosh.import' } });
  const confirm = (token: string) =>
    app.inject({ method: 'POST', url: '/api/actions/confirm', payload: { token } });
  return { app, store, whoosh, garmin, synced, preview, confirm };
}

it('aperçu de la dernière sortie, puis téléchargement, correction et envoi à Garmin (D169)', async () => {
  const t = setup();
  const p = await t.preview();
  expect(p.statusCode).toBe(200);
  const body = p.json();
  expect(body.target).toBe('Garmin Connect');
  expect(body.fields).toEqual([
    { label: 'Sortie', value: 'Kluisbergen' },
    { label: 'Début', value: 'mardi 24 novembre, 08:59' },
    { label: 'Durée', value: '00:47:00' },
    { label: 'Distance', value: '15,7 km' },
    { label: 'Puissance moyenne', value: '110 W' },
    { label: 'FC moyenne', value: '120 bpm' },
  ]);
  // L'aperçu ne télécharge rien.
  expect(t.whoosh.calls.map((c) => c.tool)).toEqual(['listActivities']);

  const c = await t.confirm(body.token);
  expect(c.json()).toMatchObject({ ok: true });
  expect(t.whoosh.calls.at(-1)).toEqual({
    tool: 'downloadActivityFile',
    args: { fileId: 'f1' },
    write: false,
  });
  const sent = t.garmin.calls[0]!;
  expect(sent).toMatchObject({
    tool: 'upload_activity_fit',
    write: true,
    args: { file_name: 'MyWhoosh-2026-11-24.fit' },
  });
  const uploaded = Buffer.from(sent.args.fit_base64 as string, 'base64');
  expect(Buffer.from(uploaded).equals(Buffer.from(fixMyWhooshFit(FIT).bytes))).toBe(true);
  expect(t.synced).toEqual(['garmin']);

  // Déjà importée : plus proposée.
  const again = await t.preview();
  expect(again.statusCode).toBe(409);
  expect(again.json().error).toMatch(/Aucune nouvelle sortie/);
  await t.app.close();
});

it('doublon signalé par Garmin : rien n’est ajouté et la sortie n’est plus proposée', async () => {
  const t = setup(() => ({ success: false, duplicate: true, message: 'Duplicate Activity.' }));
  const c = await t.confirm((await t.preview()).json().token);
  expect(c.json()).toEqual({
    ok: true,
    message: 'Cette sortie était déjà dans Garmin Connect : rien n’a été ajouté.',
  });
  expect((await t.preview()).statusCode).toBe(409);
  await t.app.close();
});

it('doublon visible dans le cache Garmin : refusé dès l’aperçu', async () => {
  const t = setup();
  await t.store.upsert('cache', {
    id: '999',
    source: 'garmin',
    fetchedAt: NOW,
    schemaVersion: 1,
    pk: pk('activity', '2026-11-24'),
    day: '2026-11-24',
    startLocal: '2026-11-24 08:59:30',
    type: 'virtual_ride',
    durationS: 2820,
  });
  const p = await t.preview();
  expect(p.statusCode).toBe(409);
  expect(p.json().error).toMatch(/déjà dans Garmin/);
  expect(t.whoosh.calls.map((c) => c.tool)).toEqual(['listActivities']);
  await t.app.close();
});

it('échec Garmin : message lisible, sortie toujours proposée', async () => {
  const t = setup(() => ({ success: false, message: 'API Error 500' }));
  const c = await t.confirm((await t.preview()).json().token);
  expect(c.json().ok).toBe(false);
  expect(c.json().message).toMatch(/API Error 500/);
  expect((await t.preview()).statusCode).toBe(200);
  await t.app.close();
});
