import { legsFromExercises } from './campus.ts';
import type { PlannedSession, Sport } from './types.ts';

/**
 * Plan rédigé par Claude dans une session Claude Code puis importé (D153).
 * Format `coach-chris.plan/v1` : un bloc, ses routines, ses semaines et leurs séances.
 * Les champs restent en français : ils sont affichés tels quels dans l'app.
 */
export const CLAUDE_PLAN_FORMAT = 'coach-chris.plan/v1';

export type ClaudeSport = 'course' | 'velo' | 'rameur' | 'renfo' | 'mobilite';
export type ClaudeRole = 'fixe' | 'cle' | 'flexible' | 'optionnelle';
/** Sport par défaut de la séance flexible (réglage de l'écran Saison). */
export type FlexDefault = 'velo' | 'course';

export interface ClaudeStep {
  name: string;
  duree?: string;
  reps?: string;
  consigne?: string;
}

export interface ClaudeRoutine {
  name: string;
  dureeMin: number;
  quand?: string;
  steps?: ClaudeStep[];
  base?: string[];
  adaptations?: { si: string; alors: string }[];
}

/** Ligne du corps de séance : un bloc (titre, cible) ou un exercice. */
export interface ClaudeItem {
  bloc?: string;
  exo?: string;
  cible?: string;
  charge?: string;
  reps?: string;
  consigne?: string;
}

export interface ClaudeVariant {
  titre: string;
  dureeMin: number;
  echauffement?: string | null;
  retourAuCalme?: string | null;
  corps: ClaudeItem[];
  kinomap?: string;
}

export interface ClaudeSession extends ClaudeVariant {
  id: string;
  /** Jour prévu, AAAA-MM-JJ, dans la semaine. */
  date: string;
  sport: ClaudeSport;
  role: ClaudeRole;
  pourquoi?: string;
  alternatives?: Partial<Record<ClaudeSport, ClaudeVariant>>;
  /** Étapes pour la montre, ou description libre (renfo). */
  montre?: unknown;
  mywhoosh?: unknown;
}

export interface ClaudeWeek {
  index: number;
  /** Lundi de la semaine, AAAA-MM-JJ. */
  start: string;
  focus?: string;
  volumeCourseMin?: number;
  routineMatin?: { remplace: Record<string, string>; pourquoi?: string };
  sessions: ClaudeSession[];
}

export interface ClaudeBlock {
  id: string;
  phase: string;
  name: string;
  start: string;
  end: string;
  objectif?: string;
  rules?: Record<string, unknown>;
}

export interface ClaudePlanFile {
  format: typeof CLAUDE_PLAN_FORMAT;
  source: 'claude';
  generatedAt: string;
  athlete?: Record<string, unknown>;
  block: ClaudeBlock;
  routines: Record<string, ClaudeRoutine>;
  weeks: ClaudeWeek[];
}

const SPORTS: Record<ClaudeSport, Sport> = {
  course: 'run',
  velo: 'bike',
  rameur: 'other',
  renfo: 'strength',
  mobilite: 'other',
};

/** Affiché après la durée dans le Calendrier (« 45 min · Clé »). */
export const ROLE_LABEL: Record<ClaudeRole, string> = {
  fixe: 'Fixe',
  cle: 'Clé',
  flexible: 'Flexible',
  optionnelle: 'Optionnelle',
};

/**
 * Variante retenue d'une séance : la séance flexible prend le sport par défaut du réglage quand le plan
 * en propose une version (D153). Le choix du jour (échange) arrivera avec les check-ins.
 */
export function resolveVariant(
  s: ClaudeSession,
  flexDefault: FlexDefault,
): ClaudeVariant & { sport: ClaudeSport } {
  if (s.role === 'flexible' && s.sport !== flexDefault) {
    const alt = s.alternatives?.[flexDefault];
    if (alt) return { ...alt, sport: flexDefault };
  }
  return { ...s, sport: s.sport };
}

/** Convertit une semaine du plan Claude en séances planifiées, dans l'ordre du plan. */
export function fromClaudeWeek(week: ClaudeWeek, flexDefault: FlexDefault = 'velo'): PlannedSession[] {
  return week.sessions.map((s, index) => {
    const v = resolveVariant(s, flexDefault);
    const sport = SPORTS[v.sport];
    const exercises = v.corps.flatMap((c) => (c.exo ? [c.exo] : []));
    return {
      key: `${week.start}#${index}#${s.id}`,
      source: 'claude',
      weekDate: week.start,
      index,
      name: s.id,
      displayName: v.titre,
      sport,
      trainingType: ROLE_LABEL[s.role],
      durationMin: v.dureeMin,
      status: 'todo',
      // Phase Base : aucune séance d'intensité au sens des règles de placement (le tempo vélo reste modéré).
      intense: false,
      legs: sport === 'strength' && legsFromExercises(exercises),
      legsFrom: sport === 'strength' ? 'exercises' : 'not-strength',
      day: s.date,
    };
  });
}

/**
 * Erreurs de cohérence d'un plan déjà conforme au schéma : semaines qui ne commencent pas un lundi,
 * séances hors de leur semaine, identifiants en double, routines inconnues. Liste vide = importable.
 */
export function planProblems(plan: ClaudePlanFile): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  const routine = (where: string, id: string | null | undefined) => {
    if (id && !plan.routines[id]) out.push(`${where} : routine inconnue « ${id} »`);
  };
  for (const w of plan.weeks) {
    if (new Date(`${w.start}T12:00:00Z`).getUTCDay() !== 1)
      out.push(`semaine ${w.index} : ${w.start} n'est pas un lundi`);
    const end = addDaysIso(w.start, 6);
    for (const s of w.sessions) {
      if (ids.has(s.id)) out.push(`séance « ${s.id} » en double`);
      ids.add(s.id);
      if (s.date < w.start || s.date > end) out.push(`séance « ${s.id} » hors de la semaine ${w.index}`);
      routine(s.id, s.echauffement);
      routine(s.id, s.retourAuCalme);
      for (const [k, alt] of Object.entries(s.alternatives ?? {})) {
        routine(`${s.id} (${k})`, alt?.echauffement);
        routine(`${s.id} (${k})`, alt?.retourAuCalme);
      }
    }
  }
  if (plan.block.start > plan.block.end) out.push('bloc : début après la fin');
  return out;
}

function addDaysIso(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
