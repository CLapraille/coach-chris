import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, seasonProblems, seasonView, type SeasonEvent, type SeasonFile } from './events.ts';

const ev = (id: string, date: string, priority: SeasonEvent['priority']): SeasonEvent => ({
  id,
  name: id,
  date,
  dateConfirmed: true,
  place: 'X',
  country: 'Belgique',
  terrain: 'trail',
  priority,
  options: [{ km: 21, dPlus: 600 }],
  chosen: 0,
});

const FILE: SeasonFile = {
  format: 'coach-chris.season/v1',
  season: '2027',
  events: [
    ev('calestrail', '2027-06-27', 'A'),
    ev('boucles', '2027-06-05', 'A'),
    ev('mineurs', '2027-05-15', 'B'),
    ev('sylvester', '2026-12-31', 'C'),
  ],
};

describe('seasonView', () => {
  it('trie par date, compte les jours et trouve la prochaine course A', () => {
    const v = seasonView(FILE, DEFAULT_SETTINGS, '2026-11-20');
    expect(v.events.map((e) => e.id)).toEqual(['sylvester', 'mineurs', 'boucles', 'calestrail']);
    expect(v.events[0]).toMatchObject({ daysUntil: 41, past: false });
    expect(v.nextA).toBe('boucles');
  });

  it('une course passée sort du compte de la prochaine A', () => {
    expect(seasonView(FILE, DEFAULT_SETTINGS, '2027-06-10').nextA).toBe('calestrail');
  });

  it('signale les courses à moins de 14 jours l’une de l’autre', () => {
    const close: SeasonFile = { ...FILE, events: [...FILE.events, ev('dkv', '2027-05-08', 'C')] };
    const v = seasonView(close, DEFAULT_SETTINGS, '2026-11-20');
    expect(v.events.find((e) => e.id === 'mineurs')!.closeTo).toEqual(['dkv']);
    expect(v.events.find((e) => e.id === 'boucles')!.closeTo).toEqual([]);
  });

  it('sans saison importée : liste vide, réglage par défaut', () => {
    expect(seasonView(undefined, DEFAULT_SETTINGS, '2026-11-20')).toEqual({
      season: null,
      events: [],
      settings: { flexDefault: 'velo' },
      nextA: null,
    });
  });
});

describe('seasonProblems', () => {
  it('signale doublon et distance choisie inexistante', () => {
    const bad: SeasonFile = {
      ...FILE,
      events: [ev('a', '2027-01-01', 'C'), { ...ev('a', '2027-02-01', 'C'), chosen: 3 }],
    };
    expect(seasonProblems(bad)).toEqual(['événement « a » en double', 'a : distance choisie inexistante']);
  });
});
