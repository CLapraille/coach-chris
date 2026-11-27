import type { AcceptedReview } from '../review/weekly.ts';
import type { Night } from '../api.ts';
import type { SessionCheckin } from '../checkin/checkin.ts';
import { activitySport } from '../plan/matching.ts';
import type { PlanSource, Sport } from '../plan/types.ts';

/**
 * Bilan pour Claude (D171) : ce que l'app sait des dernières semaines, en texte à coller dans une session
 * Claude pour rédiger le bloc suivant (format coach-chris.plan/v1). Mise en forme pure : le BFF rassemble
 * les données, cette fonction ne décide rien.
 */

export interface BriefActivity {
  day: string;
  type: string;
  name?: string;
  durationS: number;
  distanceM?: number;
  avgHr?: number;
  /** Course : temps réellement couru, sans la marche (D178). */
  runningS?: number;
  /** Course faite à l'intérieur (tapis) : FC en général plus haute (D178). */
  indoor?: boolean;
}

export interface BriefSession {
  title: string;
  sport: Sport;
  /** Rôle (« Fixe », « Clé »… pour le plan Claude) ou type d'entraînement Campus. */
  role: string;
  /** Jour prévu par le plan, sinon jour placé par l'app. */
  plannedDay?: string;
  plannedMin: number;
  /** Échauffement et retour au calme prévus en plus (D178). */
  extraMin?: number;
  /** Faite : jour réel et activité Garmin rattachée, si elle est en cache. */
  done?: { day: string; activity?: BriefActivity };
  checkin?: SessionCheckin;
}

export interface BriefWeek {
  monday: string;
  source: PlanSource | null;
  block?: { name: string; phase: string; start: string; end: string; objectif?: string };
  focus?: string;
  sessions: BriefSession[];
  /** Toutes les activités sportives de la semaine (marches exclues), rattachées ou non. */
  activities: BriefActivity[];
  /** Activités sans séance. */
  offPlan: BriefActivity[];
  /** Douleur du pied au premier pas, par jour. */
  foot: Record<string, number>;
  /** Revue acceptée pour cette semaine (elle règle la semaine suivante). */
  review?: AcceptedReview | null;
  nights: (Night & { day: string })[];
}

export interface BriefRace {
  name: string;
  date: string;
  dateConfirmed: boolean;
  dateLabel?: string;
  priority: 'A' | 'B' | 'C';
  terrain: string;
  distance?: string;
  daysUntil: number;
}

export interface BriefInput {
  today: string;
  athlete?: Record<string, unknown>;
  weeks: BriefWeek[];
  /** Semaines suivantes déjà au plan : titres et durées. */
  upcoming: { monday: string; source: PlanSource | null; sessions: BriefSession[] }[];
  /** Minutes de course par semaine, de la plus ancienne à la plus récente. */
  runTrend: { monday: string; minutes: number }[];
  races: BriefRace[];
  inbox: { url: string; note: string }[];
}

const DAYS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
const SPORT: Record<Sport, string> = {
  run: 'course',
  bike: 'vélo',
  strength: 'renfo',
  walk: 'marche',
  other: 'autre',
};
const VERDICT: Record<AcceptedReview['verdict'], string> = {
  progress: 'progresser',
  hold: 'tenir',
  'step-back': 'alléger',
};

const date = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const day = (d: string) => `${DAYS[new Date(`${d}T12:00:00Z`).getUTCDay()]} ${date(d)}`;
const min = (s: number) => Math.round(s / 60);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const one = (n: number) => n.toFixed(1).replace('.', ',');

