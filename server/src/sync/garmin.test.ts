import { describe, expect, it } from 'vitest';
import * as garmin from './garmin.ts';

// Extraits réels du MCP Garmin (relevé du 2026-10-08).
const ACTIVITIES = {
  count: 1,
  activities: [
    {
      id: 24631672339,
      name: 'Messancy Course à pied',
      type: 'running',
      start_time: '2026-10-06 20:58:51',
      distance_meters: 3810.989990234375,
      duration_seconds: 1801.3919677734375,
      avg_hr_bpm: 124,
    },
  ],
};

describe('adaptateurs Garmin', () => {
  it('activités : identifiant en texte, durée et distance arrondies', () => {
    expect(garmin.activities(ACTIVITIES)).toEqual([
      {
        id: '24631672339',
        name: 'Messancy Course à pied',
        type: 'running',
        startLocal: '2026-10-06 20:58:51',
        durationS: 1801,
        distanceM: 3811,
        avgHr: 124,
      },
    ]);
    expect(garmin.activities('No activities found')).toEqual([]);
  });

  it('pesées', () => {
    const raw = { measurements: [{ date: '2026-10-08', weight_kg: 83.39 }, { date: '2026-10-01' }] };
    expect(garmin.weighIns(raw)).toEqual([{ day: '2026-10-08', kg: 83.39 }]);
  });

  it('VFC : plage habituelle obligatoire, le reste seulement si présent', () => {
    const raw = {
      last_night_avg_hrv_ms: 68,
      weekly_avg_hrv_ms: 77,
      baseline_balanced_low_ms: 81,
      baseline_balanced_upper_ms: 105,
      status: 'UNBALANCED',
    };
    expect(garmin.hrv(raw)).toEqual({
      lastNightMs: 68,
      weeklyAvgMs: 77,
      baselineLowMs: 81,
      baselineHighMs: 105,
      status: 'UNBALANCED',
    });
    expect(garmin.hrv({ weekly_avg_hrv_ms: 77 })).toBeNull();
    expect(garmin.hrv('No HRV data')).toBeNull();
  });

  it('sommeil : une nuit sans mesure reste absente', () => {
    const raw = { dailySleepDTO: { sleepTimeSeconds: 26280, sleepScores: { overall: { value: 84 } } } };
    expect(garmin.sleep(raw)).toEqual({ seconds: 26280, score: 84 });
    expect(garmin.sleep({ dailySleepDTO: { sleepTimeSeconds: null } })).toBeNull();
  });

  it('disponibilité : celle du réveil plutôt que la plus récente', () => {
    const raw = [
      { context: 'AFTER_POST_EXERCISE_RESET', score: 60, level: 'MODERATE' },
      { context: 'AFTER_WAKEUP_RESET', score: 76, level: 'HIGH' },
    ];
    expect(garmin.readiness(raw)).toEqual({ score: 76, level: 'HIGH' });
    expect(garmin.readiness([])).toBeNull();
  });
});
