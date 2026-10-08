/**
 * Contrat de l'API du BFF (ARCHITECTURE §4), partagé par `server/` et `web/` :
 * les deux côtés sont vérifiés à la compilation. Une valeur absente est `null`, jamais estimée.
 */
import type { CampusBlock } from './plan/campus.ts';
import type { Match, Activity } from './plan/matching.ts';
import type { RuleWarning } from './plan/placement.ts';
import type { PlannedSession } from './plan/types.ts';
import type { CapStatus, VolumeCap } from './load/volume.ts';
import type { Regularity, Slot } from './mobility/regularity.ts';
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
  sleep: { seconds: number; score?: number; awakeSeconds?: number } | null;
  readiness: { score: number; level?: string; recoveryHours?: number } | null;
  bodyBattery: { sleepGain?: number; level?: string } | null;
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
  status: PlannedSession['status'];
  intense: boolean;
  legs: boolean;
  legsFrom: PlannedSession['legsFrom'];
  /** Jour placé ; `null` si la séance n'a plus de jour possible (semaine passée, non faite). */
  day: string | null;
  /** Jour connu (fait ou rattaché) : il ne bouge plus. */
  fixed: boolean;
  match?: Omit<Match, 'sessionKey'>;
}

export interface WeekView {
  start: string;
  days: { day: string; label: string }[];
  /** `null` quand Campus n'a pas (encore) fourni cette semaine. */
  plan: { fetchedAt: string; goalWeek?: { index: number; durationInWeeks: number } } | null;
  sessions: WeekSession[];
  activities: CachedActivity[];
  offPlan: CachedActivity[];
  warnings: RuleWarning[];
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
}

export interface RoutineItemView {
  code: string;
  name: string;
  durationS: number;
  perSide: boolean;
  reason?: string;
}

export interface MobilityToday {
  morning: RoutineItemView[];
  evening: RoutineItemView[];
  /** Pas encore de résultats de tests : seul le créneau du jour est proposé, sans socle. */
  testsMissing: boolean;
  checked: Record<Slot, boolean>;
  regularity: Record<Slot, Regularity>;
  /** 7 derniers jours, du plus ancien à aujourd'hui. */
  last7: { day: string; morning: boolean; evening: boolean }[];
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
  };
  volume: VolumeView;
  week: WeekView;
  /** Exercice du créneau du soir proposé pour chaque jour de la semaine. */
  evenings: Record<string, RoutineItemView | null>;
  mobility: MobilityToday;
  signals: Signal[];
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
