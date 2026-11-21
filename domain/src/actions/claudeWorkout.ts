import type { ClaudeContentVariant, ClaudeItem } from '../plan/claude.ts';
import { APP_PREFIX, WorkoutError } from './actions.ts';

/**
 * Workouts des séances du plan Claude (D160). Garmin : course (étapes « montre » du plan, cible FC) et
 * renforcement ; pas de rameur (D163 : aucun entraînement rameur côté Garmin, il serait enregistré en cardio) ; MyWhoosh : vélo (étapes « mywhoosh » du plan, puissance en fraction de FTP).
 * Rien n'est inventé : une séance sans structure exploitable est refusée avec une raison lisible.
 */

const LAP = { conditionTypeId: 1, conditionTypeKey: 'lap.button' };
const TIME = { conditionTypeId: 2, conditionTypeKey: 'time' };
const NO_TARGET = { workoutTargetTypeId: 1, workoutTargetTypeKey: 'no.target' };
const HR = { workoutTargetTypeId: 4, workoutTargetTypeKey: 'heart.rate.zone' };
const STEP = {
  warmup: { stepTypeId: 1, stepTypeKey: 'warmup' },
  cooldown: { stepTypeId: 2, stepTypeKey: 'cooldown' },
  interval: { stepTypeId: 3, stepTypeKey: 'interval' },
  recovery: { stepTypeId: 4, stepTypeKey: 'recovery' },
  repeat: { stepTypeId: 6, stepTypeKey: 'repeat' },
} as const;
const SPORTS = {
  course: { sportTypeId: 1, sportTypeKey: 'running' },
  renfo: { sportTypeId: 5, sportTypeKey: 'strength_training' },
} as const;
export type GarminClaudeSport = keyof typeof SPORTS;

/** Borne basse de FC quand le plan ne donne qu'un plafond (« FC ≤ 140 ») : Garmin veut un intervalle. */
export const HR_FLOOR = 90;

/** Étape « montre » du plan (champ `montre` d'une séance de course). */
interface WatchStep {
  type: 'warmup' | 'run' | 'interval' | 'recovery' | 'cooldown';
  dureeMin?: number;
  fin?: string;
  note?: string;
  cible?: { fc?: [number | null, number] };
}

function watchSteps(raw: unknown): WatchStep[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const ok = raw.every(
    (s) =>
      s &&
      typeof s === 'object' &&
      ['warmup', 'run', 'interval', 'recovery', 'cooldown'].includes((s as WatchStep).type),
  );
  return ok ? (raw as WatchStep[]) : null;
}

export function garminSportOf(sport: string): GarminClaudeSport | null {
  return sport in SPORTS ? (sport as GarminClaudeSport) : null;
}

/** Workout Garmin (format `upload_workout`) d'une séance Claude. */
export function claudeGarminWorkout(input: {
  name: string;
  variant: ClaudeContentVariant;
  /** Étapes « montre » du plan, pour la course. */
  watch?: unknown;
}): Record<string, unknown> {
  const sport = garminSportOf(input.variant.sport);
  if (!sport) throw new WorkoutError(`Une séance ${input.variant.sport} ne s'envoie pas sur la montre`);
  let order = 0;
  const step = (kind: keyof typeof STEP, end: object, extra: Record<string, unknown> = {}) => ({
    type: 'ExecutableStepDTO',
    stepOrder: ++order,
    stepType: STEP[kind],
    endCondition: end,
    targetType: NO_TARGET,
    ...extra,
  });
  const warmup = () =>
    step('warmup', LAP, {
      description: input.variant.warmup
        ? `${input.variant.warmup.name} (voir l'app), puis Tour`
        : 'Échauffement, puis Tour',
    });

  let workoutSteps: unknown[];
  if (sport === 'course') {
    const ws = watchSteps(input.watch);
    if (!ws) throw new WorkoutError('Course sans étapes « montre » dans le plan : rien de fiable à envoyer');
    workoutSteps = ws.map((s) => {
      if (s.type === 'warmup' && !s.dureeMin) return warmup();
      if (!s.dureeMin) throw new WorkoutError(`Étape ${s.type} sans durée`);
      const kind = s.type === 'run' ? 'interval' : s.type;
      const fc = s.cible?.fc;
      return step(kind, TIME, {
        endConditionValue: s.dureeMin * 60,
        ...(fc && { targetType: HR, targetValueOne: fc[0] ?? HR_FLOOR, targetValueTwo: fc[1] }),
        ...(s.note && { description: s.note }),
      });
    });
  } else {
    workoutSteps = [warmup(), ...strengthSteps(input.variant.corps, step)];
  }
  return {
    workoutName: `${APP_PREFIX}${input.name}`,
    sportType: SPORTS[sport],
    workoutSegments: [{ segmentOrder: 1, sportType: SPORTS[sport], workoutSteps }],
  };
}

