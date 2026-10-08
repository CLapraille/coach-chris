import { describe, expect, it } from 'vitest';
import { EXERCISES, MORNING, exercise, totalS, ZONE_EXERCISES } from './library.ts';
import { canCheck, regularity } from './regularity.ts';
import { chooseDailySlot, chooseSocle, EVENING_MAX_S } from './routine.ts';
import { assessZones, DECLARED_ZONES, type TestResults } from './tests.ts';

const DECLARED = DECLARED_ZONES;

describe('bibliothèque', () => {
  it('contient la routine du matin (4 min) et 30 exercices aux codes uniques', () => {
    expect(MORNING.reduce((s, e) => s + totalS(e), 0)).toBe(4 * 60);
    expect(EXERCISES).toHaveLength(30);
    expect(new Set(EXERCISES.map((e) => e.code)).size).toBe(30);
  });

  it('ne référence que des exercices existants dans les zones', () => {
    for (const codes of Object.values(ZONE_EXERCISES))
      for (const c of codes) expect(() => exercise(c)).not.toThrow();
  });
});

describe('assessZones', () => {
  it('classe chaque test et rend prioritaire une zone faible déclarée', () => {
    const r: TestResults = {
      kneeToWallCm: { left: 11, right: 10.5 }, // ≥ 10 et symétrique → bon
      hipInternalRotationDeg: { left: 30, right: 25 }, // < 28 (80 % de 35) → faible, hanche déclarée → priorité
      thomas: { left: 'level', right: 'above' }, // un côté au-dessus → faible → priorité
      bigToeExtensionDeg: { left: 55, right: 60 }, // proche du repère → à surveiller
      balanceEyesClosedS: { left: 25, right: 14 }, // 14 < 16 → faible → priorité
      singleLegSquat: { left: 'yes', right: 'sometimes' }, // → à surveiller
    };
    expect(Object.fromEntries(assessZones(r, DECLARED).map((z) => [z.zone, z.status]))).toEqual({
      ankle: 'good',
      'hip-rotation': 'priority',
      'big-toe': 'watch',
      'foot-ankle-control': 'priority',
      'hip-flexors': 'priority',
      'hip-knee-control': 'watch',
    });
  });

  it('passe à « à surveiller » une asymétrie au-dessus du repère', () => {
    const [z] = assessZones({ kneeToWallCm: { left: 14, right: 11 } }, DECLARED);
    expect(z).toMatchObject({ status: 'watch', reason: 'Genou au mur (cm) : G 14 / D 11 (repère 10)' });
  });

  it("ne donne aucun statut pour un test non fait (pas d'invention)", () => {
    expect(assessZones({}, DECLARED)).toEqual([]);
  });
});

describe('routine du soir (exemple de la maquette : bloc 1)', () => {
  const zones = assessZones(
    {
      hipInternalRotationDeg: { left: 30, right: 27 },
      thomas: { left: 'above', right: 'above' },
      bigToeExtensionDeg: { left: 45, right: 47 },
      kneeToWallCm: { left: 12, right: 11 },
    },
    DECLARED,
  );
  const socle = chooseSocle(zones);

  it('socle : H1, H2, P1 sur les trois zones prioritaires, 6 min', () => {
    expect(socle.map((i) => i.code).sort()).toEqual(['H1', 'H2', 'P1']); // ordre d'égalité : celui des tests
    expect(socle.reduce((s, i) => s + totalS(exercise(i.code)), 0)).toBe(6 * 60);
  });

  it('créneau du jour selon le contexte, total ≤ 8 min', () => {
    const base = { legsStrengthToday: false, runToday: false, intenseTomorrow: false, restDay: false };
    expect(chooseDailySlot(socle, { ...base, legsStrengthToday: true }, zones)).toEqual({
      code: 'G1',
      reason: "après le renforcement jambes d'aujourd'hui",
    });
    expect(chooseDailySlot(socle, { ...base, runToday: true }, zones)?.code).toBe('C3');
    const slot = chooseDailySlot(socle, { ...base, restDay: true }, zones)!;
    expect(slot.reason).toMatch(/^jour de repos/);
    expect(socle.concat(slot).reduce((s, i) => s + totalS(exercise(i.code)), 0)).toBeLessThanOrEqual(
      EVENING_MAX_S,
    );
  });

  it('routine douce la veille d’une intensité, jamais de niveau 3 ni de renforcement', () => {
    const slot = chooseDailySlot(
      socle,
      { legsStrengthToday: true, runToday: false, intenseTomorrow: true, restDay: false },
      zones,
    )!;
    expect(slot.code).toBe('R1');
    expect(exercise(slot.code).level).toBe(1);
  });

  it('un socle sans zone à travailler est vide', () => {
    expect(chooseSocle(assessZones({ kneeToWallCm: { left: 12, right: 12 } }, DECLARED))).toEqual([]);
  });
});

describe('régularité', () => {
  const logs = ['2026-10-01', '2026-10-03', '2026-10-04', '2026-10-05'].map((day) => ({
    day,
    slot: 'morning' as const,
  }));

  it('compte les jours cochés et la série jusqu’à hier', () => {
    expect(regularity(logs, 'morning', '2026-10-06', 7)).toEqual({ done: 4, days: 7, streak: 3 });
    expect(regularity(logs, 'evening', '2026-10-06', 7)).toEqual({ done: 0, days: 7, streak: 0 });
  });

  it('autorise le rattrapage jusqu’à J-3 seulement', () => {
    expect(canCheck('2026-10-03', '2026-10-06')).toBe(true);
    expect(canCheck('2026-10-02', '2026-10-06')).toBe(false);
    expect(canCheck('2026-10-07', '2026-10-06')).toBe(false);
  });
});
