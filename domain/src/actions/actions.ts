import type { CampusBlock } from '../plan/campus.ts';

/** Préfixe de tout ce que l'app crée dans Garmin : elle ne modifie ou supprime que ces éléments (D40). */
export const APP_PREFIX = 'CC · ';

/** Repère court d'une séance Campus : « S2-2 » depuis Retour_Blessure_S2_2 ou « … SEMAINE 2 SEANCE 2 ». */
export function sessionShort(name: string): string | null {
  const m = /S(\d+)_(\d+)$/.exec(name) ?? /SEMAINE (\d+) SEANCE (\d+)/i.exec(name);
  return m ? `S${m[1]}-${m[2]}` : null;
}

const toSeconds = (d: { value: number; timeUnit: string }) =>
  d.timeUnit.startsWith('min') ? d.value * 60 : d.timeUnit.startsWith('h') ? d.value * 3600 : d.value;

const RUNNING = { sportTypeId: 1, sportTypeKey: 'running' };
const STEP_TYPES = {
  run: { stepTypeId: 3, stepTypeKey: 'interval' },
  walk: { stepTypeId: 4, stepTypeKey: 'recovery' },
};

/** Séance impossible à traduire fidèlement en workout : on refuse plutôt que d'inventer une étape. */
export class WorkoutError extends Error {}

/**
 * Workout Garmin (format de `upload_workout`) depuis les blocs d'une course Campus (D126) :
 * répétitions en groupes, course = intervalle, marche = récupération, fin au temps, sans cible.
 */
export function garminWorkout(input: {
  name: string;
  description?: string;
  blocks: CampusBlock[];
}): Record<string, unknown> {
  let order = 0;
  const step = (e: CampusBlock['exercises'][number]) => {
    const kind = e.exerciseType === 'running' ? 'run' : e.exerciseType === 'recuperation' ? 'walk' : null;
    if (!kind)
      throw new WorkoutError(`Étape « ${e.name} » : type ${e.exerciseType ?? 'inconnu'} non traduit`);
    const seconds = (e.durations ?? []).reduce((s, d) => s + toSeconds(d), 0);
    if (seconds <= 0) throw new WorkoutError(`Étape « ${e.name} » sans durée`);
    return {
      type: 'ExecutableStepDTO',
      stepOrder: ++order,
      stepType: STEP_TYPES[kind],
      endCondition: { conditionTypeId: 2, conditionTypeKey: 'time' },
      endConditionValue: seconds,
      targetType: { workoutTargetTypeId: 1, workoutTargetTypeKey: 'no.target' },
      ...(e.pace?.name && { description: e.pace.name }),
    };
  };
  if (!input.blocks.length) throw new WorkoutError('Séance sans étapes');
  const workoutSteps = input.blocks.map((b) => {
    const repeat = b.repeat ?? 1;
    if (repeat <= 1 && b.exercises.length === 1) return step(b.exercises[0]!);
    const groupOrder = ++order;
    return {
      type: 'RepeatGroupDTO',
      stepOrder: groupOrder,
      stepType: { stepTypeId: 6, stepTypeKey: 'repeat' },
      numberOfIterations: repeat,
      endCondition: { conditionTypeId: 7, conditionTypeKey: 'iterations' },
      endConditionValue: repeat,
      smartRepeat: false,
      workoutSteps: b.exercises.map(step),
    };
  });
  return {
    workoutName: `${APP_PREFIX}${input.name}`,
    ...(input.description && { description: input.description }),
    sportType: RUNNING,
    workoutSegments: [{ segmentOrder: 1, sportType: RUNNING, workoutSteps }],
  };
}

/** Durée totale d'un workout construit par `garminWorkout`, en secondes (pour l'aperçu). */
export function workoutSeconds(blocks: CampusBlock[]): number {
  return blocks.reduce(
    (s, b) =>
      s +
      (b.repeat ?? 1) *
        b.exercises.reduce((t, e) => t + (e.durations ?? []).reduce((u, d) => u + toSeconds(d), 0), 0),
    0,
  );
}

/** Chiffres de l'activité Garmin utiles à la validation Campus (sortie de get_activity). */
export interface ActivityFigures {
  id: string;
  /** Début de l'activité en UTC, « 2026-10-06T18:58:51.0 ». */
  startGmt: string;
  durationS: number;
  distanceM: number;
  calories?: number;
  avgHr?: number;
  avgCadence?: number;
  elevationGainM?: number;
  elevationLossM?: number;
  name?: string;
}

