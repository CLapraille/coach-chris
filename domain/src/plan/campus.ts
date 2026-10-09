import type { PlannedSession, SessionStatus, Sport } from './types.ts';

/** Sous-ensemble de la sortie de get_training_plan (MCP campus-coach). */
export interface CampusSessionSummary {
  weekId: string;
  sessionIndex: number;
  displayName: string;
  name: string;
  status: string;
  trainingType: string;
  sport: string;
  test?: boolean;
  weekDate: string;
  duration?: { value: number; timeUnit: string };
  stats?: { expectedDuration?: number };
}

export interface CampusWeek {
  weekId: string;
  weekDate: string;
  sessions: CampusSessionSummary[];
}

/** Sous-ensemble de la sortie de get_session_details. */
export interface CampusSessionDetails {
  racingNote?: { externalId?: string; completionDate?: string };
  exercisesBlocks?: CampusBlock[];
}

export interface CampusBlock {
  repeat?: number;
  exercises: {
    name: string;
    exerciseType?: string;
    durations?: { value: number; timeUnit: string }[];
    pace?: { zoneKind?: string; name?: string };
  }[];
}

const SPORTS: Record<string, Sport> = { road: 'run', trail: 'run', trailV2: 'run', ppg: 'strength' };
const STATUSES: Record<string, SessionStatus> = {
  todo: 'todo',
  done: 'done',
  skip: 'skipped',
  skipped: 'skipped',
};
const INTENSE_TYPES = new Set(['Intensity', 'Competition']);
/** Mots qui désignent un exercice de jambes dans les noms Campus (« Chaise », « Mollet statique »…). */
const LEG_WORDS = /chaise|mollet|squat|fente|pont|jambe|cuisse|ischio|quadri|fessier|step|saut|pistol/i;

export function legsFromExercises(names: string[]): boolean {
  return names.some((n) => LEG_WORDS.test(n));
}

function durationMin(s: CampusSessionSummary): number {
  if (s.duration?.timeUnit === 'minutes') return s.duration.value;
  return Math.round((s.stats?.expectedDuration ?? 0) / 60);
}

/** Convertit une semaine Campus en séances planifiées. `details` est indexé par sessionIndex. */
export function fromCampusWeek(
  week: CampusWeek,
  details: Map<number, CampusSessionDetails> = new Map(),
): PlannedSession[] {
  const weekDate = week.weekDate.slice(0, 10);
  return week.sessions.map((s) => {
    const sport = SPORTS[s.sport] ?? 'other';
    const d = details.get(s.sessionIndex);
    const exercises = (d?.exercisesBlocks ?? []).flatMap((b) => b.exercises.map((e) => e.name));
    const legsKnown = sport === 'strength' && exercises.length > 0;
    const session: PlannedSession = {
      key: `${weekDate}#${s.sessionIndex}#${s.name}`,
      source: 'campus',
      weekDate,
      index: s.sessionIndex,
      name: s.name,
      displayName: s.displayName,
      sport,
      trainingType: s.trainingType,
      durationMin: durationMin(s),
      status: STATUSES[s.status] ?? 'todo',
      intense: INTENSE_TYPES.has(s.trainingType) || s.test === true,
      // Sans le détail des exercices, on suppose un renforcement jambes : c'est le cas le plus prudent pour la règle 3 (D60).
      legs: sport === 'strength' && (legsKnown ? legsFromExercises(exercises) : true),
      legsFrom: sport !== 'strength' ? 'not-strength' : legsKnown ? 'exercises' : 'assumed',
      sourceSport: s.sport,
      campusRef: { weekId: s.weekId, sessionIndex: s.sessionIndex },
    };
    if (d?.racingNote?.externalId) session.externalActivityId = d.racingNote.externalId;
    if (d?.racingNote?.completionDate) session.completedAtUtc = d.racingNote.completionDate;
    return session;
  });
}
