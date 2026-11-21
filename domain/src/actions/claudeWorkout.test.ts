import { describe, expect, it } from 'vitest';
import type { ClaudeContentVariant } from '../plan/claude.ts';
import { WorkoutError } from './actions.ts';
import { claudeGarminWorkout, claudeWhooshWorkout, HR_FLOOR, whooshId } from './claudeWorkout.ts';

const RUN: ClaudeContentVariant = {
  sport: 'course',
  titre: 'Course facile',
  dureeMin: 30,
  warmup: { id: 'ech', name: 'Échauffement course', dureeMin: 8, steps: [] },
  corps: [],
};
const WATCH = [
  { type: 'warmup', fin: 'bouton tour', note: 'Échauffement (voir app)' },
  { type: 'run', dureeMin: 30, cible: { fc: [null, 140] } },
  { type: 'cooldown', dureeMin: 5 },
];

describe('claudeGarminWorkout', () => {
  it('course : échauffement au bouton Tour, 30 min sous 140, retour au calme', () => {
    const w = claudeGarminWorkout({ name: 'Course facile', variant: RUN, watch: WATCH });
    expect(w).toMatchObject({ workoutName: 'CC · Course facile', sportType: { sportTypeKey: 'running' } });
    const steps = (w.workoutSegments as { workoutSteps: Record<string, unknown>[] }[])[0]!.workoutSteps;
    expect(
      steps.map((s) => [(s.stepType as { stepTypeKey: string }).stepTypeKey, s.endConditionValue]),
    ).toEqual([
      ['warmup', undefined],
      ['interval', 1800],
      ['cooldown', 300],
    ]);
    expect(steps[1]).toMatchObject({ targetValueOne: HR_FLOOR, targetValueTwo: 140 });
    expect(steps[0]!.endCondition).toEqual({ conditionTypeId: 1, conditionTypeKey: 'lap.button' });
  });

  it('course sans étapes « montre » : refusée plutôt qu’inventée', () => {
    expect(() => claudeGarminWorkout({ name: 'x', variant: RUN })).toThrow(WorkoutError);
  });

  it('renforcement : circuit × 3 en groupe répété, exercices au bouton Tour', () => {
    const w = claudeGarminWorkout({
      name: 'Séance clé',
      variant: {
        sport: 'renfo',
        titre: 'Séance clé',
        dureeMin: 45,
        corps: [
          { bloc: 'Circuit × 3 tours' },
          { exo: 'Fente statique', charge: '2 × 10 kg', reps: '8 / jambe' },
          { exo: 'Relevés tibial', reps: '20' },
          { bloc: 'Finisher pied · 5 min' },
          { exo: 'Pied court', reps: '10 × 5 s' },
        ],
      },
    });
    expect(w.sportType).toEqual({ sportTypeId: 5, sportTypeKey: 'strength_training' });
    const steps = (w.workoutSegments as { workoutSteps: Record<string, unknown>[] }[])[0]!.workoutSteps;
    expect(steps.map((s) => s.type)).toEqual(['ExecutableStepDTO', 'RepeatGroupDTO', 'ExecutableStepDTO']);
    expect(steps[1]).toMatchObject({ numberOfIterations: 3 });
    expect((steps[1]!.workoutSteps as { description: string }[]).map((s) => s.description)).toEqual([
      'Fente statique · 2 × 10 kg · 8 / jambe',
      'Relevés tibial · 20',
    ]);
    expect(steps[2]!.description).toBe('Pied court · 10 × 5 s');
  });

  it('rameur, vélo et mobilité ne partent pas sur la montre', () => {
    for (const sport of ['rameur', 'velo', 'mobilite'] as const) {
      expect(() =>
        claudeGarminWorkout({ name: 'x', variant: { sport, titre: 'x', dureeMin: 20, corps: [] } }),
      ).toThrow(WorkoutError);
    }
  });
});

describe('claudeWhooshWorkout', () => {
  const plan = {
    nom: 'CC · Tempo 3×7',
    etapes: [
      { type: 'E_WarmUp', dureeMin: 10, ftp: [0.5, 0.72] },
      { type: 'E_Normal', dureeMin: 7, ftp: 0.82, repeat: 3, recup: { dureeMin: 3, ftp: 0.6 } },
      { type: 'E_CoolDown', dureeMin: 5, ftp: [0.5, 0.45] },
    ],
  };

  it('déplie les répétitions avec un même IntervalId et totalise le temps', () => {
    const w = claudeWhooshWorkout({ sessionKey: '2026-11-30#2#s2-mer-flex', name: 'Vélo tempo', plan });
    const steps = w.WorkoutStepsArray as Record<string, unknown>[];
    expect(steps).toHaveLength(8);
    expect(steps.map((s) => s.IntervalId)).toEqual([0, 1, 1, 1, 1, 1, 1, 0]);
    expect(steps[0]).toMatchObject({
      StepType: 'E_WarmUp',
      Power: 0,
      StartPower: 0.5,
      EndPower: 0.72,
      Time: 600,
    });
    expect(steps[1]).toMatchObject({ StepType: 'E_Normal', Power: 0.82, Time: 420 });
    expect(w).toMatchObject({
      Name: 'CC · Vélo tempo',
      StepCount: 8,
      Time: 600 + 3 * 600 + 300,
      IsIntervals: true,
    });
  });

  it('identifiant stable par séance, différent d’une séance à l’autre', () => {
    const a = whooshId('2026-11-30#2#s2-mer-flex');
    expect(a).toBe(whooshId('2026-11-30#2#s2-mer-flex'));
    expect(a).not.toBe(whooshId('2026-11-23#2#s1-mer-flex'));
    expect(Number.isSafeInteger(a) && a > 1e11).toBe(true);
  });

  it('sans étapes : refusé', () => {
    expect(() => claudeWhooshWorkout({ sessionKey: 'k', name: 'x', plan: {} })).toThrow(WorkoutError);
  });
});
