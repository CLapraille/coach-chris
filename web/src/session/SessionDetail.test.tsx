import type { SessionView } from '@coach-chris/domain';
import { cleanup, render, screen, within } from '@testing-library/react';
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
  // Écritures pas encore disponibles (M5) : boutons désactivés, aucune action possible.
  expect((screen.getByRole('button', { name: 'Valider dans Campus' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});
