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

type Figures = Lap & { maxHr?: number; distanceM?: number; speedMps?: number; powerW?: number };
const SUMMED = ['durationS', 'movingS', 'distanceM'] as const;
const AVERAGED = ['avgHr', 'avgCadence', 'speedMps', 'powerW'] as const;

/**
 * Regroupe les tours consécutifs d'une même étape du programme. Le tour automatique de la montre (tous les
 * 500 m par exemple) coupe une étape en plusieurs tours qui portent le même `workoutStepIndex` : sans ce
 * regroupement, tout le reste de la séance était décalé d'un cran (S2-3 du 10/10).
 */
export function stepLaps<T extends Lap>(laps: T[]): T[] {
  const groups: T[][] = [];
  for (const lap of laps) {
    const last = groups.at(-1);
    if (last && last[0]!.workoutStepIndex === lap.workoutStepIndex) last.push(lap);
    else groups.push([lap]);
  }
  return groups.map((g) => (g.length === 1 ? g[0]! : mergeLaps(g)));
}

/** FC, cadence et puissance en entiers, comme les tours de Garmin ; la vitesse garde ses décimales. */
const round = (k: (typeof AVERAGED)[number], v: number) => (k === 'speedMps' ? v : Math.round(v));

/** Un tour pour plusieurs : durées et distances additionnées, moyennes pondérées par la durée, FC max. */
function mergeLaps<T extends Lap>(group: T[]): T {
  const out: Figures = { ...group[0]! };
  const total = group.reduce((n, l) => n + l.durationS, 0);
  for (const k of SUMMED) {
    const v = group.map((l) => (l as Figures)[k]);
    if (v.every((x) => x !== undefined)) out[k] = v.reduce((a, b) => a! + b!, 0)!;
  }
  for (const k of AVERAGED) {
    const v = group.map((l) => (l as Figures)[k]);
    if (v.every((x) => x !== undefined) && total > 0)
      out[k] = round(k, group.reduce((a, l, i) => a + v[i]! * l.durationS, 0) / total);
  }
  const max = group.map((l) => (l as Figures).maxHr);
  if (max.every((x) => x !== undefined)) out.maxHr = Math.max(...(max as number[]));
  return out as T;
}

/** Compare, étape par étape, les tours du programme aux étapes prévues (D66, D67). */
export function compareSteps(
  planned: PlannedStep[],
  laps: Lap[],
  rules: DeviationRules = DEFAULT_RULES,
): Deviation {
  const inWorkout = stepLaps(laps.filter((l) => l.workoutStepIndex !== undefined));
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
