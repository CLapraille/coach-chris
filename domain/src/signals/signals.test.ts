import { describe, expect, it } from 'vitest';
import { S1_3_BLOCKS, S1_3_LAPS } from '../fixtures/run-s1-3.ts';
import { compareSteps, plannedSteps } from '../plan/deviation.ts';
import { deviationSignal, hrvSignal, offPlanSignals } from './signals.ts';

describe('signaux (données réelles de la maquette)', () => {
  it('« Une récupération courue » pour la sortie du 04/10', () => {
    const s = deviationSignal('Dimanche', compareSteps(plannedSteps(S1_3_BLOCKS), S1_3_LAPS));
    expect(s).toMatchObject({
      level: 'warn',
      title: 'Une récupération courue',
      text: 'Dimanche : une récupération courue (étape 16). 15 étapes conformes sur 16.',
    });
  });

  it('VFC 7 j sous la plage, nuit revenue dans la plage', () => {
    expect(
      hrvSignal({ lastNightMs: 93, weeklyAvgMs: 79, baselineLowMs: 81, baselineHighMs: 106 })?.text,
    ).toBe(
      '79 ms sur 7 jours, pour une plage habituelle de 81 à 106. La nuit dernière (93 ms) est dans la plage.',
    );
    expect(
      hrvSignal({ lastNightMs: 93, weeklyAvgMs: 85, baselineLowMs: 81, baselineHighMs: 106 }),
    ).toBeNull();
  });

  it('vélo hors plan', () => {
    const [s] = offPlanSignals([
      { id: '1', startLocal: '2026-09-29 18:00:00', type: 'virtual_ride', durationS: 3600 },
    ]);
    expect(s).toMatchObject({ title: 'Vélo hors plan', text: '60 min le 29/09, non prévu par le plan.' });
  });
});
