import { describe, expect, it } from 'vitest';
import { S2_DETAILS, S2_WEEK } from '../fixtures/campus-s2.ts';
import { fromCampusWeek, legsFromExercises } from './campus.ts';

describe('fromCampusWeek (semaine S2 réelle)', () => {
  const sessions = fromCampusWeek(S2_WEEK, S2_DETAILS);

  it("garde l'ordre Campus et une clé stable sans weekId", () => {
    expect(sessions.map((s) => s.key)).toEqual([
      '2026-10-05#0#MIX - MID - BLESSURE - SEMAINE 2 SEANCE 1',
      '2026-10-05#1#Retour_Blessure_S2_1',
      '2026-10-05#2#Retour_Blessure_S2_2',
      '2026-10-05#3#MIX - MID - BLESSURE - SEMAINE 2 SEANCE 2',
      '2026-10-05#4#Retour_Blessure_S2_3',
    ]);
    expect(sessions.every((s) => !s.key.includes('6ac4db9a'))).toBe(true);
  });

  it('traduit sport, statut et durée', () => {
    expect(sessions.map((s) => [s.sport, s.status, s.durationMin])).toEqual([
      ['strength', 'done', 30],
      ['run', 'done', 30],
      ['run', 'todo', 36],
      ['strength', 'todo', 30],
      ['run', 'todo', 20],
    ]);
    expect(sessions.some((s) => s.intense)).toBe(false);
  });

  it("reprend le lien Garmin et l'instant de validation", () => {
    expect(sessions[1]).toMatchObject({
      externalActivityId: '24631672339',
      completedAtUtc: '2026-10-06 18:58',
    });
    expect(sessions[0]?.externalActivityId).toBeUndefined();
    expect(sessions[0]?.completedAtUtc).toBe('2026-10-07 18:40');
  });

  it('déduit les jambes des exercices, sinon les suppose', () => {
    expect(sessions[0]).toMatchObject({ legs: true, legsFrom: 'exercises' }); // Chaise, Mollet statique
    expect(sessions[3]).toMatchObject({ legs: true, legsFrom: 'assumed' }); // détail non chargé
    expect(sessions[1]).toMatchObject({ legs: false, legsFrom: 'not-strength' });
  });

  it('reconnaît un renforcement sans jambes', () => {
    expect(legsFromExercises(['Gainage Frontal', 'Gainage Latéral', 'Pompes'])).toBe(false);
  });
});
