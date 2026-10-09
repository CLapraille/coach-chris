import type { SessionView } from '@coach-chris/domain';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TODAY } from '../today/fixture.ts';
import { SessionDetail } from './SessionDetail.tsx';

const run = TODAY.week.sessions[0]!;
const lap = (n: number, durationS: number, avgHr: number, avgCadence: number, workoutStepIndex?: number) => ({
  n,
  durationS,
  movingS: durationS,
  avgHr,
  avgCadence,
  speedMps: 2.5,
  ...(workoutStepIndex !== undefined && { workoutStepIndex }),
});
const L = [lap(1, 120, 130, 150, 0), lap(2, 60, 118, 140, 1), lap(3, 300, 105, 100)];

const VIEW: SessionView = {
  weekStart: '2026-10-05',
  session: {
    ...run,
    status: 'done',
    match: { day: '2026-10-08', method: 'campus-link', confidence: 'sure', reason: '', activityId: '1' },
  },
  blocks: [
    {
      repeat: 1,
      steps: [
        { name: 'Lent', kind: 'run', seconds: 120 },
        { name: 'Marche', kind: 'walk', seconds: 60 },
      ],
    },
  ],
  coachAdvice: 'On y va molo.',
  activity: {
    id: '1',
    startLocal: '2026-10-08 21:23:01',
    type: 'running',
    durationS: 480,
    distanceM: 1200,
    avgHr: 120,
    maxHr: 140,
    trainingEffect: 2.1,
    trainingEffectLabel: 'AEROBIC_BASE',
    rpe: 10,
    feel: 50,
    laps: L,
    zones: [{ zone: 1, lowBpm: 123, seconds: 300 }],
  },
  deviation: {
    steps: [
      { n: 1, planned: { kind: 'run', durationS: 120 }, lap: L[0]!, issues: [], compliant: true },
      { n: 2, planned: { kind: 'walk', durationS: 60 }, lap: L[1]!, issues: ['ran'], compliant: false },
    ],
    compliantCount: 1,
    after: { laps: 1, durationS: 300 },
  },
  rules: { runMaxHr: 151, cadenceRunMin: 130, durationTolerance: 0.1 },
};

beforeEach(() => vi.stubGlobal('fetch', async () => Response.json(VIEW)));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('prévu vs réalisé : étapes conformes, marche courue signalée, après-séance à part', async () => {
  render(<SessionDetail sessionKey="k2" onBack={() => {}} />);
  await screen.findByRole('heading', { name: 'Retour de blessure · S2-2' });
  expect(screen.getByText('Faite · validée dans Campus')).toBeTruthy();
  expect(screen.getByText('1/2')).toBeTruthy();
  expect(screen.getByText(/Marche 1 : couru au lieu de marcher \(cadence 140\)/)).toBeTruthy();
  const table = screen.getByRole('table');
  expect(within(table).getByText('après la séance')).toBeTruthy();
  expect(screen.getByText(/Après la séance :/)).toBeTruthy();
  expect(screen.getByText('« On y va molo. »')).toBeTruthy();
  // Séance déjà validée : rien à envoyer à Campus.
  expect((screen.getByRole('button', { name: 'Valider dans Campus' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(screen.getByText('Séance déjà validée le 08/10.')).toBeTruthy();
});

/** Séance rattachée mais pas validée : l'aperçu puis la confirmation passent par l'API. */
it('Valider dans Campus : aperçu, rien sans « Confirmer », puis résultat et relecture', async () => {
  const pending: SessionView = { ...VIEW, session: { ...VIEW.session, status: 'todo' } };
  const posts: { url: string; body: unknown }[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as unknown;
      posts.push({ url, body });
      if (url.endsWith('/actions/preview')) {
        return Response.json({
          token: 'jeton',
          expiresAt: '2026-10-08T05:05:00Z',
          title: 'Valider dans Campus',
          target: 'Campus Coach',
          fields: [{ label: 'Distance', value: '1,20 km' }],
          warnings: ['Formulaire « route » pas encore confirmé'],
        });
      }
      return Response.json({ ok: true, message: 'Séance validée dans Campus.' });
    }
    return Response.json(pending);
  });
  render(<SessionDetail sessionKey="k2" onBack={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Valider dans Campus' }));
  const dialog = await screen.findByRole('dialog', { name: 'Valider dans Campus' });
  expect(within(dialog).getByText('1,20 km')).toBeTruthy();
  expect(within(dialog).getByText(/route/)).toBeTruthy();
  expect(posts.map((p) => p.url.replace(/.*\/api/, ''))).toEqual(['/actions/preview']);
  expect(posts[0]!.body).toEqual({ type: 'campus.complete', sessionKey: pending.session.key });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmer' }));
  expect(await screen.findByText('Séance validée dans Campus.')).toBeTruthy();
  expect(posts[1]!.body).toEqual({ token: 'jeton' });
});

it('Annoter dans Garmin : effort et ressenti choisis, notes inchangées non envoyées', async () => {
  const posts: unknown[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posts.push(JSON.parse(String(init.body)));
      return Response.json({ error: 'Rien à modifier' }, { status: 422 });
    }
    return Response.json(VIEW);
  });
  render(<SessionDetail sessionKey="k2" onBack={() => {}} />);
  fireEvent.change(await screen.findByLabelText('Effort perçu'), { target: { value: '4' } });
  fireEvent.change(screen.getByLabelText('Ressenti'), { target: { value: '75' } });
  fireEvent.click(screen.getByRole('button', { name: 'Annoter dans Garmin' }));
  expect(await screen.findByText('Rien à modifier')).toBeTruthy();
  expect(posts).toEqual([{ type: 'garmin.annotate', activityId: '1', changes: { rpe: 4, feel: 75 } }]);
});
