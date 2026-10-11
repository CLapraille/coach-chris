import { describe, expect, it } from 'vitest';
import { S1_3_BLOCKS, S1_3_LAPS } from '../fixtures/run-s1-3.ts';
import { compareSteps, plannedSteps, stepLaps } from './deviation.ts';

describe('plannedSteps', () => {
  it('déplie 8 × (2′ course + 1′ marche) en 16 étapes, 24 min', () => {
    const steps = plannedSteps(S1_3_BLOCKS);
    expect(steps).toHaveLength(16);
    expect(steps.slice(0, 2)).toEqual([
      { kind: 'run', durationS: 120, zone: 'Z1' },
      { kind: 'walk', durationS: 60, zone: 'RECOVER' },
    ]);
    expect(steps.reduce((s, x) => s + x.durationS, 0)).toBe(24 * 60);
  });
});

describe('compareSteps, sortie réelle du 04/10', () => {
  const d = compareSteps(plannedSteps(S1_3_BLOCKS), S1_3_LAPS);

  it('trouve 15 étapes conformes sur 16 : la 16e, une marche, a été courue', () => {
    expect(d.compliantCount).toBe(15);
    expect(d.steps.filter((s) => !s.compliant).map((s) => [s.n, s.issues])).toEqual([[16, ['ran']]]);
  });

  it("signale l'arrêt de l'étape 12 sans en faire un écart", () => {
    expect(d.steps[11]).toMatchObject({ issues: ['mostly-stopped'], compliant: true });
  });

  it('met à part les 6:55 marchées après la fin du programme (D66)', () => {
    expect(d.after.laps).toBe(2);
    expect(Math.floor(d.after.durationS)).toBe(6 * 60 + 55);
  });
});

describe('compareSteps, règles', () => {
  const run = { kind: 'run' as const, durationS: 120 };
  const lap = { durationS: 120, movingS: 120, avgHr: 140, avgCadence: 160, workoutStepIndex: 0 };

  it('relève une course trop intense, marchée, ou trop courte', () => {
    const d = compareSteps(
      [run, run, run],
      [
        { ...lap, avgHr: 158 },
        { ...lap, avgCadence: 110, workoutStepIndex: 1 },
        { ...lap, durationS: 100, workoutStepIndex: 2 },
      ],
    );
    expect(d.steps.map((s) => s.issues)).toEqual([['hr-too-high'], ['walked'], ['too-short']]);
  });

  it('marque les étapes non faites', () => {
    const d = compareSteps([run, run], [lap]);
    expect(d.steps[1]).toMatchObject({ issues: ['missing'], compliant: false });
    expect(d.after).toEqual({ laps: 0, durationS: 0 });
  });
});

describe('compareSteps, tour automatique de la montre (S2-3 du 10/10)', () => {
  // 4 × (4′ course + 1′ marche) faite à la lettre ; la montre coupe chaque course en un tour de 500 m
  // (~197 s) et un reste (~43 s), tous deux sur l'étape 0 du programme.
  const run = { kind: 'run' as const, durationS: 240, zone: 'Z1' };
  const walk = { kind: 'walk' as const, durationS: 60, zone: 'RECOVER' };
  const lap = (durationS: number, step: number, avgHr: number, avgCadence: number, maxHr: number) => ({
    durationS,
    movingS: durationS,
    avgHr,
    maxHr,
    avgCadence,
    workoutStepIndex: step,
  });
  const laps = [
    lap(197, 0, 127, 152, 145),
    lap(43, 0, 135, 159, 141),
    lap(60, 1, 125, 124, 133),
    lap(196, 0, 129, 154, 137),
    lap(44, 0, 135, 159, 136),
    lap(60, 1, 129, 121, 135),
    lap(198, 0, 139, 157, 149),
    lap(42, 0, 149, 161, 150),
    lap(60, 1, 133, 122, 140),
    lap(240, 0, 140, 158, 150),
    lap(60, 1, 131, 120, 136),
  ];
  const d = compareSteps([run, walk, run, walk, run, walk, run, walk], laps);

  it('regroupe les tours d’une même étape : 8 étapes conformes sur 8', () => {
    expect(d.compliantCount).toBe(8);
    expect(d.steps.map((s) => s.lap?.durationS)).toEqual([240, 60, 240, 60, 240, 60, 240, 60]);
  });

  it('moyennes pondérées par la durée, FC max conservée', () => {
    // (127 × 197 + 135 × 43) / 240 = 128,4 → 128
    expect(d.steps[0]!.lap).toMatchObject({ avgHr: 128, maxHr: 145, avgCadence: 153 });
  });

  it('stepLaps laisse intacts des tours déjà un par étape', () => {
    expect(stepLaps(laps.slice(2, 4))).toEqual(laps.slice(2, 4));
  });
});
