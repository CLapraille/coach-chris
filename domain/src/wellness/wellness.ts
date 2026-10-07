/** Pesée Garmin (balance Index). */
export interface WeighIn {
  day: string;
  kg: number;
}

export interface WeightTrend {
  latest: WeighIn;
  previous?: WeighIn;
  deltaKg?: number;
  /** Flèche : verte pour une prise de poids, rouge pour une perte (choix de l'utilisateur, D88). */
  direction?: 'up' | 'down' | 'flat';
}

/** Dernière pesée et évolution depuis la précédente ; la date est toujours rendue (les pesées ne sont pas quotidiennes). */
export function weightTrend(weighIns: WeighIn[]): WeightTrend | null {
  const sorted = [...weighIns].sort((a, b) => b.day.localeCompare(a.day));
  const [latest, previous] = sorted;
  if (!latest) return null;
  if (!previous) return { latest };
  const deltaKg = Math.round((latest.kg - previous.kg) * 10) / 10;
  return { latest, previous, deltaKg, direction: deltaKg > 0 ? 'up' : deltaKg < 0 ? 'down' : 'flat' };
}

/** VFC nocturne comparée à la plage habituelle fournie par Garmin (observation, pas un diagnostic). */
export interface HrvReading {
  lastNightMs?: number;
  weeklyAvgMs?: number;
  baselineLowMs: number;
  baselineHighMs: number;
}

export type RangePosition = 'below' | 'within' | 'above' | 'unknown';

const position = (v: number | undefined, low: number, high: number): RangePosition =>
  v === undefined ? 'unknown' : v < low ? 'below' : v > high ? 'above' : 'within';

export function hrvStatus(r: HrvReading): { lastNight: RangePosition; weekly: RangePosition } {
  return {
    lastNight: position(r.lastNightMs, r.baselineLowMs, r.baselineHighMs),
    weekly: position(r.weeklyAvgMs, r.baselineLowMs, r.baselineHighMs),
  };
}
