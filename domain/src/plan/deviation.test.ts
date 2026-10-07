import { describe, expect, it } from 'vitest';
import { S1_3_BLOCKS, S1_3_LAPS } from '../fixtures/run-s1-3.ts';
import { compareSteps, plannedSteps } from './deviation.ts';

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
        { ...lap, avgCadence: 110 },
        { ...lap, durationS: 100 },
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
