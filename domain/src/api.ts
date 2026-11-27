/**
 * Contrat de l'API du BFF (ARCHITECTURE §4), partagé par `server/` et `web/` :
 * les deux côtés sont vérifiés à la compilation. Une valeur absente est `null`, jamais estimée.
 */
import type { Annotation } from './actions/actions.ts';
import type { CampusBlock } from './plan/campus.ts';
import type { ClaudeContent, ClaudeRoutine } from './plan/claude.ts';
import type { SessionCheckin } from './checkin/checkin.ts';
import type { Match, Activity } from './plan/matching.ts';
import type { Deviation, DeviationRules, Lap } from './plan/deviation.ts';
import type { RuleWarning } from './plan/placement.ts';
import type { PlannedSession, PlanSource } from './plan/types.ts';
import type { CapStatus, VolumeCap } from './load/volume.ts';
import type { ZoneId } from './mobility/library.ts';
import type { Regularity, Slot } from './mobility/regularity.ts';
import type { TestResults, ZoneStatus } from './mobility/tests.ts';
import type { RangePosition, WeightTrend } from './wellness/wellness.ts';
import type { Signal } from './signals/signals.ts';

export type SourceName = 'garmin' | 'campus';

/** Activité Garmin telle que gardée en cache. */
export interface CachedActivity extends Activity {
  name?: string;
  distanceM?: number;
  avgHr?: number;
}

/** Ce que la montre dit d'une nuit (et de la journée qui la suit pour le stress) ; `null` quand Garmin n'a rien. */
export interface Night {
  hrv: {
    lastNightMs?: number;
    weeklyAvgMs?: number;
    baselineLowMs: number;
    baselineHighMs: number;
    status?: string;
  } | null;
  /** `qualifier` : appréciation Garmin du score (EXCELLENT, GOOD, FAIR, POOR). */
  sleep: { seconds: number; score?: number; qualifier?: string; awakeSeconds?: number } | null;
  readiness: { score: number; level?: string; recoveryHours?: number } | null;
  /** `wake` : Body Battery au réveil (dernière valeur de la nuit). */
  bodyBattery: { sleepGain?: number; wake?: number; level?: string } | null;
  /** Stress de la journée : moyenne et part du temps mesuré au repos (niveau ≤ 25). */
  stress: { avg: number; restPercent?: number } | null;
}

export interface NightView extends Night {
  day: string;
  fetchedAt: string;
  hrvPosition: { lastNight: RangePosition; weekly: RangePosition } | null;
}

/** Une étape d'un bloc de séance : course, marche, récupération ou exercice de renforcement. */
export interface SessionStep {
  name: string;
  kind: 'run' | 'walk' | 'rest' | 'exercise';
  seconds: number;
}

export interface SessionBlock {
  repeat: number;
  steps: SessionStep[];
}

export interface WeekSession {
  key: string;
  displayName: string;
  /** Nom technique Campus (ex. Retour_Blessure_S2_2), utile pour distinguer deux séances de même titre. */
  name: string;
  index: number;
  sport: PlannedSession['sport'];
  trainingType: string;
  durationMin: number;
  /** Échauffement et retour au calme prévus en plus (plan Claude, D178). */
  extraMin?: number;
  status: PlannedSession['status'];
  intense: boolean;
  legs: boolean;
  legsFrom: PlannedSession['legsFrom'];
  /** Jour placé ; `null` si la séance n'a plus de jour possible (semaine passée, non faite). */
  day: string | null;
  /** Jour connu (fait ou rattaché) : il ne bouge plus. */
  fixed: boolean;
  match?: Omit<Match, 'sessionKey'>;
  /** Dernier envoi sur la montre par l'app (D126). */
  pushed?: PushRecord;
}

/** Workout Garmin créé par l'app pour une séance. */
export interface PushRecord {
  workoutId: string;
  /** Jour du calendrier Garmin où il est planifié. */
  date: string;
  /** Instant de l'envoi, ISO UTC. */
  at: string;
}

