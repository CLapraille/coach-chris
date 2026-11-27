/** Modèle de plan indépendant de la source (D48, D63). */

export type Sport = 'run' | 'bike' | 'strength' | 'walk' | 'other';
export type PlanSource = 'campus' | 'claude' | 'manuel';
export type SessionStatus = 'todo' | 'done' | 'skipped';

export interface PlannedSession {
  /** Clé interne stable : date de semaine + index + nom (les weekId Campus changent à chaque régénération). */
  key: string;
  source: PlanSource;
  /** Lundi de la semaine, AAAA-MM-JJ. */
  weekDate: string;
  /** Ordre dans la semaine, tel que fourni par la source. */
  index: number;
  name: string;
  displayName: string;
  sport: Sport;
  trainingType: string;
  /** Corps de séance, en minutes (ce que la montre déroule et ce que la revue ajuste). */
  durationMin: number;
  /** Échauffement et retour au calme prévus en plus du corps de séance (plan Claude, D178). */
  extraMin?: number;
  status: SessionStatus;
  /** Séance d'intensité (fractionné, compétition, test). */
  intense: boolean;
  /** Renforcement qui sollicite les jambes ; `legsFrom` dit d'où vient l'information. */
  legs: boolean;
  legsFrom: 'exercises' | 'assumed' | 'not-strength';
  /** Identifiant de l'activité Garmin donné par la source (racingNote.externalId de Campus). */
  externalActivityId?: string;
  /** Instant de validation dans la source, AAAA-MM-JJ HH:mm UTC. */
  completedAtUtc?: string;
  /** Sport tel que la source le nomme (Campus : road, trail, trailV2, ppg), utile aux écritures. */
  sourceSport?: string;
  /** Jour prévu par la source, AAAA-MM-JJ (plan Claude) ; Campus ne donne que la semaine. */
  day?: string;
  /** Référence volatile vers Campus : à relire avant toute écriture. */
  campusRef?: { weekId: string; sessionIndex: number };
}
