import { describe, expect, it } from 'vitest';
import { addDays, dayLabel, mondayOf, parisDayOfUtc, weekDays } from './calendar.ts';

describe('calendar', () => {
  it('ramène un jour au lundi de sa semaine', () => {
    expect(mondayOf('2026-10-07')).toBe('2026-10-05'); // mercredi → lundi
    expect(mondayOf('2026-10-05')).toBe('2026-10-05'); // lundi
    expect(mondayOf('2026-10-11')).toBe('2026-10-05'); // dimanche → lundi précédent
  });

  it("traverse les changements d'heure et de mois", () => {
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26'); // passage à l'heure d'hiver le 25/10
    expect(mondayOf('2026-11-01')).toBe('2026-10-26');
  });

  it('liste les 7 jours de la semaine', () => {
    expect(weekDays('2026-10-07')).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
  });

  it('refuse une date invalide', () => {
    expect(() => mondayOf('2026-02-30')).toThrow('Date invalide');
    expect(() => mondayOf('07/10/2026')).toThrow('AAAA-MM-JJ');
  });
});

describe('libellés et fuseau', () => {
  it('formate un jour court', () => {
    expect(dayLabel('2026-10-07')).toBe('mer. 7');
    expect(dayLabel('2026-10-11')).toBe('dim. 11');
  });

  it('ramène un instant UTC Campus au jour de Paris', () => {
    expect(parisDayOfUtc('2026-10-06 18:58')).toBe('2026-10-06');
    expect(parisDayOfUtc('2026-10-06 22:30')).toBe('2026-10-07'); // 00:30 à Paris
    expect(parisDayOfUtc('2026-12-31 23:30')).toBe('2027-01-01'); // heure d'hiver
  });
});
