import type { Activity, WeighIn } from '@coach-chris/domain';

/**
 * Conversion des réponses du MCP Garmin vers les documents du cache.
 * Un champ absent reste absent : aucune valeur n'est estimée (D84).
 */

interface GarminActivity {
  id: number;
  name?: string;
  type: string;
  start_time: string;
  duration_seconds: number;
  distance_meters?: number;
  avg_hr_bpm?: number;
}

export interface CachedActivity extends Activity {
  name?: string;
  distanceM?: number;
  avgHr?: number;
}

export function activities(raw: unknown): CachedActivity[] {
  const list = (raw as { activities?: GarminActivity[] })?.activities ?? [];
  return list.map((a) => {
    const out: CachedActivity = {
      id: String(a.id),
      startLocal: a.start_time,
      type: a.type,
      durationS: Math.round(a.duration_seconds),
    };
    if (a.name) out.name = a.name;
    if (a.distance_meters !== undefined) out.distanceM = Math.round(a.distance_meters);
    if (a.avg_hr_bpm !== undefined) out.avgHr = a.avg_hr_bpm;
    return out;
  });
}

export function weighIns(raw: unknown): WeighIn[] {
  const list = (raw as { measurements?: { date: string; weight_kg?: number }[] })?.measurements ?? [];
  return list.filter((m) => typeof m.weight_kg === 'number').map((m) => ({ day: m.date, kg: m.weight_kg! }));
}

/** Ce que la montre dit d'une nuit ; chaque partie vaut `null` quand Garmin n'a rien. */
export interface Night {
  hrv: {
    lastNightMs?: number;
    weeklyAvgMs?: number;
    baselineLowMs: number;
    baselineHighMs: number;
    status?: string;
  } | null;
  sleep: { seconds: number; score?: number } | null;
  readiness: { score: number; level?: string } | null;
}

export function hrv(raw: unknown): Night['hrv'] {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object') return null;
  const low = r.baseline_balanced_low_ms;
  const high = r.baseline_balanced_upper_ms;
  if (typeof low !== 'number' || typeof high !== 'number') return null;
  const out: NonNullable<Night['hrv']> = { baselineLowMs: low, baselineHighMs: high };
  if (typeof r.last_night_avg_hrv_ms === 'number') out.lastNightMs = r.last_night_avg_hrv_ms;
  if (typeof r.weekly_avg_hrv_ms === 'number') out.weeklyAvgMs = r.weekly_avg_hrv_ms;
  if (typeof r.status === 'string') out.status = r.status;
  return out;
}

export function sleep(raw: unknown): Night['sleep'] {
  const d = (raw as { dailySleepDTO?: Record<string, unknown> } | null)?.dailySleepDTO;
  if (!d || typeof d.sleepTimeSeconds !== 'number' || d.sleepTimeSeconds <= 0) return null;
  const out: NonNullable<Night['sleep']> = { seconds: d.sleepTimeSeconds };
  const score = (d.sleepScores as { overall?: { value?: unknown } } | undefined)?.overall?.value;
  if (typeof score === 'number') out.score = score;
  return out;
}

/** Garmin recalcule la disponibilité dans la journée ; on garde celle du réveil, à défaut la plus récente. */
export function readiness(raw: unknown): Night['readiness'] {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const list = raw as { context?: string; score?: unknown; level?: unknown }[];
  const r = list.find((x) => x.context === 'AFTER_WAKEUP_RESET') ?? list[0]!;
  if (typeof r.score !== 'number') return null;
  const out: NonNullable<Night['readiness']> = { score: r.score };
  if (typeof r.level === 'string') out.level = r.level;
  return out;
}
