import { describe, expect, it } from 'vitest';
import { hrvStatus, weightTrend } from './wellness.ts';

describe('weightTrend (pesées réelles)', () => {
  it('29/09 vs 14/09 : 84,1 kg, −0,7 kg, flèche vers le bas', () => {
    const t = weightTrend([
      { day: '2026-09-14', kg: 84.8 },
      { day: '2026-09-29', kg: 84.09 },
      { day: '2026-08-19', kg: 85.0 },
    ]);
    expect(t).toEqual({
      latest: { day: '2026-09-29', kg: 84.09 },
      previous: { day: '2026-09-14', kg: 84.8 },
      deltaKg: -0.7,
      direction: 'down',
    });
  });

  it('gère une seule pesée ou aucune', () => {
    expect(weightTrend([{ day: '2026-09-29', kg: 84.09 }])).toEqual({
      latest: { day: '2026-09-29', kg: 84.09 },
    });
    expect(weightTrend([])).toBeNull();
  });
});

describe('hrvStatus (relevé du 06/10)', () => {
  it('nuit dans la plage, moyenne 7 j en dessous', () => {
    expect(hrvStatus({ lastNightMs: 93, weeklyAvgMs: 79, baselineLowMs: 81, baselineHighMs: 106 })).toEqual({
      lastNight: 'within',
      weekly: 'below',
    });
  });

  it('nuit absente : inconnue, pas estimée', () => {
    expect(hrvStatus({ weeklyAvgMs: 79, baselineLowMs: 81, baselineHighMs: 106 }).lastNight).toBe('unknown');
  });
});
