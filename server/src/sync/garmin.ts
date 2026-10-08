import type { ActivityDetail, CachedActivity, LapView, Night, WeighIn } from '@coach-chris/domain';

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
  if (typeof d.awakeSleepSeconds === 'number') out.awakeSeconds = d.awakeSleepSeconds;
  const score = (d.sleepScores as { overall?: { value?: unknown } } | undefined)?.overall?.value;
  if (typeof score === 'number') out.score = score;
  return out;
}

/** Garmin recalcule la disponibilité dans la journée ; on garde celle du réveil, à défaut la plus récente. */
export function readiness(raw: unknown): Night['readiness'] {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const list = raw as { context?: string; score?: unknown; level?: unknown; recovery_time_hours?: unknown }[];
  const r = list.find((x) => x.context === 'AFTER_WAKEUP_RESET') ?? list[0]!;
  if (typeof r.score !== 'number') return null;
  const out: NonNullable<Night['readiness']> = { score: r.score };
  if (typeof r.level === 'string') out.level = r.level;
  if (typeof r.recovery_time_hours === 'number') out.recoveryHours = r.recovery_time_hours;
  return out;
}

/** Body Battery : gain pendant le sommeil (événement SLEEP) et niveau annoncé par Garmin. */
export function bodyBattery(raw: unknown): Night['bodyBattery'] {
  const d = (Array.isArray(raw) ? raw[0] : undefined) as
    { events?: { type?: string; body_battery_impact?: unknown }[]; body_battery_level?: unknown } | undefined;
  if (!d) return null;
  const out: NonNullable<Night['bodyBattery']> = {};
  const gain = d.events?.find((e) => e.type === 'SLEEP')?.body_battery_impact;
  if (typeof gain === 'number') out.sleepGain = gain;
  if (typeof d.body_battery_level === 'string') out.level = d.body_battery_level;
  return Object.keys(out).length ? out : null;
}

/** Niveau de stress Garmin considéré comme du repos. */
const REST_MAX = 25;

/** Stress de la journée : moyenne Garmin, et part du temps mesuré passé au repos (valeurs négatives = non mesuré). */
export function stress(raw: unknown): Night['stress'] {
  const d = raw as { avgStressLevel?: unknown; stressValuesArray?: [number, number][] } | null;
  if (!d || typeof d.avgStressLevel !== 'number' || d.avgStressLevel < 0) return null;
  const out: NonNullable<Night['stress']> = { avg: d.avgStressLevel };
  const measured = (d.stressValuesArray ?? []).map(([, v]) => v).filter((v) => v >= 0);
  if (measured.length)
    out.restPercent = Math.round((100 * measured.filter((v) => v <= REST_MAX).length) / measured.length);
  return out;
}

/** Montre qui a envoyé les dernières données (get_device_last_used). */
export function device(raw: unknown): { name: string; lastUpload?: string } | null {
  const d = raw as { device_name?: unknown; last_upload_time?: unknown } | null;
  if (!d || typeof d.device_name !== 'string') return null;
  return {
    name: d.device_name,
    ...(typeof d.last_upload_time === 'string' && { lastUpload: d.last_upload_time }),
  };
}

interface GarminLap {
  lap_number: number;
  duration_seconds: number;
  moving_duration_seconds?: number;
  distance_meters?: number;
  avg_speed_mps?: number;
  avg_hr_bpm?: number;
  max_hr_bpm?: number;
  avg_cadence?: number;
  avg_power_watts?: number;
  workout_step_index?: number;
}

/** Tours d'une activité (get_activity_splits) ; `workoutStepIndex` n'existe que pour les tours du programme. */
export function laps(raw: unknown): LapView[] {
  const list = (raw as { laps?: GarminLap[] } | null)?.laps ?? [];
  return list.map((l) => {
    const out: LapView = {
      n: l.lap_number,
      durationS: Math.round(l.duration_seconds),
      movingS: Math.round(l.moving_duration_seconds ?? l.duration_seconds),
    };
    if (l.avg_hr_bpm !== undefined) out.avgHr = l.avg_hr_bpm;
    if (l.max_hr_bpm !== undefined) out.maxHr = l.max_hr_bpm;
    if (l.avg_cadence !== undefined) out.avgCadence = Math.round(l.avg_cadence);
    if (l.distance_meters !== undefined) out.distanceM = Math.round(l.distance_meters);
    if (l.avg_speed_mps !== undefined) out.speedMps = l.avg_speed_mps;
    if (l.avg_power_watts !== undefined) out.powerW = l.avg_power_watts;
    if (l.workout_step_index !== undefined) out.workoutStepIndex = l.workout_step_index;
    return out;
  });
}

export function hrZones(raw: unknown): ActivityDetail['zones'] {
  if (!Array.isArray(raw)) return [];
  return (raw as { zoneNumber?: unknown; zoneLowBoundary?: unknown; secsInZone?: unknown }[]).flatMap((z) =>
    typeof z.zoneNumber === 'number' &&
    typeof z.zoneLowBoundary === 'number' &&
    typeof z.secsInZone === 'number'
      ? [{ zone: z.zoneNumber, lowBpm: z.zoneLowBoundary, seconds: Math.round(z.secsInZone) }]
      : [],
  );
}

/** Résumé d'activité (get_activity) : seuls les champs présents sont gardés. */
export function activitySummary(raw: unknown): Omit<ActivityDetail, 'laps' | 'zones'> | null {
  const a = raw as Record<string, unknown> | null;
  if (!a || typeof a.id !== 'number' || typeof a.start_time_local !== 'string') return null;
  const num = (k: string) => (typeof a[k] === 'number' ? (a[k] as number) : undefined);
  const out: Omit<ActivityDetail, 'laps' | 'zones'> = {
    id: String(a.id),
    // « 2026-10-08T21:23:01.0 » → « 2026-10-08 21:23:01 », comme les autres activités du cache.
    startLocal: a.start_time_local.replace('T', ' ').slice(0, 19),
    type: String(a.type),
    durationS: Math.round(num('duration_seconds') ?? 0),
  };
  if (typeof a.name === 'string') out.name = a.name;
  const set = <K extends keyof typeof out>(k: K, v: (typeof out)[K] | undefined) => {
    if (v !== undefined) out[k] = v;
  };
  const dist = num('distance_meters');
  set('distanceM', dist === undefined ? undefined : Math.round(dist));
  set('avgHr', num('avg_hr_bpm'));
  set('maxHr', num('max_hr_bpm'));
  set('trainingEffect', num('training_effect'));
  set(
    'trainingEffectLabel',
    typeof a.training_effect_label === 'string' ? a.training_effect_label : undefined,
  );
  const load = num('training_load');
  set('trainingLoad', load === undefined ? undefined : Math.round(load));
  set('avgPowerW', num('avg_power_watts'));
  set('rpe', num('workout_rpe'));
  set('feel', num('workout_feel'));
  return out;
}
