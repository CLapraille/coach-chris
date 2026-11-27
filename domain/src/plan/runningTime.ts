import { DEFAULT_RULES, type Lap } from './deviation.ts';

/**
 * Temps de course réel d'une activité (D178) : la revue du dimanche ne compte que le temps couru, pas la marche
 * de l'échauffement ni du retour au calme. Un tour dont la cadence est sous la frontière marche/course (D67 :
 * 130 pas/min) n'est pas compté ; un tour sans cadence l'est (on ne devine rien). Sans tours, toute la durée.
 */
export function runningSeconds(
  activity: { durationS: number },
  laps: Pick<Lap, 'durationS' | 'movingS' | 'avgCadence'>[] | undefined,
  cadenceRunMin = DEFAULT_RULES.cadenceRunMin,
): number {
  if (!laps?.length) return activity.durationS;
  return laps
    .filter((l) => l.avgCadence === undefined || l.avgCadence >= cadenceRunMin)
    .reduce((s, l) => s + l.durationS, 0);
}

/** Course faite à l'intérieur (tapis, application) : la FC y est en général plus haute qu'à l'extérieur. */
export function indoorRun(type: string): boolean {
  return /treadmill|indoor|virtual/.test(type) && /run/.test(type);
}
