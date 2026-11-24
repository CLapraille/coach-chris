import { parisDayOfUtc } from '../calendar.ts';
import type { PlannedSession, Sport } from './types.ts';

/** Activité Garmin réduite à ce qu'il faut pour le rapprochement. */
export interface Activity {
  id: string;
  /** Heure locale de début (Europe/Paris), `AAAA-MM-JJ HH:mm:ss`, comme renvoyée par Garmin. */
  startLocal: string;
  /** Type Garmin : running, treadmill_running, virtual_ride, strength_training, walking… */
  type: string;
  durationS: number;
}

const ACTIVITY_SPORTS: [RegExp, Sport][] = [
  [/running|trail/, 'run'],
  [/ride|cycling|bike|biking/, 'bike'],
  [/strength/, 'strength'],
  [/walking|hiking/, 'walk'],
];

export function activitySport(type: string): Sport {
  return ACTIVITY_SPORTS.find(([re]) => re.test(type))?.[1] ?? 'other';
}

export const activityDay = (a: Activity): string => a.startLocal.slice(0, 10);

export interface Match {
  sessionKey: string;
  activityId?: string;
  /** Jour où la séance a été faite (ou rattachée). */
  day: string;
  method: 'campus-link' | 'campus-completion' | 'rule';
  /** sûr : lien donné par la source ; probable : une seule activité plausible ; incertain : à confirmer à la main. */
  confidence: 'sure' | 'probable' | 'uncertain';
  reason: string;
}

export interface WeekMatching {
  matches: Match[];
  /** Activités sportives sans séance correspondante (marches exclues, D59). */
  offPlan: Activity[];
}

/** Écart de durée toléré pour rattacher une activité à une séance par règle. */
const DURATION_TOLERANCE = 0.35;

/**
 * Rapproche les séances d'une semaine des activités Garmin (D36) :
 * 1. lien de la source (`externalId` Campus) ; 2. séance validée sans lien : activité du même sport le jour de la validation ;
 * 3. séance à faire : activité du même sport, durée à ±35 %, unique sinon incertaine ;
 * 4. sinon, séance avec un jour prévu (plan Claude) : la seule activité du même sport ce jour-là, quelle que soit
 *    sa durée (D168 : un renforcement guidé par la montre, étapes terminées par Tour, s'écarte souvent de ±35 %).
 */
export function matchWeek(sessions: PlannedSession[], activities: Activity[]): WeekMatching {
  const used = new Set<string>();
  const matches: Match[] = [];
  const byId = new Map(activities.map((a) => [a.id, a]));
  const free = (sport: Sport) => activities.filter((a) => !used.has(a.id) && activitySport(a.type) === sport);

  // 1. Liens explicites d'abord, pour ne pas les « voler » par une règle.
  for (const s of sessions) {
    if (!s.externalActivityId) continue;
    const a = byId.get(s.externalActivityId);
    if (a) used.add(a.id);
    const day = a ? activityDay(a) : s.completedAtUtc ? parisDayOfUtc(s.completedAtUtc) : undefined;
    if (!day) continue;
    matches.push({
      sessionKey: s.key,
      activityId: s.externalActivityId,
      day,
      method: 'campus-link',
      confidence: 'sure',
      reason: a ? 'Lien Campus vers l’activité Garmin' : 'Lien Campus, activité hors de la période chargée',
    });
  }

  for (const s of sessions) {
    if (s.externalActivityId || s.status === 'skipped') continue;

    // 2. Validée dans la source sans lien (renforcement « auto ») : le jour de validation fait foi.
    if (s.status === 'done' && s.completedAtUtc) {
      const day = parisDayOfUtc(s.completedAtUtc);
      const a = free(s.sport).find((x) => activityDay(x) === day);
      if (a) used.add(a.id);
      matches.push({
        sessionKey: s.key,
        ...(a && { activityId: a.id }),
        day,
        method: 'campus-completion',
        confidence: 'sure',
        reason: a
          ? 'Validée dans Campus, activité du même jour'
          : 'Validée dans Campus, sans activité Garmin',
      });
      continue;
    }

    // 3. Règle : même sport, durée proche.
    const planned = s.durationMin * 60;
    const candidates = free(s.sport).filter(
      (a) => planned > 0 && Math.abs(a.durationS - planned) / planned <= DURATION_TOLERANCE,
    );
    const best = candidates.sort(
      (x, y) => Math.abs(x.durationS - planned) - Math.abs(y.durationS - planned),
    )[0];
    if (!best) {
      // 4. Jour prévu : une seule activité du même sport ce jour-là, durée ignorée.
      const sameDay = s.day ? free(s.sport).filter((a) => activityDay(a) === s.day) : [];
      if (sameDay.length !== 1) continue;
      const a = sameDay[0]!;
      used.add(a.id);
      matches.push({
        sessionKey: s.key,
        activityId: a.id,
        day: s.day!,
        method: 'rule',
        confidence: 'probable',
        reason: 'Seule activité du même sport le jour prévu (durée différente de la prévision)',
      });
      continue;
    }
    used.add(best.id);
    matches.push({
      sessionKey: s.key,
      activityId: best.id,
      day: activityDay(best),
      method: 'rule',
      confidence: candidates.length === 1 ? 'probable' : 'uncertain',
      reason:
        candidates.length === 1
          ? `Seule activité du même sport à ±${DURATION_TOLERANCE * 100} % de la durée prévue`
          : `${candidates.length} activités possibles : la plus proche en durée, à confirmer`,
    });
  }

  const offPlan = activities.filter((a) => !used.has(a.id) && activitySport(a.type) !== 'walk');
  return { matches, offPlan };
}