/**
 * Renforcement : un bloc « Circuit × N tours » devient un groupe répété N fois ; chaque exercice est une
 * étape terminée par Tour, avec charge et répétitions en description. Les blocs sans « × N » restent à plat.
 */
function strengthSteps(
  corps: ClaudeItem[],
  step: (
    kind: 'interval' | 'repeat',
    end: object,
    extra?: Record<string, unknown>,
  ) => Record<string, unknown>,
): unknown[] {
  const out: unknown[] = [];
  let group: { reps: number; steps: unknown[]; order: Record<string, unknown> } | null = null;
  const flush = () => {
    if (group?.steps.length) {
      Object.assign(group.order, {
        type: 'RepeatGroupDTO',
        stepType: STEP.repeat,
        numberOfIterations: group.reps,
        endCondition: { conditionTypeId: 7, conditionTypeKey: 'iterations' },
        endConditionValue: group.reps,
        smartRepeat: false,
        workoutSteps: group.steps,
      });
      delete group.order.targetType;
      out.push(group.order);
    }
    group = null;
  };
  for (const c of corps) {
    if (c.bloc) {
      flush();
      const reps = Number(/×\s*(\d+)/.exec(c.bloc)?.[1] ?? 1);
      if (reps > 1) group = { reps, steps: [], order: step('repeat', {}) };
      continue;
    }
    if (!c.exo) continue;
    const s = step('interval', LAP, {
      description: [c.exo, c.charge, c.reps].filter(Boolean).join(' · ').slice(0, 250),
    });
    if (group) group.steps.push(s);
    else out.push(s);
  }
  flush();
  if (!out.length) throw new WorkoutError('Renforcement sans exercice');
  return out;
}

/** Étape « mywhoosh » du plan : FTP en fraction, rampe [début, fin] pour l'échauffement et le retour au calme. */
interface WhooshPlanStep {
  type: 'E_Normal' | 'E_WarmUp' | 'E_CoolDown' | 'E_FreeRide';
  dureeMin: number;
  ftp: number | [number, number];
  repeat?: number;
  recup?: { dureeMin: number; ftp: number };
}

/** Identifiant MyWhoosh stable par séance : un renvoi met à jour le même workout au lieu d'en créer un autre. */
export function whooshId(sessionKey: string): number {
  let h = 0xcbf29ce484222325n;
  for (const ch of sessionKey) {
    h ^= BigInt(ch.codePointAt(0)!);
    h = (h * 0x100000001b3n) & 0xffffffffffffn;
  }
  return Number(h % 900_000_000_000n) + 100_000_000_000;
}

/**
 * Workout MyWhoosh (outil `uploadCustomWorkout` du serveur communautaire, D160) depuis le champ `mywhoosh`
 * d'une séance vélo : temps en secondes, puissance en fraction de FTP, répétitions dépliées avec un même IntervalId.
 */
export function claudeWhooshWorkout(input: {
  sessionKey: string;
  name: string;
  description?: string;
  plan: unknown;
}): Record<string, unknown> {
  const p = input.plan as { etapes?: WhooshPlanStep[] } | undefined;
  if (!p?.etapes?.length) throw new WorkoutError('Séance vélo sans étapes « mywhoosh » dans le plan');
  const steps: Record<string, unknown>[] = [];
  let interval = 0;
  const push = (
    type: WhooshPlanStep['type'],
    min: number,
    ftp: number | [number, number],
    intervalId = 0,
  ) => {
    if (!(min > 0)) throw new WorkoutError('Étape vélo sans durée');
    const ramp = Array.isArray(ftp);
    steps.push({
      Id: steps.length + 1,
      StepType: type,
      Time: Math.round(min * 60),
      Power: ramp ? 0 : ftp,
      StartPower: ramp ? ftp[0] : 0,
      EndPower: ramp ? ftp[1] : 0,
      IntervalId: intervalId,
      Rpm: 0,
      Pace: 1,
      WorkoutMessage: [],
    });
  };
  for (const e of p.etapes) {
    if ((e.repeat ?? 1) > 1) {
      interval++;
      for (let i = 0; i < e.repeat!; i++) {
        push(e.type, e.dureeMin, e.ftp, interval);
        if (e.recup) push('E_Normal', e.recup.dureeMin, e.recup.ftp, interval);
      }
    } else push(e.type, e.dureeMin, e.ftp);
  }
  const time = steps.reduce((s, x) => s + (x.Time as number), 0);
  return {
    Id: whooshId(input.sessionKey),
    Name: `${APP_PREFIX}${input.name}`,
    Description: input.description ?? '',
    Mode: 'E_Ride',
    Type: 'E_Custom',
    CategoryId: 1,
    DisplayType: 'E_byWatts',
    IsIntervals: interval > 0,
    Time: time,
    StepCount: steps.length,
    WorkoutStepsArray: steps,
    AuthorName: 'CoachChris',
  };
}