function activityText(a: BriefActivity): string {
  return [
    `${min(a.durationS)} min`,
    a.runningS !== undefined && min(a.runningS) < min(a.durationS)
      ? `dont ${min(a.runningS)} min courues`
      : null,
    a.indoor ? 'tapis' : null,
    a.distanceM ? `${one(a.distanceM / 1000)} km` : null,
    a.avgHr ? `FC ${Math.round(a.avgHr)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function sessionLine(s: BriefSession, today: string): string {
  const planned = `${SPORT[s.sport]}, ${s.role.toLowerCase()}, ${s.plannedDay ? `prévue ${day(s.plannedDay)}, ` : ''}${s.plannedMin} min${s.extraMin ? ` + ${s.extraMin} min d'échauffement et retour au calme` : ''}`;
  let state: string;
  if (s.done) {
    state = `FAITE ${day(s.done.day)}${s.done.activity ? ` (${activityText(s.done.activity)})` : ''}`;
  } else if (s.plannedDay && s.plannedDay < today) {
    state = 'NON FAITE';
  } else {
    state = 'à venir';
  }
  const c = s.checkin;
  const extra = [
    c?.shin !== undefined ? `tibia ${c.shin}/10` : null,
    c?.rpe !== undefined ? `effort ${c.rpe}/10` : null,
    c?.swap ? `faite en ${c.swap}` : null,
  ].filter(Boolean);
  return `- ${state} · ${s.title} (${planned})${extra.length ? ` · ${extra.join(' · ')}` : ''}`;
}

function volume(acts: BriefActivity[]): string {
  const by = new Map<Sport, { n: number; s: number; m: number }>();
  for (const a of acts) {
    const sport = activitySport(a.type);
    const v = by.get(sport) ?? { n: 0, s: 0, m: 0 };
    v.n += 1;
    v.s += a.durationS;
    v.m += a.distanceM ?? 0;
    by.set(sport, v);
  }
  const order: Sport[] = ['run', 'bike', 'strength', 'other'];
  const parts = order
    .filter((s) => by.has(s))
    .map((s) => {
      const v = by.get(s)!;
      return `${SPORT[s]} ${min(v.s)} min en ${v.n}${s === 'run' && v.m ? ` (${one(v.m / 1000)} km)` : ''}`;
    });
  return parts.length ? parts.join(', ') : 'aucune activité';
}

function nightsText(nights: BriefWeek['nights']): string | null {
  if (!nights.length) return null;
  const sleepH = avg(nights.flatMap((n) => (n.sleep ? [n.sleep.seconds / 3600] : [])));
  const score = avg(nights.flatMap((n) => (n.sleep?.score ? [n.sleep.score] : [])));
  const hrv = avg(nights.flatMap((n) => (n.hrv?.lastNightMs ? [n.hrv.lastNightMs] : [])));
  const base = nights.find((n) => n.hrv)?.hrv;
  const low = nights.filter((n) => n.hrv?.lastNightMs && n.hrv.lastNightMs < n.hrv.baselineLowMs).length;
  const ready = avg(nights.flatMap((n) => (n.readiness ? [n.readiness.score] : [])));
  const parts = [
    sleepH !== null
      ? `sommeil ${one(sleepH)} h/nuit${score !== null ? ` (score ${Math.round(score)})` : ''}`
      : null,
    hrv !== null
      ? `VFC ${Math.round(hrv)} ms${base ? ` (norme ${base.baselineLowMs}–${base.baselineHighMs})` : ''}${low ? `, ${low} nuit${low > 1 ? 's' : ''} sous la norme` : ''}`
      : null,
    ready !== null ? `disponibilité ${Math.round(ready)}` : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join(' · ')} (${nights.length} nuits)` : null;
}

export function claudeBrief(input: BriefInput): string {
  const out: string[] = [];
  const first = input.weeks[0]?.monday;
  out.push(`# Bilan CoachChris pour Claude, ${date(input.today)}/${input.today.slice(0, 4)}`);
  out.push('');
  out.push(
    `Données de l'app du ${first ? date(first) : '?'} au ${date(input.today)}. ` +
      'But : rédiger le bloc suivant au format coach-chris.plan/v1, en tenant compte de ce qui a été fait, ' +
      'des douleurs (règle : ≤ 3/10 vert, 4–5 prudence, ≥ 6 stop) et de la fatigue.',
  );

  if (input.athlete && Object.keys(input.athlete).length) {
    out.push('', '## Repères athlète (plan en cours)');
    for (const [k, v] of Object.entries(input.athlete))
      out.push(`- ${k} : ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  }

  const block = [...input.weeks].reverse().find((w) => w.block)?.block;
  if (block) {
    out.push('', '## Bloc en cours');
    out.push(`- ${block.name} (phase ${block.phase}), du ${date(block.start)} au ${date(block.end)}`);
    if (block.objectif) out.push(`- Objectif : ${block.objectif}`);
  }

  if (input.races.length) {
    out.push('', '## Courses à venir');
    for (const r of input.races) {
      const when = r.dateConfirmed ? date(r.date) : `${r.dateLabel ?? date(r.date)} (date à confirmer)`;
      out.push(
        `- ${r.priority} · ${r.name} · ${when}${r.date.slice(0, 4) !== input.today.slice(0, 4) ? ` ${r.date.slice(0, 4)}` : ''} · ${r.terrain}${r.distance ? ` · ${r.distance}` : ''} · dans ${r.daysUntil} jours`,
      );
    }
  }

  if (input.runTrend.length) {
    out.push('', '## Course à pied, minutes réellement courues par semaine (hors marche)');
    out.push(input.runTrend.map((w) => `${date(w.monday)} : ${w.minutes}`).join(' · '));
  }

  for (const w of input.weeks) {
    const src = w.source === 'claude' ? 'plan Claude' : w.source === 'campus' ? 'plan Campus' : 'sans plan';
    out.push('', `## Semaine du ${date(w.monday)} (${src}${w.focus ? `, ${w.focus}` : ''})`);
    if (w.sessions.length) for (const s of w.sessions) out.push(sessionLine(s, input.today));
    else out.push('- Aucune séance au plan');
    if (w.offPlan.length) {
      out.push(
        `- Hors plan : ${w.offPlan.map((a) => `${day(a.day)} ${a.name ?? SPORT[activitySport(a.type)]} (${activityText(a)})`).join(' ; ')}`,
      );
    }
    out.push(`- Volume réel : ${volume(w.activities)}`);
    const foot = Object.entries(w.foot).sort(([a], [b]) => a.localeCompare(b));
    out.push(
      `- Pied au premier pas : ${foot.length ? foot.map(([d, n]) => `${DAYS[new Date(`${d}T12:00:00Z`).getUTCDay()]} ${n}`).join(' · ') : 'aucun check-in'}`,
    );
    const nights = nightsText(w.nights);
    if (nights) out.push(`- Nuits : ${nights}`);
    if (w.review) {
      const durations = Object.entries(w.review.durations)
        .map(([id, m]) => `${id} ${m} min`)
        .join(', ');
      out.push(
        `- Revue acceptée : ${VERDICT[w.review.verdict]}, séance flexible en ${w.review.flex}${durations ? ` ; durées retenues : ${durations}` : ''}`,
      );
    }
  }

  if (input.upcoming.length) {
    out.push('', '## Déjà au plan pour la suite');
    for (const u of input.upcoming) {
      out.push(
        `- Semaine du ${date(u.monday)} : ${u.sessions.length ? u.sessions.map((s) => `${s.title} (${SPORT[s.sport]}, ${s.plannedMin} min)`).join(' ; ') : 'rien'}`,
      );
    }
  } else {
    out.push('', '## Déjà au plan pour la suite', '- Rien : le bloc suivant est à écrire.');
  }

  if (input.inbox.length) {
    out.push('', '## Boîte à vidéos (à transformer en exercices)');
    for (const v of input.inbox) out.push(`- ${v.note} : ${v.url}`);
  }

  out.push('', '## À compléter par moi');
  out.push('- Ressenti général, fatigue, travail, sommeil :');
  out.push("- Douleurs ou gênes non notées dans l'app :");
  out.push('- Disponibilités des prochaines semaines (soirs, week-ends, déplacements) :');
  out.push('- Envies ou contraintes (séances à garder, à éviter) :');
  return out.join('\n') + '\n';
}
