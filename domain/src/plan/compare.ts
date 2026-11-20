import type { PlannedSession, PlanSource } from './types.ts';

/**
 * Comparaison du plan Claude et du plan Campus d'une même semaine (D162). Un seul plan est actif
 * (envoyé sur la montre, rapproché des activités) ; l'autre reste en regard, pour choisir bloc par bloc.
 */
export interface PlanSummary {
  source: PlanSource;
  sessions: {
    name: string;
    sport: PlannedSession['sport'];
    durationMin: number;
    intense: boolean;
    day?: string;
  }[];
  runCount: number;
  runMinutes: number;
  /** Plus longue course de la semaine, en minutes. */
  longRunMin: number;
  bikeMinutes: number;
  strengthCount: number;
  /** Séances d'intensité (fractionné, compétition, test). */
  intenseCount: number;
  totalMinutes: number;
}

export interface PlanComparison {
  week: string;
  active: PlanSource;
  campus: PlanSummary | null;
  claude: PlanSummary | null;
  /** Écarts lisibles, Claude par rapport à Campus ; vide si un des deux plans manque. */
  differences: string[];
}

export function summarize(source: PlanSource, sessions: PlannedSession[]): PlanSummary {
  const active = sessions.filter((s) => s.status !== 'skipped');
  const runs = active.filter((s) => s.sport === 'run');
  const sum = (list: PlannedSession[]) => list.reduce((t, s) => t + s.durationMin, 0);
  return {
    source,
    sessions: active.map((s) => ({
      name: s.displayName,
      sport: s.sport,
      durationMin: s.durationMin,
      intense: s.intense,
      ...(s.day && { day: s.day }),
    })),
    runCount: runs.length,
    runMinutes: sum(runs),
    longRunMin: Math.max(0, ...runs.map((s) => s.durationMin)),
    bikeMinutes: sum(active.filter((s) => s.sport === 'bike')),
    strengthCount: active.filter((s) => s.sport === 'strength').length,
    intenseCount: active.filter((s) => s.intense).length,
    totalMinutes: sum(active),
  };
}

const signed = (n: number, unit: string) => `${n > 0 ? '+' : ''}${n} ${unit}`;

export function comparePlans(
  week: string,
  active: PlanSource,
  campus: PlanSummary | null,
  claude: PlanSummary | null,
): PlanComparison {
  const differences: string[] = [];
  if (campus && claude) {
    const d = (label: string, a: number, b: number, unit: string) => {
      if (a !== b) differences.push(`${label} : ${signed(b - a, unit)} avec Claude (${a} → ${b})`);
    };
    d('Courses', campus.runCount, claude.runCount, 'séance(s)');
    d('Minutes de course', campus.runMinutes, claude.runMinutes, 'min');
    d('Sortie la plus longue', campus.longRunMin, claude.longRunMin, 'min');
    d('Vélo', campus.bikeMinutes, claude.bikeMinutes, 'min');
    d('Renforcement', campus.strengthCount, claude.strengthCount, 'séance(s)');
    d('Intensité', campus.intenseCount, claude.intenseCount, 'séance(s)');
    if (!differences.length) differences.push('Mêmes volumes et même répartition cette semaine.');
  }
  return { week, active, campus, claude, differences };
}
