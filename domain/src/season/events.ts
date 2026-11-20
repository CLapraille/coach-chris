import type { FlexDefault } from '../plan/claude.ts';

/**
 * Saison de courses (D154) : les événements retenus, leur priorité et la distance choisie.
 * A = objectif principal (plan complet à rebours), B = important (mini-affûtage), C = course d'entraînement.
 */
export type Priority = 'A' | 'B' | 'C';

export interface RaceOption {
  km: number;
  dPlus?: number;
}

export interface SeasonEvent {
  id: string;
  name: string;
  /** AAAA-MM-JJ ; pour une date approximative, le jour le plus probable avec `dateConfirmed: false`. */
  date: string;
  dateConfirmed: boolean;
  /** Libellé quand la date n'est pas confirmée (« mi-août »). */
  dateLabel?: string;
  place: string;
  country: string;
  url?: string;
  terrain: 'route' | 'trail';
  priority: Priority;
  options: RaceOption[];
  /** Index dans `options` de la distance prévue ; absent = pas encore choisie. */
  chosen?: number;
  /** Challenge auquel la course appartient (« Lupulus Trophy »). */
  series?: string;
  note?: string;
}

export interface SeasonFile {
  format: 'coach-chris.season/v1';
  season: string;
  events: SeasonEvent[];
}

export interface SeasonSettings {
  /** Sport par défaut de la 3e séance de la semaine (D153). */
  flexDefault: FlexDefault;
}

export const DEFAULT_SETTINGS: SeasonSettings = { flexDefault: 'velo' };

/** Réponse de GET /api/season. */
export interface SeasonView {
  season: string | null;
  events: SeasonEventView[];
  settings: SeasonSettings;
  /** Prochaine course A à venir, s'il y en a une. */
  nextA: string | null;
}

export interface SeasonEventView extends SeasonEvent {
  daysUntil: number;
  past: boolean;
  /** Courses rapprochées : une autre course à moins de 14 jours (règle des secondaires, D154). */
  closeTo: string[];
}

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY_MS);

/** Vue de la saison triée par date, avec le compte à rebours et les courses trop proches. */
export function seasonView(
  file: SeasonFile | undefined,
  settings: SeasonSettings,
  today: string,
): SeasonView {
  const events = [...(file?.events ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const view = events.map<SeasonEventView>((e) => ({
    ...e,
    daysUntil: daysBetween(today, e.date),
    past: e.date < today,
    closeTo: events
      .filter((o) => o.id !== e.id && Math.abs(daysBetween(e.date, o.date)) < 14)
      .map((o) => o.id),
  }));
  return {
    season: file?.season ?? null,
    events: view,
    settings,
    nextA: view.find((e) => !e.past && e.priority === 'A')?.id ?? null,
  };
}

/** Erreurs de cohérence d'une saison conforme au schéma ; liste vide = importable. */
export function seasonProblems(file: SeasonFile): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const e of file.events) {
    if (ids.has(e.id)) out.push(`événement « ${e.id} » en double`);
    ids.add(e.id);
    if (e.chosen !== undefined && !e.options[e.chosen]) out.push(`${e.id} : distance choisie inexistante`);
    if (e.options.length === 0) out.push(`${e.id} : aucune distance`);
  }
  return out;
}
