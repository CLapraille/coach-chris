import { mondayOf } from '../calendar.ts';
import type { Sport } from '../plan/types.ts';

/** Une durée d'entraînement datée : activité Garmin, ou séance validée dans Campus sans activité. */
export interface VolumeEntry {
  day: string;
  sport: Sport;
  minutes: number;
}

export type WeekVolume = { run: number; bike: number; strength: number };

const COUNTED: Sport[] = ['run', 'bike', 'strength'];

/** Minutes par semaine (clé : lundi) et par sport ; les marches et le reste sont exclus (D56). */
export function weeklyVolume(entries: VolumeEntry[]): Map<string, WeekVolume> {
  const weeks = new Map<string, WeekVolume>();
  for (const e of entries) {
    if (!COUNTED.includes(e.sport)) continue;
    const key = mondayOf(e.day);
    const w = weeks.get(key) ?? { run: 0, bike: 0, strength: 0 };
    w[e.sport as keyof WeekVolume] += e.minutes;
    weeks.set(key, w);
  }
  return weeks;
}

export interface VolumeCap {
  /** Repère : facteur × moyenne des semaines précédentes. */
  cap: number;
  mean: number;
  factor: number;
  weeks: number;
}

/** Facteur du ratio charge aiguë / chronique retenu (D90). */
export const CAP_FACTOR = 1.3;
export const CAP_WEEKS = 4;

/**
 * Repère de volume de la semaine (D90) : 1,3 × moyenne des 4 semaines complètes précédentes.
 * Sans 4 semaines d'historique, pas de repère : on n'invente pas de moyenne.
 */
export function volumeCap(previousWeeks: number[], factor = CAP_FACTOR): VolumeCap | null {
  if (previousWeeks.length < CAP_WEEKS) return null;
  const last = previousWeeks.slice(-CAP_WEEKS);
  const mean = last.reduce((s, x) => s + x, 0) / CAP_WEEKS;
  return { cap: mean * factor, mean, factor, weeks: CAP_WEEKS };
}

export type CapStatus = 'under' | 'over';

export function capStatus(planned: number, cap: VolumeCap): CapStatus {
  return planned > cap.cap ? 'over' : 'under';
}
