import type { CampusBlock } from './campus.ts';

/** Étape prévue d'une séance de course, à plat (les répétitions sont dépliées). */
export interface PlannedStep {
  kind: 'run' | 'walk' | 'other';
  durationS: number;
  zone?: string;
}

/** Tour Garmin réduit (get_activity_splits). */
export interface Lap {
  durationS: number;
  movingS: number;
  avgHr?: number;
  /** Pas par minute. */
  avgCadence?: number;
  /** Présent seulement pour les tours faits pendant le programme envoyé à la montre. */
  workoutStepIndex?: number;
}

export interface DeviationRules {
  /** Haut de la zone 2 Garmin : une étape de course au-dessus est trop intense (D67). */
  runMaxHr: number;
  /** Frontière de cadence entre marche et course, en pas par minute (D67). */
  cadenceRunMin: number;
  /** Écart de durée toléré, en fraction (D67 : ±10 %). */
  durationTolerance: number;
}

export const DEFAULT_RULES: DeviationRules = { runMaxHr: 151, cadenceRunMin: 130, durationTolerance: 0.1 };

export type StepIssue =
  'too-short' | 'too-long' | 'hr-too-high' | 'walked' | 'ran' | 'mostly-stopped' | 'missing';

export interface StepResult {
  n: number;
  planned: PlannedStep;
  lap?: Lap;
  /** Écarts au plan ; « mostly-stopped » est une simple information et ne compte pas comme écart. */
  issues: StepIssue[];
  compliant: boolean;
}

export interface Deviation {
  steps: StepResult[];
  compliantCount: number;
  /** Tours faits après la dernière étape du programme : retour au calme, jamais compté comme écart (D66). */
  after: { laps: number; durationS: number };
}

const toSeconds = (d: { value: number; timeUnit: string }) =>
  d.timeUnit.startsWith('min') ? d.value * 60 : d.timeUnit.startsWith('h') ? d.value * 3600 : d.value;

/** Déplie les blocs Campus en étapes. */
export function plannedSteps(blocks: CampusBlock[]): PlannedStep[] {
  return blocks.flatMap((b) =>
    Array.from({ length: b.repeat ?? 1 }, () =>
      b.exercises.map((e): PlannedStep => {
        const kind =
          e.exerciseType === 'running' ? 'run' : e.exerciseType === 'recuperation' ? 'walk' : 'other';
        const step: PlannedStep = {
          kind,
          durationS: (e.durations ?? []).reduce((s, d) => s + toSeconds(d), 0),
        };
        if (e.pace?.zoneKind) step.zone = e.pace.zoneKind;
        return step;
      }),
    ).flat(),
  );
}

/** Compare, étape par étape, les tours du programme aux étapes prévues (D66, D67). */
export function compareSteps(
  planned: PlannedStep[],
  laps: Lap[],
  rules: DeviationRules = DEFAULT_RULES,
): Deviation {
  const inWorkout = laps.filter((l) => l.workoutStepIndex !== undefined);
  const lastIndexed = laps.findLastIndex((l) => l.workoutStepIndex !== undefined);
  const afterLaps = laps.slice(lastIndexed + 1);

  const steps = planned.map((p, i): StepResult => {
    const lap = inWorkout[i];
    if (!lap) return { n: i + 1, planned: p, issues: ['missing'], compliant: false };
    const issues: StepIssue[] = [];
    const ratio = (lap.durationS - p.durationS) / p.durationS;
    if (ratio < -rules.durationTolerance) issues.push('too-short');
    if (ratio > rules.durationTolerance) issues.push('too-long');
    if (p.kind === 'run') {
      if (lap.avgHr !== undefined && lap.avgHr > rules.runMaxHr) issues.push('hr-too-high');
      if (lap.avgCadence !== undefined && lap.avgCadence < rules.cadenceRunMin) issues.push('walked');
    }
    if (p.kind === 'walk' && lap.avgCadence !== undefined && lap.avgCadence >= rules.cadenceRunMin)
      issues.push('ran');
    if (lap.movingS < lap.durationS * 0.6) issues.push('mostly-stopped');
    return { n: i + 1, planned: p, lap, issues, compliant: issues.every((x) => x === 'mostly-stopped') };
  });

  return {
    steps,
    compliantCount: steps.filter((s) => s.compliant).length,
    after: { laps: afterLaps.length, durationS: afterLaps.reduce((s, l) => s + l.durationS, 0) },
  };
}
