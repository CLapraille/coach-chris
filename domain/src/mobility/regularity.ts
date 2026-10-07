import { addDays } from '../calendar.ts';

export type Slot = 'morning' | 'evening';

/** Une routine cochée (D38). Seuls les jours cochés existent : un jour sans coche est « non renseigné », jamais « manqué ». */
export interface RoutineLog {
  day: string;
  slot: Slot;
}

/** Rattrapage possible jusqu'à J-3 (D38). */
export const CATCH_UP_DAYS = 3;

export function canCheck(day: string, today: string): boolean {
  return day <= today && day >= addDays(today, -CATCH_UP_DAYS);
}

export interface Regularity {
  /** Jours cochés dans la fenêtre. */
  done: number;
  /** Taille de la fenêtre en jours. */
  days: number;
  /** Jours consécutifs cochés jusqu'à hier, plus aujourd'hui s'il est déjà coché. */
  streak: number;
}

/** Régularité d'une routine sur 7, 28 ou 90 jours (D74), sans gamification. */
export function regularity(logs: RoutineLog[], slot: Slot, today: string, windowDays: number): Regularity {
  const checked = new Set(logs.filter((l) => l.slot === slot).map((l) => l.day));
  let done = 0;
  for (let i = 0; i < windowDays; i++) if (checked.has(addDays(today, -i))) done++;
  let streak = 0;
  let day = checked.has(today) ? today : addDays(today, -1);
  while (checked.has(day)) {
    streak++;
    day = addDays(day, -1);
  }
  return { done, days: windowDays, streak };
}
