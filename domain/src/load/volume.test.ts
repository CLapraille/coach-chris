import { describe, expect, it } from 'vitest';
import { capStatus, volumeCap, weeklyVolume } from './volume.ts';

describe('weeklyVolume', () => {
  it('regroupe par semaine du lundi et exclut les marches', () => {
    const w = weeklyVolume([
      { day: '2026-10-04', sport: 'run', minutes: 31 },
      { day: '2026-10-05', sport: 'walk', minutes: 10 },
      { day: '2026-10-06', sport: 'run', minutes: 30 },
      { day: '2026-10-07', sport: 'strength', minutes: 30 },
      { day: '2026-10-07', sport: 'bike', minutes: 45 },
    ]);
    expect(Object.fromEntries(w)).toEqual({
      '2026-09-28': { run: 31, bike: 0, strength: 0 },
      '2026-10-05': { run: 30, bike: 45, strength: 30 },
    });
  });
});

describe('volumeCap (chiffres de la maquette validée, D90)', () => {
  it('course : 1,3 × 48,9 min ≈ 64 min, prévu 86 → au-dessus', () => {
    const cap = volumeCap([97.3, 68.4, 61.9, 0, 58.4, 75.4])!; // seules les 4 dernières semaines comptent
    expect(cap.mean).toBeCloseTo(48.9, 1);
    expect(Math.round(cap.cap)).toBe(64);
    expect(capStatus(86, cap)).toBe('over');
  });

  it('total : 1,3 × 179,7 min ≈ 234 min, prévu 146 → sous le repère', () => {
    const cap = volumeCap([216.4, 149, 157.7, 195.5])!;
    expect(Math.round(cap.cap)).toBe(234);
    expect(capStatus(146, cap)).toBe('under');
  });

  it("ne donne pas de repère sans 4 semaines d'historique", () => {
    expect(volumeCap([60, 70, 80])).toBeNull();
  });
});
