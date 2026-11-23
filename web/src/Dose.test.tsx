import { describe, expect, it } from 'vitest';
import { doseParts } from './Dose.tsx';

const doses = (t: string) =>
  doseParts(t)
    .filter((p) => p.dose)
    .map((p) => p.text);

describe('doseParts (D166)', () => {
  it('repère répétitions et durées', () => {
    expect(doses('3 × 8 / jambe, descente en 3 s')).toEqual(['3 × 8 / jambe', '3 s']);
    expect(doses('2 × 30 s / côté')).toEqual(['2 × 30 s / côté']);
    expect(doses('Circuit × 2 tours')).toEqual(['× 2 tours']);
    expect(doses('10 × 5 s / pied')).toEqual(['10 × 5 s / pied']);
    expect(doses('15–20')).toEqual([]);
    expect(doses('Marche 1 min puis 2–3 min de course')).toEqual(['1 min', '2–3 min']);
    expect(doses('8 / sens / côté')).toEqual(['8 / sens / côté']);
    expect(doses('4 × (4′ Lent + 1′ Marche)')).toEqual(['4 × (', '4′', '1′']);
    expect(doses('3 séries de 12 répétitions')).toEqual(['3 séries', '12 répétitions']);
  });

  it('laisse charges, allures, cibles et distances dans la couleur du texte', () => {
    expect(doses('2 × 8 kg')).toEqual([]);
    expect(doses('2 × 10 kg')).toEqual([]);
    expect(doses('Haltère 12,5 kg')).toEqual([]);
    expect(doses('Allure 6:50–7:15 /km, FC ≤ 140')).toEqual([]);
    expect(doses('100–115 W, cadence 85–95 tr/min')).toEqual([]);
    expect(doses('21 km D+600')).toEqual([]);
    expect(doses('3 séances, 2 heures, 4 semaines')).toEqual([]);
  });

  it('garde tout le texte, dans l’ordre', () => {
    const t = 'Pause 2 s en haut, 10 / jambe.';
    expect(
      doseParts(t)
        .map((p) => p.text)
        .join(''),
    ).toBe(t);
  });
});
