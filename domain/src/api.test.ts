import { describe, expect, it } from 'vitest';
import { sessionBlocks } from './api.ts';
import { S2_DETAILS } from './fixtures/campus-s2.ts';

describe('sessionBlocks', () => {
  it('course : allure lisible et marche de récupération', () => {
    const blocks = sessionBlocks([
      {
        repeat: 12,
        exercises: [
          {
            name: 'slow_2',
            exerciseType: 'running',
            pace: { name: 'Lent', zoneKind: 'Z1' },
            durations: [{ value: 2, timeUnit: 'minutes' }],
          },
          {
            name: 'Walk_1',
            exerciseType: 'recuperation',
            pace: { name: 'Marche', zoneKind: 'RECOVER' },
            durations: [{ value: 1, timeUnit: 'minutes' }],
          },
        ],
      },
    ]);
    expect(blocks).toEqual([
      {
        repeat: 12,
        steps: [
          { name: 'Lent', kind: 'run', seconds: 120 },
          { name: 'Marche', kind: 'walk', seconds: 60 },
        ],
      },
    ]);
  });

  it('renforcement : noms Campus, récupération sans allure', () => {
    const [block] = sessionBlocks(S2_DETAILS.get(0)!.exercisesBlocks!);
    expect(block!.steps.map((s) => [s.name, s.kind])).toEqual([
      ['Chaise', 'exercise'],
      ['Mollet statique', 'exercise'],
      ['Gainage Frontal', 'exercise'],
      ['Gainage Latéral', 'exercise'],
      ['Récupération', 'rest'],
    ]);
  });
});
