import type { CheckinDay } from '../checkin/checkin.ts';
import { PAIN_LIMIT } from '../checkin/checkin.ts';
import type { ClaudeRole, ClaudeSport, FlexDefault } from '../plan/claude.ts';

/**
 * Revue du dimanche (D161) : règles fixes, jamais décidées par un modèle. Elle lit la semaine écoulée
 * (séances faites, check-ins, volume de course réel) et propose la semaine suivante : progresser, tenir
 * ou alléger, avec les durées de course ajustées et le sport conseillé pour la séance flexible.
 * L'utilisateur accepte, modifie ou ignore ; rien ne change sans son accord.
 */

export type Verdict = 'progress' | 'hold' | 'step-back';
export type Level = 'ok' | 'warn' | 'alert';

/** Progression maximale du volume de course d'une semaine à l'autre (décision du 20/11). */
export const MAX_WEEKLY_GROWTH = 0.15;
/** Ratio charge aiguë / chronique à ne pas dépasser (D90). */
export const ACWR_MAX = 1.3;
/** Allègement d'une semaine « alléger » : −20 % du volume de course. */
export const STEP_BACK = 0.8;
/** Check-ins du pied attendus sur la semaine pour juger la douleur. */
export const MIN_FOOT_CHECKINS = 3;
const MIN_RUN_MIN = 15;

export interface ReviewSession {
  id: string;
  role: ClaudeRole;
  /** Sport retenu (échange du jour compris). */
  sport: ClaudeSport;
  dureeMin: number;
  done: boolean;
  /** Séance flexible : durée de sa variante course, si le plan en propose une. */
  courseMin?: number;
}

export interface ReviewInput {
  /** Lundi de la semaine revue. */
  week: string;
  sessions: ReviewSession[];
  checkins: CheckinDay[];
  /** Minutes de course réelles de la semaine revue (activités Garmin). */
  runMinutes: number;
  /** Minutes de course réelles des semaines précédentes, de la plus ancienne à la plus récente. */
  previousRunMinutes: number[];
  /** Semaine suivante du plan, telle que prévue (sport par défaut pour la séance flexible). */
  next: ReviewSession[];
}

export interface ReviewReason {
  rule: 'pain' | 'checkins' | 'completion' | 'growth' | 'acwr' | 'ok';
  level: Level;
  text: string;
}

export interface ReviewProposal {
  week: string;
  verdict: Verdict;
  reasons: ReviewReason[];
  pain: {
    footMax: number | null;
    footDaysOver: number;
    footDays: number;
    shinMax: number | null;
    shinOver: number;
  };
  completion: { fixedDone: number; fixedTotal: number; done: number; total: number };
  volume: {
    actual: number;
    /** Moyenne des 4 dernières semaines (semaine revue comprise) ; `null` sans 4 semaines d'historique. */
    chronic: number | null;
    plannedNext: number;
    proposedNext: number;
    /** Ratio de la semaine proposée sur la charge chronique. */
    acwrNext: number | null;
  };
  /** Nouvelles durées des séances de course de la semaine suivante, par identifiant. */
  adjustments: Record<string, { from: number; to: number }>;
  /** Sport conseillé pour la séance flexible de la semaine suivante. */
  flex: FlexDefault;
}

const round5 = (n: number) => Math.max(MIN_RUN_MIN, Math.round(n / 5) * 5);
const runMinutesOf = (s: ReviewSession[]) =>
  s.filter((x) => x.sport === 'course').reduce((t, x) => t + x.dureeMin, 0);

