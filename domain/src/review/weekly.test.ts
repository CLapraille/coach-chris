import { describe, expect, it } from 'vitest';
import type { CheckinDay } from '../checkin/checkin.ts';
import { weeklyReview, type ReviewInput, type ReviewSession } from './weekly.ts';

const THIS: ReviewSession[] = [
  { id: 's1-lun', role: 'fixe', sport: 'course', dureeMin: 30, done: true },
  { id: 's1-mar', role: 'cle', sport: 'renfo', dureeMin: 40, done: true },
  { id: 's1-mer', role: 'flexible', sport: 'velo', dureeMin: 45, done: true },
  { id: 's1-dim', role: 'fixe', sport: 'course', dureeMin: 45, done: true },
];
const NEXT: ReviewSession[] = [
  { id: 's2-lun', role: 'fixe', sport: 'course', dureeMin: 35, done: false },
  { id: 's2-mer', role: 'flexible', sport: 'velo', dureeMin: 50, done: false },
  { id: 's2-dim', role: 'fixe', sport: 'course', dureeMin: 50, done: false },
];
const days = (feet: number[], shins: Record<string, number> = {}): CheckinDay[] =>
  feet.map((foot, i) => ({
    date: `2026-11-${23 + i}`,
    foot,
    ...(i === 0 &&
      Object.keys(shins).length && {
        sessions: Object.fromEntries(Object.entries(shins).map(([k, v]) => [k, { shin: v }])),
      }),
  }));

const input = (o: Partial<ReviewInput> = {}): ReviewInput => ({
  week: '2026-11-23',
  sessions: THIS,
  checkins: days([2, 1, 2, 1, 0, 1, 2]),
  runMinutes: 75,
  previousRunMinutes: [60, 70, 80],
  next: NEXT,
  ...o,
});

describe('weeklyReview', () => {
  it('semaine verte : progression du plan (+13 %)', () => {
    const r = weeklyReview(input());
    expect(r.verdict).toBe('progress');
    expect(r.adjustments).toEqual({});
    expect(r.volume).toMatchObject({ actual: 75, plannedNext: 85, proposedNext: 85, chronic: 71 });
    expect(r.flex).toBe('velo');
    expect(r.reasons[0]!.level).toBe('ok');
  });

  it('3e course : seulement si elle tient dans la cible de volume', () => {
    const next = NEXT.map((s) => (s.role === 'flexible' ? { ...s, courseMin: 40 } : s));
    // 85 + 40 = 125 min > 75 × 1,15 : pas encore.
    const tight = weeklyReview(input({ next }));
    expect(tight.flex).toBe('velo');
    expect(tight.reasons.some((x) => x.text.startsWith('3e course pas encore'))).toBe(true);
    // 85 + 25 = 110 min ≤ 110 × 1,15 et sous 1,3 × la charge chronique : oui, comptée dans le volume.
    const room = NEXT.map((s) => (s.role === 'flexible' ? { ...s, courseMin: 25 } : s));
    const ok = weeklyReview(input({ next: room, runMinutes: 110, previousRunMinutes: [100, 100, 110] }));
    expect(ok.flex).toBe('course');
    expect(ok.volume.proposedNext).toBe(110);
  });

  it('plan trop ambitieux : ramené à +15 %', () => {
    const big = NEXT.map((s) => (s.id === 's2-dim' ? { ...s, dureeMin: 70 } : s));
    const r = weeklyReview(input({ next: big, previousRunMinutes: [] }));
    expect(r.verdict).toBe('progress');
    expect(r.volume.plannedNext).toBe(105);
    // Cible 75 × 1,15 = 86 min : 35 → 30, 70 → 60 puis 55 pour ne pas dépasser.
    expect(r.adjustments).toEqual({ 's2-lun': { from: 35, to: 30 }, 's2-dim': { from: 70, to: 55 } });
    expect(r.reasons.some((x) => x.rule === 'growth')).toBe(true);
  });

  it('douleur ponctuelle à 4–5 : on tient le volume de la semaine', () => {
    const r = weeklyReview(input({ checkins: days([2, 4, 2, 1, 0, 1, 2]) }));
    expect(r.verdict).toBe('hold');
    expect(r.volume.proposedNext).toBeLessThanOrEqual(80);
    expect(r.flex).toBe('velo');
  });

  it('pied au-dessus de 3 sur 3 matins, ou tibia deux fois : on allège de 20 %', () => {
    const feet = weeklyReview(input({ checkins: days([4, 4, 5, 2, 1, 1, 2]) }));
    expect(feet.verdict).toBe('step-back');
    expect(feet.volume.proposedNext).toBeLessThanOrEqual(60);
    const shin = weeklyReview(input({ checkins: days([1, 1, 1, 1], { 's1-lun': 4, 's1-dim': 5 }) }));
    expect(shin.verdict).toBe('step-back');
    expect(shin.pain).toMatchObject({ shinMax: 5, shinOver: 2 });
  });

  it('une douleur à 6/10 suffit pour alléger', () => {
    expect(weeklyReview(input({ checkins: days([1, 6, 1, 1]) })).verdict).toBe('step-back');
  });

  it('séance fixe manquée ou check-ins absents : on tient', () => {
    const missed = THIS.map((s) => (s.id === 's1-dim' ? { ...s, done: false } : s));
    const r = weeklyReview(input({ sessions: missed, runMinutes: 30 }));
    expect(r.verdict).toBe('hold');
    expect(r.completion).toEqual({ fixedDone: 1, fixedTotal: 2, done: 3, total: 4 });
    expect(weeklyReview(input({ checkins: days([1, 1]) })).verdict).toBe('hold');
  });

  it('plafond ACWR : jamais plus de 1,3 × la moyenne des 4 semaines', () => {
    const r = weeklyReview(input({ previousRunMinutes: [40, 40, 40], runMinutes: 75 }));
    // Moyenne (40+40+40+75)/4 = 48,75 → plafond 63 min.
    expect(r.volume.chronic).toBe(49);
    expect(r.volume.proposedNext).toBeLessThanOrEqual(65);
    expect(r.reasons.some((x) => x.rule === 'acwr')).toBe(true);
  });
});
