import { sessionShort, type Sport } from '@coach-chris/domain';

/** Formats français de l'interface. Les dates AAAA-MM-JJ sont des jours civils (Paris), sans fuseau. */

const civil = (day: string) => new Date(`${day}T12:00:00Z`);

export function longDate(day: string): string {
  const s = civil(day).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** « 08/10 » */
export const shortDate = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/** « Lun 5 » */
export function weekdayShort(day: string): string {
  const w = civil(day).toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
  return `${w.charAt(0).toUpperCase()}${w.slice(1)} ${Number(day.slice(8, 10))}`;
}

/** Heure de Paris d'un instant ISO : « 22:14 ». */
export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

/** Jour de Paris d'un instant ISO. */
export const parisDay = (iso: string) =>
  new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

/** « 7 h 18 », « 45 min » */
export function hoursMinutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

/** Durée d'étape : « 25 s », « 2′ », « 1′30 » */
export function stepDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}′${String(s).padStart(2, '0')}` : `${m}′`;
}

/** Durée d'exercice de mobilité : « 1:00 », « 1:00 × 2 » */
export function mmss(seconds: number, perSide = false): string {
  const t = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return perSide ? `${t} × 2` : t;
}

export const decimal = (n: number, digits = 1) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Écart signé avec le vrai signe moins : « −0,7 », « +0,3 ». */
export const signed = (n: number, digits = 1) =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${decimal(Math.abs(n), digits)}`;

export const SPORT_LABEL: Record<Sport, string> = {
  run: 'Course',
  bike: 'Vélo',
  strength: 'Renforcement',
  walk: 'Marche',
  other: 'Activité',
};

export const SPORT_COLOR: Record<Sport, string> = {
  run: 'var(--run)',
  bike: 'var(--bike)',
  strength: 'var(--strength)',
  walk: 'var(--rest)',
  other: 'var(--faint)',
};

export { sessionShort };

export function sessionLabel(s: { sport: Sport; name: string; displayName: string }): string {
  const short = sessionShort(s.name);
  return short ? `${SPORT_LABEL[s.sport]} ${short}` : s.displayName;
}

export const GOAL_LABEL: Record<string, string> = {
  'back-from-injury': 'Retour de blessure',
};

export const READINESS_LABEL: Record<string, string> = {
  PRIME: 'Optimale',
  HIGH: 'Haute',
  MODERATE: 'Modérée',
  LOW: 'Basse',
  POOR: 'Faible',
};

export const LEVEL_LABEL: Record<string, string> = { HIGH: 'haut', MODERATE: 'moyen', LOW: 'bas' };

/** Durée prévue : « 30 min », ou « 30 + 17 min » avec l'échauffement et le retour au calme (D178). */
export function plannedMinutes(s: { durationMin: number; extraMin?: number }): string {
  return s.extraMin ? `${s.durationMin} + ${s.extraMin} min` : `${s.durationMin} min`;
}

/** Durée totale prévue, en secondes : corps de séance, échauffement et retour au calme (D178). */
export const plannedTotalS = (s: { durationMin: number; extraMin?: number }) =>
  (s.durationMin + (s.extraMin ?? 0)) * 60;