export function weeklyReview(input: ReviewInput): ReviewProposal {
  const reasons: ReviewReason[] = [];

  // Douleur : pied au premier pas (chaque matin) et tibia (après chaque course).
  const feet = input.checkins.flatMap((d) => (d.foot === undefined ? [] : [d.foot]));
  const shins = input.checkins.flatMap((d) =>
    Object.values(d.sessions ?? {}).flatMap((s) => (s.shin === undefined ? [] : [s.shin])),
  );
  const footDaysOver = feet.filter((n) => n > PAIN_LIMIT).length;
  const shinOver = shins.filter((n) => n > PAIN_LIMIT).length;
  const worst = Math.max(-1, ...feet, ...shins);
  const pain = {
    footMax: feet.length ? Math.max(...feet) : null,
    footDaysOver,
    footDays: feet.length,
    shinMax: shins.length ? Math.max(...shins) : null,
    shinOver,
  };
  let alert = false;
  let warn = false;
  if (worst >= 6 || footDaysOver >= 3 || shinOver >= 2) {
    alert = true;
    reasons.push({
      rule: 'pain',
      level: 'alert',
      text:
        worst >= 6
          ? `Douleur à ${worst}/10 cette semaine : on allège et on en parle au kiné si ça persiste.`
          : footDaysOver >= 3
            ? `Pied au-dessus de 3/10 sur ${footDaysOver} matins : on allège.`
            : `Tibia au-dessus de 3/10 après ${shinOver} courses : on allège.`,
    });
  } else if (worst > PAIN_LIMIT) {
    warn = true;
    reasons.push({
      rule: 'pain',
      level: 'warn',
      text: `Douleur ponctuelle à ${worst}/10 : on tient le volume une semaine de plus.`,
    });
  }
  if (feet.length < MIN_FOOT_CHECKINS) {
    warn = true;
    reasons.push({
      rule: 'checkins',
      level: 'warn',
      text: `Seulement ${feet.length} check-in${feet.length > 1 ? 's' : ''} du pied sur la semaine : sans données, on ne monte pas.`,
    });
  }

  // Assiduité : les deux courses fixes portent la progression.
  const fixed = input.sessions.filter((s) => s.role === 'fixe');
  const fixedDone = fixed.filter((s) => s.done).length;
  const completion = {
    fixedDone,
    fixedTotal: fixed.length,
    done: input.sessions.filter((s) => s.done).length,
    total: input.sessions.length,
  };
  if (fixedDone < fixed.length) {
    warn = true;
    reasons.push({
      rule: 'completion',
      level: 'warn',
      text: `${fixed.length - fixedDone} séance${fixed.length - fixedDone > 1 ? 's' : ''} fixe${fixed.length - fixedDone > 1 ? 's' : ''} non faite${fixed.length - fixedDone > 1 ? 's' : ''} : la semaine suivante reprend le même volume.`,
    });
  }

  const verdict: Verdict = alert ? 'step-back' : warn ? 'hold' : 'progress';

  // Volume de course de la semaine suivante.
  const plannedNext = runMinutesOf(input.next);
  const base = input.runMinutes > 0 ? input.runMinutes : runMinutesOf(input.sessions);
  const history = [...input.previousRunMinutes, input.runMinutes].slice(-4);
  const chronic = history.length === 4 ? history.reduce((s, x) => s + x, 0) / 4 : null;
  // Plafond de la semaine suivante selon le verdict ; la cible est le plan, ramené sous ce plafond.
  let ceiling =
    verdict === 'step-back' ? base * STEP_BACK : verdict === 'hold' ? base : base * (1 + MAX_WEEKLY_GROWTH);
  if (verdict === 'progress' && plannedNext > base * (1 + MAX_WEEKLY_GROWTH)) {
    reasons.push({
      rule: 'growth',
      level: 'warn',
      text: `Le plan prévoyait ${plannedNext} min de course : ramené à +15 % de cette semaine (${Math.round(base)} min).`,
    });
  }
  if (chronic && ceiling > chronic * ACWR_MAX) {
    ceiling = chronic * ACWR_MAX;
    if (plannedNext > ceiling) {
      reasons.push({
        rule: 'acwr',
        level: 'warn',
        text: `Charge des 4 dernières semaines : ${Math.round(chronic)} min en moyenne ; plafond à ×1,3 (${Math.round(ceiling)} min).`,
      });
    }
  }
  const target = Math.min(plannedNext, ceiling);

  // Durées : les courses de la semaine suivante à l'échelle de la cible, arrondies à 5 min.
  const adjustments: ReviewProposal['adjustments'] = {};
  const runs = input.next.filter((s) => s.sport === 'course');
  const ratio = plannedNext > 0 ? target / plannedNext : 1;
  if (ratio < 0.999) {
    const to = new Map(runs.map((s) => [s.id, round5(s.dureeMin * ratio)]));
    // L'arrondi ne doit jamais faire dépasser la cible : on retire 5 min à la plus longue tant qu'il le faut.
    const total = () => [...to.values()].reduce((a, b) => a + b, 0);
    while (total() > target) {
      const [id, min] = [...to].sort((a, b) => b[1] - a[1])[0]!;
      if (min - 5 < MIN_RUN_MIN) break;
      to.set(id, min - 5);
    }
    for (const s of runs) {
      const v = to.get(s.id)!;
      if (v !== s.dureeMin) adjustments[s.id] = { from: s.dureeMin, to: v };
    }
  }
  const proposedNext = runs.reduce((t, s) => t + (adjustments[s.id]?.to ?? s.dureeMin), 0);

  // 3e course seulement après une semaine entièrement verte, et si elle tient dans la cible de volume.
  const flexRun = input.next.find((s) => s.role === 'flexible' && s.sport !== 'course')?.courseMin ?? 0;
  const green = verdict === 'progress' && footDaysOver === 0 && shinOver === 0;
  const fits = flexRun > 0 && proposedNext + flexRun <= ceiling;
  const flex: FlexDefault = green && fits ? 'course' : 'velo';
  if (green && flexRun > 0 && !fits) {
    reasons.push({
      rule: 'growth',
      level: 'ok',
      text: `3e course pas encore : avec elle, la semaine passerait à ${proposedNext + flexRun} min de course (plafond ${Math.round(ceiling)} min).`,
    });
  }
  if (verdict === 'progress') {
    reasons.unshift({
      rule: 'ok',
      level: 'ok',
      text:
        flex === 'course'
          ? 'Semaine verte : progression du plan, 3e course possible pour la séance flexible.'
          : 'Semaine verte : progression du plan.',
    });
  }

  return {
    week: input.week,
    verdict,
    reasons,
    pain,
    completion,
    volume: {
      actual: Math.round(input.runMinutes),
      chronic: chronic === null ? null : Math.round(chronic),
      plannedNext,
      proposedNext: proposedNext + (flex === 'course' ? flexRun : 0),
      acwrNext: chronic
        ? Math.round(((proposedNext + (flex === 'course' ? flexRun : 0)) / chronic) * 100) / 100
        : null,
    },
    adjustments,
    flex,
  };
}

/** Revue acceptée (avec les retouches de l'utilisateur), appliquée à la semaine suivante. */
export interface AcceptedReview {
  week: string;
  verdict: Verdict;
  /** Durées retenues pour la semaine suivante, par identifiant de séance. */
  durations: Record<string, number>;
  flex: FlexDefault;
  acceptedAt: string;
}

/** Réponse de GET /api/review. */
export interface ReviewView {
  /** Lundi de la semaine revue. */
  week: string;
  proposal: ReviewProposal | null;
  accepted: AcceptedReview | null;
  /** Lundi de la semaine suivante, que la revue ajuste. */
  nextWeek: string;
  /** Raison quand aucune revue n'est possible (semaine Campus, pas de plan Claude). */
  unavailable?: string;
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  progress: 'Progresser',
  hold: 'Tenir',
  'step-back': 'Alléger',
};
