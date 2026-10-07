import { activitySport, type Activity } from '../plan/matching.ts';
import type { Deviation } from '../plan/deviation.ts';
import type { HrvReading } from '../wellness/wellness.ts';
import { hrvStatus } from '../wellness/wellness.ts';

/** Signal de l'écran Aujourd'hui (D51) : un constat et sa règle, jamais un diagnostic. */
export interface Signal {
  id: string;
  level: 'warn' | 'info';
  title: string;
  text: string;
  rule: string;
}

/** Étapes de marche courues ou de course trop intense dans la dernière séance analysée. */
export function deviationSignal(sessionLabel: string, d: Deviation): Signal | null {
  const ran = d.steps.filter((s) => s.issues.includes('ran'));
  const hot = d.steps.filter((s) => s.issues.includes('hr-too-high'));
  if (!ran.length && !hot.length) return null;
  const parts = [
    ran.length &&
      `${ran.length > 1 ? `${ran.length} récupérations` : 'une récupération'} courue${ran.length > 1 ? 's' : ''} (étape ${ran.map((s) => s.n).join(', ')})`,
    hot.length && `${hot.length} étape${hot.length > 1 ? 's' : ''} de course au-dessus de la zone 2`,
  ].filter(Boolean);
  return {
    id: 'deviation',
    level: 'warn',
    title: ran.length
      ? ran.length > 1
        ? 'Des récupérations courues'
        : 'Une récupération courue'
      : 'Course trop intense',
    text: `${sessionLabel} : ${parts.join(' et ')}. ${d.compliantCount} étapes conformes sur ${d.steps.length}.`,
    rule: 'Marche avec une cadence ≥ 130 pas/min, ou course avec une FC moyenne au-dessus du haut de la zone 2. Les tours après la fin du programme ne comptent pas.',
  };
}

export function hrvSignal(r: HrvReading): Signal | null {
  const s = hrvStatus(r);
  if (s.weekly !== 'below') return null;
  const night = s.lastNight === 'within' ? ` La nuit dernière (${r.lastNightMs} ms) est dans la plage.` : '';
  return {
    id: 'hrv-weekly-below',
    level: 'info',
    title: 'VFC moyenne sous ta plage',
    text: `${r.weeklyAvgMs} ms sur 7 jours, pour une plage habituelle de ${r.baselineLowMs} à ${r.baselineHighMs}.${night}`,
    rule: 'Moyenne VFC 7 j < borne basse de la plage Garmin. Observation, pas un diagnostic.',
  };
}

const SPORT_FR: Record<string, string> = {
  bike: 'Vélo',
  strength: 'Renforcement',
  run: 'Course',
  other: 'Activité',
};

/** Activités sportives sans séance du plan (hors marches). */
export function offPlanSignals(offPlan: Activity[]): Signal[] {
  return offPlan.map((a) => {
    const sport = activitySport(a.type);
    return {
      id: `off-plan-${a.id}`,
      level: 'info' as const,
      title: `${SPORT_FR[sport] ?? 'Activité'} hors plan`,
      text: `${Math.round(a.durationS / 60)} min le ${a.startLocal.slice(8, 10)}/${a.startLocal.slice(5, 7)}, non prévu par le plan.`,
      rule: 'Activité Garmin sans séance correspondante, marches exclues.',
    };
  });
}