/**
 * Formulaire de validation Campus construit uniquement depuis l'activité (D125). Correspondance vérifiée
 * sur la séance S2-1 validée dans Campus le 06/10 : distance en km, durée arrondie, allure = durée / distance,
 * calories telles quelles, FC et cadence arrondies, date = début de l'activité.
 */
export function campusRacingNote(a: ActivityFigures, deviceName?: string): Record<string, unknown> {
  if (!(a.distanceM > 0) || !(a.durationS > 0)) {
    throw new WorkoutError('Activité sans distance ou sans durée : rien à valider');
  }
  const distance = a.distanceM / 1000;
  const time = Math.round(a.durationS);
  const note: Record<string, unknown> = {
    completionDate: Date.parse(`${a.startGmt.slice(0, 19)}Z`),
    distance,
    time,
    pace: time / distance,
    externalId: a.id,
  };
  const set = (k: string, v: unknown) => {
    if (v !== undefined) note[k] = v;
  };
  set('activeCalories', a.calories);
  set('averageHeartRateInBeatsPerMinute', a.avgHr === undefined ? undefined : Math.round(a.avgHr));
  set('averageRunCadenceInStepsPerMinute', a.avgCadence === undefined ? undefined : Math.round(a.avgCadence));
  set('totalElevationGainInMeters', a.elevationGainM);
  set('totalElevationLossInMeters', a.elevationLossM);
  set('name', a.name);
  set('deviceName', deviceName);
  return note;
}

/** Ressenti Garmin (« Comment vous sentiez-vous ? ») : seules valeurs acceptées. */
export const FEEL_VALUES = [0, 25, 50, 75, 100] as const;
export const FEEL_LABEL: Record<(typeof FEEL_VALUES)[number], string> = {
  0: 'très faible',
  25: 'faible',
  50: 'normal',
  75: 'fort',
  100: 'très fort',
};

export interface Annotation {
  name?: string;
  description?: string;
  /** Effort perçu 1–10 ; Garmin le stocke ×10 (`workout_rpe: 10` = 1/10, D127). */
  rpe?: number;
  feel?: (typeof FEEL_VALUES)[number];
}

/** Champs réellement modifiés par rapport à l'activité (`current` est sur l'échelle Garmin, RPE ×10). */
export function annotationChanges(
  current: { name?: string; description?: string; rpe?: number; feel?: number },
  wanted: Annotation,
): Annotation {
  const out: Annotation = {};
  if (wanted.name !== undefined && wanted.name.trim() && wanted.name.trim() !== current.name) {
    out.name = wanted.name.trim();
  }
  if (wanted.description !== undefined && wanted.description !== (current.description ?? '')) {
    out.description = wanted.description;
  }
  if (wanted.rpe !== undefined && wanted.rpe * 10 !== current.rpe) out.rpe = wanted.rpe;
  if (wanted.feel !== undefined && wanted.feel !== current.feel) out.feel = wanted.feel;
  return out;
}

/** Activité Garmin « Musculation » saisie à la main pour une séance de renforcement faite sans la montre (D148). */
export interface ManualStrength {
  type_key: 'strength_training';
  /** Jour et heure de début, à Paris. */
  date: string;
  start_time: string;
  duration_minutes: number;
  activity_name: string;
  time_zone: 'Europe/Paris';
}

/**
 * La séance se termine à l'instant où elle a été validée dans Campus ; elle a duré le temps prévu (Campus ne
 * donne pas la durée réelle). Sans instant de validation ou sans durée, rien n'est créé : on n'invente pas.
 */
export function manualStrength(s: {
  name: string;
  displayName: string;
  durationMin: number;
  completedAtUtc?: string;
}): ManualStrength | null {
  if (!s.completedAtUtc || s.durationMin <= 0) return null;
  const end = new Date(`${s.completedAtUtc.replace(' ', 'T')}:00Z`);
  if (Number.isNaN(end.getTime())) return null;
  const start = new Date(end.getTime() - s.durationMin * 60_000);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(start)
      .map((p) => [p.type, p.value]),
  );
  return {
    type_key: 'strength_training',
    date: `${parts.year}-${parts.month}-${parts.day}`,
    start_time: `${parts.hour}:${parts.minute}`,
    duration_minutes: s.durationMin,
    activity_name: `${APP_PREFIX}Renfo ${sessionShort(s.name) ?? s.displayName}`,
    time_zone: 'Europe/Paris',
  };
}
