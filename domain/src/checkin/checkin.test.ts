import { describe, expect, it } from 'vitest';
import { fromClaudeWeek, type ClaudeWeek } from '../plan/claude.ts';
import { painZone, suggestLowImpact, swapsOf } from './checkin.ts';

const WEEK: ClaudeWeek = {
  index: 1,
  start: '2026-11-23',
  sessions: [
    {
      id: 'flex',
      date: '2026-11-25',
      sport: 'velo',
      role: 'flexible',
      titre: 'Vélo endurance',
      dureeMin: 45,
      corps: [],
      alternatives: {
        course: { titre: 'Course facile', dureeMin: 35, corps: [] },
        rameur: { titre: 'Rameur endurance', dureeMin: 35, corps: [] },
      },
    },
    {
      id: 'long',
      date: '2026-11-29',
      sport: 'course',
      role: 'fixe',
      titre: 'Sortie longue',
      dureeMin: 45,
      corps: [],
    },
  ],
};

describe('check-ins', () => {
  it('zones de douleur autour du seuil de 3/10', () => {
    expect([0, 3, 4, 5, 6, 10].map(painZone)).toEqual(['ok', 'ok', 'warn', 'warn', 'alert', 'alert']);
  });

  it('pied à 3/10 ou plus : vélo ou rameur proposés d’abord', () => {
    expect([undefined, 2, 3, 7].map(suggestLowImpact)).toEqual([false, false, true, true]);
  });

  it('le choix du jour passe avant le réglage ; une séance fixe ne s’échange jamais', () => {
    const swaps = swapsOf([
      { date: '2026-11-25', sessions: { flex: { swap: 'rameur', rpe: 5 } } },
      { date: '2026-11-29', sessions: { long: { swap: 'velo' } } },
    ]);
    expect(swaps).toEqual({ flex: 'rameur', long: 'velo' });
    const s = fromClaudeWeek(WEEK, 'course', swaps);
    expect(s.map((x) => [x.displayName, x.sport])).toEqual([
      ['Rameur endurance', 'other'],
      ['Sortie longue', 'run'],
    ]);
  });

  it('un sport sans variante dans le plan retombe sur le réglage', () => {
    const s = fromClaudeWeek(WEEK, 'course', { flex: 'renfo' });
    expect(s[0]!.displayName).toBe('Course facile');
  });
});