/** Écritures (D123) : ce que le front demande ; le BFF relit les sources et construit les appels. */
export type ActionRequest =
  | { type: 'campus.complete'; sessionKey: string }
  | { type: 'garmin.push'; sessionKey: string }
  | { type: 'mywhoosh.upload'; sessionKey: string }
  /** Dernière sortie MyWhoosh pas encore importée : téléchargée, corrigée et envoyée à Garmin (D169). */
  | { type: 'mywhoosh.import' }
  | { type: 'garmin.annotate'; activityId: string; changes: Annotation };

/** Aperçu lisible d'une écriture ; `token` est à renvoyer tel quel pour confirmer (valable 5 min, une fois). */
export interface ActionPreview {
  token: string;
  expiresAt: string;
  title: string;
  target: 'Campus Coach' | 'Garmin Connect' | 'MyWhoosh';
  fields: { label: string; value: string }[];
  warnings: string[];
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

export interface WeekView {
  start: string;
  days: { day: string; label: string }[];
  /** `null` quand la source active (Campus par défaut, Claude si importé, D153) n'a pas fourni cette semaine. */
  plan: {
    source: PlanSource;
    fetchedAt: string;
    goalWeek?: { index: number; durationInWeeks: number };
    /** Plan Claude : nom du bloc et thème de la semaine. */
    block?: string;
    focus?: string;
  } | null;
  sessions: WeekSession[];
  activities: CachedActivity[];
  offPlan: CachedActivity[];
  warnings: RuleWarning[];
  /** Le placement a été ajusté à la main (bouton « Revenir à la proposition »). */
  manual: boolean;
  /** Disponibilité Garmin du matin, par jour ; `null` si absente. */
  readiness: Record<string, number | null>;
  /** Routines de mobilité cochées, par jour. */
  routines: Record<string, Record<Slot, boolean>>;
}

/** Tour Garmin pour l'affichage (get_activity_splits). */
export interface LapView extends Lap {
  n: number;
  distanceM?: number;
  speedMps?: number;
  maxHr?: number;
  powerW?: number;
}

/** Activité Garmin détaillée, gardée en cache une fois lue (une activité terminée ne change plus). */
export interface ActivityDetail extends CachedActivity {
  /** Notes de l'activité dans Garmin. */
  description?: string;
  maxHr?: number;
  trainingEffect?: number;
  trainingEffectLabel?: string;
  trainingLoad?: number;
  avgPowerW?: number;
  /** Effort perçu et ressenti tels que renvoyés par Garmin : RPE ×10 (10 = 1/10, D127), ressenti 0–100. */
  rpe?: number;
  feel?: number;
  laps: LapView[];
  /** Temps passé dans chaque zone FC de l'activité ; `lowBpm` = borne basse de la zone. */
  zones: { zone: number; lowBpm: number; seconds: number }[];
}

/** Détail de séance (maquette v2) : prévu vs réalisé, étapes, tours, zones, conseil. */
export interface SessionView {
  weekStart: string;
  session: WeekSession;
  description?: string;
  coachAdvice?: string;
  blocks: SessionBlock[];
  activity: ActivityDetail | null;
  /** Raison lisible quand l'activité rattachée n'a pas pu être lue. */
  activityError?: string;
  /** Écart étape par étape, pour une course programmée sur la montre (tours indexés). */
  deviation: Deviation | null;
  rules: DeviationRules;
  /** Renforcement : où en est l'activité « Musculation » créée dans Garmin (D148, D152). */
  garminLog?: GarminLogStatus;
  /** Séance d'un plan Claude : contenu complet (échauffement, corps, retour au calme, variantes), D156. */
  claude?: ClaudeContent;
  /** Check-in de la séance (tibia, effort, sport choisi), D159. */
  checkin?: SessionCheckin;
}

/**
 * `planned` : pas encore validée ; `waiting` : créée à la première synchro après `after` ; `created` : créée ;
 * `linked` : une activité de renforcement (montre ou créée) est rattachée ; `failed` : 3 essais échoués ;
 * `before` : validée avant la mise en service, rien n'est créé.
 */
export type GarminLogStatus =
  | { state: 'planned' | 'linked' | 'before' }
  | { state: 'waiting'; after: string }
  | { state: 'created'; name: string }
  | { state: 'failed'; message: string };

/** Vue mois : les semaines (lundi → dimanche) qui recouvrent le mois. */
export interface MonthView {
  month: string;
  weeks: WeekView[];
}

export interface GoalView {
  goalType: string;
  description?: string;
  startDate: string;
  endDate: string;
  durationInWeeks: number;
  /** Semaine en cours du plan (1 = première). */
  weekIndex?: number;
  sessionsDone?: number;
  sessionsTotal?: number;
  distanceKm?: number;
  timeS?: number;
  test?: { name: string; weekDate: string };
}

export interface NextSession extends WeekSession {
  description?: string;
  coachAdvice?: string;
  blocks: SessionBlock[];
}

export interface CapView extends VolumeCap {
  planned: number;
  status: CapStatus;
}

export interface VolumeView {
  weeks: { start: string; run: number; bike: number; strength: number }[];
  cap: { run: CapView | null; total: CapView | null };
  /** Minutes prévues par Campus cette semaine, par sport (séances faites ou à faire, hors sautées). */
  planned: { run: number; strength: number; total: number };
}

export interface RoutineItemView {
  code: string;
  name: string;
  durationS: number;
  perSide: boolean;
  reason?: string;
  /** Socle du bloc (fixe) ou créneau du jour (variable), pour la routine du soir (D78). */
  slot?: 'socle' | 'day';
}

/** Bloc de 2 semaines validé par l'utilisateur (D78) : le socle ne change pas jusqu'à `end`. */
export interface MobilityBlock {
  start: string;
  end: string;
  socle: RoutineItemView[];
  acceptedAt: string;
}

export interface ZoneView {
  zone: ZoneId;
  label: string;
  /** `declared` : limitation déclarée pas encore testée ; `untested` : ni testée ni déclarée. */
  status: ZoneStatus | 'declared' | 'untested';
  detail: string;
  declared: boolean;
}

export interface MobilityView {
  today: string;
  morning: RoutineItemView[];
  /** Vide tant qu'aucun bloc n'est en cours. */
  evening: RoutineItemView[];
  checked: Record<Slot, boolean>;
  zones: ZoneView[];
  /** Dernier résultat connu de chaque test, avec sa date. */
  tests: { [K in keyof TestResults]?: { day: string; value: NonNullable<TestResults[K]> } };
  block: MobilityBlock | null;
  /** Socle proposé d'après les tests, à valider avant de démarrer un bloc (validation obligatoire, D78). */
  proposal: RoutineItemView[] | null;
  regularity: Record<Slot, { d7: Regularity; d28: Regularity }>;
  /** 28 derniers jours, du plus ancien à aujourd'hui. */
  last28: { day: string; morning: boolean; evening: boolean }[];
  /**
   * Semaine portée par un plan Claude (D157) : variante de la routine du matin, routine bureau ; la routine
   * du soir est alors remplacée par la routine bureau et la séance optionnelle du plan.
   */
  planWeek?: PlanWeekRoutines;
}

export interface PlanWeekRoutines {
  focus?: string;
  /** Exercices du matin remplacés cette semaine : `replaces` (exercice de base) → `by`. */
  morning: { replaces: string; by: string }[];
  morningWhy?: string;
  office?: ClaudeRoutine;
}

export interface MobilityToday {
  morning: RoutineItemView[];
  evening: RoutineItemView[];
  /** Pas encore de résultats de tests : seul le créneau du jour est proposé, sans socle. */
  testsMissing: boolean;
  checked: Record<Slot, boolean>;
  regularity: Record<Slot, Regularity>;
  /** Semaine en cours, lundi → dimanche (D150) : repart de zéro chaque lundi ; les jours à venir sont vides. */
  week: { day: string; morning: boolean; evening: boolean }[];
}

export interface TodayView {
  today: string;
  goal: GoalView | null;
  nextSession: NextSession | null;
  /** Séance à faire après la prochaine. */
  thenSession: WeekSession | null;
  form: {
    night: NightView | null;
    stressYesterday: Night['stress'];
    /** VFC des 8 dernières nuits ; `null` = nuit absente. */
    hrvHistory: { day: string; ms: number | null }[];
    weight: WeightTrend | null;
    /** Score de disponibilité de la veille, pour l'écart ; `null` si absent. */
    readinessYesterday: number | null;
  };
  volume: VolumeView;
  week: WeekView;
  /** Exercice du créneau du soir proposé pour chaque jour de la semaine. */
  evenings: Record<string, RoutineItemView | null>;
  mobility: MobilityToday;
  signals: Signal[];
  /** Douleur du pied au premier pas (D159) ; `null` si pas encore saisie aujourd'hui. */
  checkin: { foot: number | null; suggestLowImpact: boolean };
}

export interface DataStatus {
  sources: Record<
    SourceName,
    {
      lastOkAt: string | null;
      last: { at: string; outcome: 'ok' | 'token-expired' | 'error'; message?: string } | null;
    }
  >;
  /** Nuits des 7 derniers jours sans sommeil ni VFC. */
  missingNights: string[];
  /** Montre principale et dernier envoi vers Garmin Connect. */
  device: { name: string; lastUpload?: string } | null;
  /** Plan Campus en cache : semaine en cours et séances faites. */
  plan: {
    goalType?: string;
    weekIndex?: number;
    durationInWeeks?: number;
    done: number;
    total: number;
  } | null;
  /** Fraîcheur par type de donnée sur 14 jours (D84) : dernière valeur et manques, jamais d'estimation. */
  freshness: {
    sleep: { last: string | null; missing: string[]; present: number; days: number };
    hrv: { last: string | null; lastMs?: number; missing: string[] };
    activities: { lastStart: string | null; lastRun: string | null };
    weight: { last: string | null; kg?: number };
    plan: { week: string | null; fetchedAt: string | null };
  };
  /** 10 derniers passages de synchro, du plus récent au plus ancien (D83). */
  log: {
    at: string;
    source: SourceName;
    origin: 'job' | 'open' | 'button' | 'action';
    outcome: 'ok' | 'token-expired' | 'error';
    durationMs: number;
    message?: string;
    /** Essais quand une erreur passagère a été réessayée. */
    attempts?: number;
  }[];
  /** 10 dernières écritures confirmées (D123), de la plus récente à la plus ancienne. */
  actions: { at: string; title: string; ok: boolean; message: string }[];
}

const toSeconds = (d: { value: number; timeUnit: string }) =>
  d.timeUnit.startsWith('min') ? d.value * 60 : d.timeUnit.startsWith('h') ? d.value * 3600 : d.value;

/** Blocs Campus → blocs affichables : nom lisible (allure pour la course), nature et durée. */
export function sessionBlocks(blocks: CampusBlock[]): SessionBlock[] {
  return blocks.map((b) => ({
    repeat: b.repeat ?? 1,
    steps: b.exercises.map((e) => {
      const seconds = (e.durations ?? []).reduce((s, d) => s + toSeconds(d), 0);
      if (e.exerciseType === 'running') return { name: e.pace?.name ?? 'Course', kind: 'run', seconds };
      if (e.exerciseType === 'recuperation') {
        const walk = e.pace?.zoneKind === 'RECOVER' && e.pace?.name === 'Marche';
        return { name: walk ? 'Marche' : 'Récupération', kind: walk ? 'walk' : 'rest', seconds };
      }
      return { name: e.name, kind: 'exercise', seconds };
    }),
  }));
}

/** Boîte à vidéos (D158) : lien d'exercice repéré (YouTube Short…) et note de l'utilisateur, à intégrer à la bibliothèque. */
export interface InboxItem {
  id: string;
  url: string;
  note: string;
  addedAt: string;
}

/** Résultat d'un import de plan Claude (D153), aperçu compris (D164). */
export interface PlanImportResult {
  block: string;
  blockName: string;
  start: string;
  end: string;
  weeks: { weekDate: string; changed: boolean; active: PlanSource; sessions: number }[];
}

/** Résultat d'un import de saison (D154), aperçu compris (D164). */
export interface SeasonImportResult {
  season: string;
  events: number;
  /** Événements de la saison enregistrée, remplacée par l'import. */
  replaces: number;
}

/** Réponse 422 d'un import refusé : un problème par ligne (D164). */
export interface ImportRefusal {
  error: string;
  problems: string[];
}
