import { describe, expect, it } from 'vitest';
import { S1_3_BLOCKS } from '../fixtures/run-s1-3.ts';
import {
  manualStrength,
  annotationChanges,
  campusRacingNote,
  garminWorkout,
  WorkoutError,
  workoutSeconds,
} from './actions.ts';

describe('garminWorkout', () => {
  const w = garminWorkout({ name: 'Course S1-3', description: '8 × (2′ + 1′)', blocks: S1_3_BLOCKS });
  const segment = (w.workoutSegments as { workoutSteps: Record<string, unknown>[] }[])[0]!;

  it('préfixe le nom « CC · » et garde la description Campus', () => {
    expect(w.workoutName).toBe('CC · Course S1-3');
    expect(w.description).toBe('8 × (2′ + 1′)');
  });

  it('8 × (2′ course + 1′ marche) devient un groupe de 8 répétitions, sans cible', () => {
    expect(segment.workoutSteps).toHaveLength(1);
    const group = segment.workoutSteps[0]!;
    expect(group).toMatchObject({
      type: 'RepeatGroupDTO',
      stepOrder: 1,
      numberOfIterations: 8,
      endCondition: { conditionTypeId: 7, conditionTypeKey: 'iterations' },
      endConditionValue: 8,
    });
    expect(group.workoutSteps).toEqual([
      expect.objectContaining({
        stepOrder: 2,
        stepType: { stepTypeId: 3, stepTypeKey: 'interval' },
        endConditionValue: 120,
        targetType: { workoutTargetTypeId: 1, workoutTargetTypeKey: 'no.target' },
      }),
      expect.objectContaining({
        stepOrder: 3,
        stepType: { stepTypeId: 4, stepTypeKey: 'recovery' },
        endConditionValue: 60,
      }),
    ]);
    expect(workoutSeconds(S1_3_BLOCKS)).toBe(24 * 60);
  });

  it('refuse une étape dont le type ne se traduit pas, plutôt que de l’inventer', () => {
    expect(() =>
      garminWorkout({
        name: 'x',
        blocks: [{ exercises: [{ name: 'Gainage', durations: [{ value: 1, timeUnit: 'minutes' }] }] }],
      }),
    ).toThrow(WorkoutError);
    expect(() => garminWorkout({ name: 'x', blocks: [] })).toThrow(WorkoutError);
  });
});

describe('campusRacingNote', () => {
  // Activité 24631672339 (get_activity) et formulaire enregistré par Campus pour la séance S2-1 le 06/10.
  const note = campusRacingNote(
    {
      id: '24631672339',
      startGmt: '2026-10-06T18:58:51.0',
      durationS: 1801.392,
      distanceM: 3810.99,
      calories: 299,
      avgHr: 124,
      avgCadence: 137.46875,
      elevationGainM: 26.63,
      elevationLossM: 30.57,
      name: 'Messancy Course à pied',
    },
    'fēnix 7X Pro',
  );

  it('retrouve les valeurs que Campus a enregistrées', () => {
    expect(note).toMatchObject({
      distance: 3.81099,
      time: 1801,
      activeCalories: 299,
      averageHeartRateInBeatsPerMinute: 124,
      averageRunCadenceInStepsPerMinute: 137,
      totalElevationGainInMeters: 26.63,
      externalId: '24631672339',
      name: 'Messancy Course à pied',
    });
    expect(note.pace as number).toBeCloseTo(472.5806, 3);
    expect(new Date(note.completionDate as number).toISOString()).toBe('2026-10-06T18:58:51.000Z');
  });

  it('refuse une activité sans distance', () => {
    expect(() =>
      campusRacingNote({ id: '1', startGmt: '2026-10-06T18:58:51.0', durationS: 60, distanceM: 0 }),
    ).toThrow(WorkoutError);
  });
});

describe('annotationChanges', () => {
  const current = { name: 'Messancy Course à pied', rpe: 10, feel: 50 };

  it('ne garde que ce qui change, RPE comparé sur l’échelle Garmin (×10)', () => {
    expect(annotationChanges(current, { name: 'Messancy Course à pied', rpe: 1, feel: 75 })).toEqual({
      feel: 75,
    });
    expect(annotationChanges(current, { rpe: 4, description: 'Facile' })).toEqual({
      rpe: 4,
      description: 'Facile',
    });
  });

  it('ignore un nom vide', () => {
    expect(annotationChanges(current, { name: '  ' })).toEqual({});
  });
});

describe('manualStrength (D148)', () => {
  const s = { name: 'MIX - MID - BLESSURE - SEMAINE 3 SEANCE 1', displayName: 'Renfo', durationMin: 30 };

  it('fin = validation Campus (UTC → Paris), début = fin − durée prévue', () => {
    expect(manualStrength({ ...s, completedAtUtc: '2026-10-14 17:05' })).toEqual({
      type_key: 'strength_training',
      date: '2026-10-14',
      start_time: '18:35',
      duration_minutes: 30,
      activity_name: 'CC · Renfo S3-1',
      time_zone: 'Europe/Paris',
    });
  });

  it('heure d’hiver, début la veille quand la validation suit minuit de peu', () => {
    // 23:10 UTC le 02/11 = 00:10 à Paris le 03/11 (UTC+1) ; 30 min avant : 23:40 le 02/11.
    expect(manualStrength({ ...s, completedAtUtc: '2026-11-02 23:10' })).toMatchObject({
      date: '2026-11-02',
      start_time: '23:40',
    });
  });

  it('sans instant de validation ou sans durée : rien (on n’invente pas)', () => {
    expect(manualStrength(s)).toBeNull();
    expect(manualStrength({ ...s, completedAtUtc: '2026-10-14 17:05', durationMin: 0 })).toBeNull();
  });
});
