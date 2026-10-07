import { describe, expect, it } from 'vitest';
import { weekDays } from '../calendar.ts';
import { S2_ACTIVITIES, S2_DETAILS, S2_WEEK } from '../fixtures/campus-s2.ts';
import { fromCampusWeek } from './campus.ts';
import { matchWeek } from './matching.ts';
import { checkPlacement, moveSession, proposePlacement, type Placement } from './placement.ts';

const days = weekDays('2026-10-05');
const sessions = fromCampusWeek(S2_WEEK, S2_DETAILS);
const [r1, c1, c2, r2, c3] = sessions;
const byDay = (p: Placement) =>
  Object.fromEntries(sessions.filter((s) => p[s.key]).map((s) => [s.name, p[s.key]]));

describe('proposePlacement, semaine S2', () => {
  it('état réel du 07/10 au soir : place les 3 séances restantes à partir de jeudi', () => {
    const fixed = Object.fromEntries(
      matchWeek(sessions, S2_ACTIVITIES).matches.map((m) => [m.sessionKey, m.day]),
    );
    const p = proposePlacement({ days, from: '2026-10-08', sessions, fixed });
    expect(byDay(p)).toEqual({
      'MIX - MID - BLESSURE - SEMAINE 2 SEANCE 1': '2026-10-07', // fait mercredi
      Retour_Blessure_S2_1: '2026-10-06', // fait mardi
      Retour_Blessure_S2_2: '2026-10-08',
      'MIX - MID - BLESSURE - SEMAINE 2 SEANCE 2': '2026-10-09',
      Retour_Blessure_S2_3: '2026-10-10',
    });
    expect(checkPlacement(p, sessions, days, new Set(Object.keys(fixed)))).toEqual([]);
  });

  it('début de semaine (mardi, rien de fait) : alterne course et renforcement', () => {
    const todo = sessions.map((s) => ({ ...s, status: 'todo' as const }));
    const p = proposePlacement({ days, from: '2026-10-06', sessions: todo, fixed: {} });
    expect([c1, r1, c2, r2, c3].map((s) => p[s!.key])).toEqual([
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
    ]);
    expect(checkPlacement(p, todo, days)).toEqual([]);
  });

  it('évite le renforcement jambes la veille d’une intensité', () => {
    const intense = { ...c3!, status: 'todo' as const, intense: true };
    const legs = { ...r2!, status: 'todo' as const };
    const p = proposePlacement({ days, from: '2026-10-08', sessions: [legs, intense], fixed: {} });
    expect(checkPlacement(p, [legs, intense], days)).toEqual([]);
    expect(
      p[legs.key]! > p[intense.key]! || days.indexOf(p[intense.key]!) - days.indexOf(p[legs.key]!) > 1,
    ).toBe(true);
  });
});

describe('checkPlacement', () => {
  const todo = sessions.map((s) => ({ ...s, status: 'todo' as const }));
  const all = (list: string[]): Placement => Object.fromEntries(todo.map((s, i) => [s.key, list[i]!]));

  it('signale deux courses consécutives et deux séances le même jour', () => {
    const p = all(['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-08', '2026-10-10']);
    expect(checkPlacement(p, todo, days).map((w) => w.message)).toEqual([
      "Deux courses d'affilée (mer. 7 et jeu. 8)",
      'Deux séances le jeu. 8',
    ]);
  });

  it('signale une semaine sans jour de repos', () => {
    const seven = [...todo, { ...todo[1]!, key: 'x', sport: 'bike' as const }, { ...todo[0]!, key: 'y' }];
    const p = Object.fromEntries(seven.map((s, i) => [s.key, days[i]!]));
    expect(checkPlacement(p, seven, days).map((w) => w.rule)).toContain('no-rest-day');
  });

  it('ne signale pas ce qui ne concerne que le passé', () => {
    const p = all(['2026-10-06', '2026-10-06', '2026-10-08', '2026-10-09', '2026-10-10']);
    expect(checkPlacement(p, todo, days, new Set([r1!.key, c1!.key]))).toEqual([]);
  });
});

describe('moveSession', () => {
  const p: Placement = { [c2!.key]: '2026-10-08', [r2!.key]: '2026-10-09', [c3!.key]: '2026-10-10' };

  it('déplace vers un jour libre', () => {
    expect(moveSession(p, c3!.key, '2026-10-11')[c3!.key]).toBe('2026-10-11');
  });

  it('échange deux séances', () => {
    expect(moveSession(p, c2!.key, '2026-10-09')).toMatchObject({
      [c2!.key]: '2026-10-09',
      [r2!.key]: '2026-10-08',
    });
  });

  it('ne bouge pas une séance figée', () => {
    expect(moveSession(p, c2!.key, '2026-10-11', new Set([c2!.key]))).toBe(p);
  });
});
