import { dayLabel } from '../calendar.ts';
import type { PlannedSession } from './types.ts';

/** Jour (AAAA-MM-JJ) de chaque séance placée, par clé de séance. */
export type Placement = Record<string, string>;

export type RuleId = 'consecutive-runs' | 'legs-before-intensity' | 'no-rest-day' | 'two-sessions-same-day';

export interface RuleWarning {
  rule: RuleId;
  days: string[];
  message: string;
}

/**
 * Avertissements des règles D60 (ils n'empêchent jamais un déplacement) :
 * (1) pas deux courses consécutives, (3) pas de renforcement jambes la veille d'une intensité,
 * (4) au moins un jour sans séance, et pas deux séances le même jour.
 * Seules les situations qui touchent une séance encore modifiable sont signalées : le passé ne se corrige pas.
 * La règle (2) « renforcement entre deux courses » est une préférence du placement proposé, pas un avertissement.
 */
export function checkPlacement(
  placement: Placement,
  sessions: PlannedSession[],
  days: string[],
  fixed: ReadonlySet<string> = new Set(),
): RuleWarning[] {
  const onDay = groupByDay(placement, sessions, days);
  const movable = (list: PlannedSession[]) => list.some((s) => !fixed.has(s.key));
  const warnings: RuleWarning[] = [];

  days.forEach((day, i) => {
    const today = onDay[i] ?? [];
    const next = onDay[i + 1] ?? [];
    if (today.length > 1 && movable(today))
      warnings.push({
        rule: 'two-sessions-same-day',
        days: [day],
        message: `Deux séances le ${dayLabel(day)}`,
      });
    const pair = [...today, ...next];
    if (today.some((s) => s.sport === 'run') && next.some((s) => s.sport === 'run') && movable(pair))
      warnings.push({
        rule: 'consecutive-runs',
        days: [day, days[i + 1]!],
        message: `Deux courses d'affilée (${dayLabel(day)} et ${dayLabel(days[i + 1]!)})`,
      });
    if (today.some((s) => s.legs) && next.some((s) => s.intense) && movable(pair))
      warnings.push({
        rule: 'legs-before-intensity',
        days: [day, days[i + 1]!],
        message: `Renforcement jambes la veille d'une intensité (${dayLabel(day)})`,
      });
  });

  if (onDay.every((list) => list.length > 0) && movable(onDay.flat()))
    warnings.push({ rule: 'no-rest-day', days: [], message: 'Aucun jour sans séance cette semaine' });
  return warnings;
}

function groupByDay(placement: Placement, sessions: PlannedSession[], days: string[]): PlannedSession[][] {
  return days.map((day) => sessions.filter((s) => placement[s.key] === day));
}

/** Préférence (2) : nombre de paires de courses successives sans renforcement entre elles. */
function runsWithoutStrengthBetween(
  placement: Placement,
  sessions: PlannedSession[],
  days: string[],
): number {
  const dayIndex = (s: PlannedSession) => days.indexOf(placement[s.key]!);
  const runs = sessions
    .filter((s) => s.sport === 'run')
    .map(dayIndex)
    .sort((a, b) => a - b);
  const strength = sessions.filter((s) => s.sport === 'strength').map(dayIndex);
  let n = 0;
  for (let i = 1; i < runs.length; i++) if (!strength.some((d) => d > runs[i - 1]! && d < runs[i]!)) n++;
  return n;
}

/** Nombre de paires de séances placées dans un ordre différent de celui de la source (préférence 5). */
function inversions(placement: Placement, sessions: PlannedSession[]): number {
  let n = 0;
  for (const a of sessions)
    for (const b of sessions) if (a.index < b.index && placement[a.key]! > placement[b.key]!) n++;
  return n;
}

export interface ProposeInput {
  /** Les 7 jours de la semaine, lundi → dimanche. */
  days: string[];
  /** Premier jour où une séance peut encore être placée. */
  from: string;
  sessions: PlannedSession[];
  /** Jours déjà connus (séances faites, ou placées à la main) : ils ne bougent pas. */
  fixed: Placement;
}

/**
 * Propose un jour pour chaque séance à faire (D50, D60). Recherche exhaustive (au plus ~6 séances sur 7 jours) qui minimise,
 * dans cet ordre : les avertissements, la préférence (2), l'écart à l'ordre de la source, puis un placement au plus tôt.
 */
export function proposePlacement({ days, from, sessions, fixed }: ProposeInput): Placement {
  const active = sessions.filter((s) => s.status !== 'skipped');
  const toPlace = active.filter((s) => !(s.key in fixed) && s.status !== 'done');
  const open = days.filter((d) => d >= from);
  const fixedKeys = new Set(Object.keys(fixed));

  let best: { cost: number; placement: Placement } | undefined;
  const current: Placement = { ...fixed };
  const placed = active.filter((s) => s.key in fixed);

  const visit = (i: number) => {
    if (i === toPlace.length) {
      const all = [...placed, ...toPlace];
      const cost =
        checkPlacement(current, all, days, fixedKeys).length * 1000 +
        runsWithoutStrengthBetween(current, all, days) * 10 +
        inversions(current, toPlace) * 3 +
        toPlace.reduce((sum, s) => sum + days.indexOf(current[s.key]!), 0) * 0.01;
      if (!best || cost < best.cost) best = { cost, placement: { ...current } };
      return;
    }
    for (const day of open) {
      current[toPlace[i]!.key] = day;
      visit(i + 1);
    }
    delete current[toPlace[i]!.key];
  };
  visit(0);
  return best?.placement ?? { ...fixed };
}

/** Déplace une séance ; si le jour cible contient une seule autre séance modifiable, les deux sont échangées. */
export function moveSession(
  placement: Placement,
  key: string,
  day: string,
  fixed: ReadonlySet<string> = new Set(),
): Placement {
  if (fixed.has(key)) return placement;
  const from = placement[key];
  const others = Object.keys(placement).filter((k) => k !== key && placement[k] === day);
  const next = { ...placement, [key]: day };
  if (from && others.length === 1 && !fixed.has(others[0]!)) next[others[0]!] = from;
  return next;
}
