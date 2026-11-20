import { describe, expect, it } from 'vitest';
import { comparePlans, summarize } from './compare.ts';
import type { PlannedSession } from './types.ts';

const s = (
  name: string,
  sport: PlannedSession['sport'],
  durationMin: number,
  o: Partial<PlannedSession> = {},
): PlannedSession => ({
  key: name,
  source: 'campus',
  weekDate: '2026-11-30',
  index: 0,
  name,
  displayName: name,
  sport,
  trainingType: '',
  durationMin,
  status: 'todo',
  intense: false,
  legs: false,
  legsFrom: 'not-strength',
  ...o,
});

describe('comparePlans', () => {
  const campus = summarize('campus', [
    s('EF', 'run', 40),
    s('Fractionné', 'run', 45, { intense: true }),
    s('Sortie longue', 'run', 60),
    s('PPG', 'strength', 30),
    s('Sautée', 'run', 30, { status: 'skipped' }),
  ]);
  const claude = summarize('claude', [
    s('Course facile', 'run', 35, { source: 'claude', day: '2026-11-30' }),
    s('Séance clé', 'strength', 45, { source: 'claude' }),
    s('Vélo tempo', 'bike', 50, { source: 'claude' }),
    s('Sortie longue', 'run', 50, { source: 'claude' }),
  ]);

  it('résume chaque plan (séances sautées exclues)', () => {
    expect(campus).toMatchObject({
      runCount: 3,
      runMinutes: 145,
      longRunMin: 60,
      bikeMinutes: 0,
      strengthCount: 1,
      intenseCount: 1,
      totalMinutes: 175,
    });
    expect(claude.sessions[0]).toMatchObject({ name: 'Course facile', day: '2026-11-30' });
  });

  it('liste les écarts de Claude par rapport à Campus', () => {
    expect(comparePlans('2026-11-30', 'claude', campus, claude).differences).toEqual([
      'Courses : -1 séance(s) avec Claude (3 → 2)',
      'Minutes de course : -60 min avec Claude (145 → 85)',
      'Sortie la plus longue : -10 min avec Claude (60 → 50)',
      'Vélo : +50 min avec Claude (0 → 50)',
      'Intensité : -1 séance(s) avec Claude (1 → 0)',
    ]);
  });

  it('un seul plan : pas d’écarts', () => {
    expect(comparePlans('2026-11-30', 'campus', campus, null).differences).toEqual([]);
  });
});
