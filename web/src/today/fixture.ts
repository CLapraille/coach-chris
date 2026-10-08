import type { DataStatus, TodayView, WeekSession } from '@coach-chris/domain';

/** Réponse type de /api/today, calquée sur la semaine S2 du 08/10 (tests uniquement). */

const session = (
  o: Partial<WeekSession> & Pick<WeekSession, 'key' | 'name' | 'sport' | 'day'>,
): WeekSession => ({
  displayName: o.sport === 'run' ? 'Retour de blessure' : 'Renforcement',
  index: 0,
  trainingType: o.sport === 'run' ? 'EF' : 'PPG',
  durationMin: 30,
  status: 'todo',
  intense: false,
  legs: o.sport === 'strength',
  legsFrom: o.sport === 'strength' ? 'exercises' : 'not-strength',
  fixed: false,
  ...o,
});

const run2 = session({
  key: 'k2',
  name: 'Retour_Blessure_S2_2',
  sport: 'run',
  day: '2026-10-08',
  durationMin: 36,
});
const str2 = session({
  key: 'k3',
  name: 'MIX - MID - BLESSURE - SEMAINE 2 SEANCE 2',
  sport: 'strength',
  day: '2026-10-09',
});

const days = ['05', '06', '07', '08', '09', '10', '11'].map((d) => `2026-10-${d}`);

export const TODAY: TodayView = {
  today: '2026-10-08',
  goal: {
    goalType: 'back-from-injury',
    startDate: '2026-09-28',
    endDate: '2026-11-22',
    durationInWeeks: 8,
    weekIndex: 2,
    sessionsDone: 7,
    sessionsTotal: 40,
    distanceKm: 12.7,
    timeS: 6326,
  },
  nextSession: {
    ...run2,
    blocks: [
      {
        repeat: 12,
        steps: [
          { name: 'Lent', kind: 'run', seconds: 120 },
          { name: 'Marche', kind: 'walk', seconds: 60 },
        ],
      },
    ],
  },
  thenSession: str2,
  form: {
    night: {
      day: '2026-10-08',
      fetchedAt: '2026-10-08T05:00:00Z',
      hrv: { lastNightMs: 68, weeklyAvgMs: 77, baselineLowMs: 81, baselineHighMs: 105 },
      hrvPosition: { lastNight: 'below', weekly: 'below' },
      sleep: { seconds: 26280, score: 84, awakeSeconds: 120 },
      readiness: { score: 76, level: 'HIGH', recoveryHours: 0 },
      bodyBattery: null,
      stress: null,
    },
    stressYesterday: { avg: 33, restPercent: 47 },
    hrvHistory: days.map((day, i) => ({ day, ms: i === 0 ? null : 70 + i })),
    weight: {
      latest: { day: '2026-10-08', kg: 83.39 },
      previous: { day: '2026-09-29', kg: 84.09 },
      deltaKg: -0.7,
      direction: 'down',
    },
  },
  volume: {
    weeks: [{ start: '2026-10-05', run: 30, bike: 0, strength: 30 }],
    cap: { run: null, total: null },
  },
  week: {
    start: '2026-10-05',
    days: days.map((day) => ({ day, label: day })),
    plan: { fetchedAt: '2026-10-08T05:00:00Z' },
    sessions: [run2, str2],
    activities: [],
    offPlan: [],
    warnings: [],
    manual: false,
    readiness: Object.fromEntries(days.map((d) => [d, d === '2026-10-08' ? 76 : null])),
    routines: Object.fromEntries(days.map((d) => [d, { morning: false, evening: false }])),
  },
  evenings: Object.fromEntries(days.map((d) => [d, null])),
  mobility: {
    morning: [{ code: 'M1', name: 'Claps devant / derrière', durationS: 60, perSide: false }],
    evening: [],
    testsMissing: true,
    checked: { morning: false, evening: false },
    regularity: { morning: { done: 0, days: 7, streak: 0 }, evening: { done: 0, days: 7, streak: 0 } },
    last7: days.map((day) => ({ day, morning: false, evening: false })),
  },
  signals: [],
};

export const STATUS: DataStatus = {
  sources: {
    garmin: { lastOkAt: '2026-10-08T05:00:00Z', last: { at: '2026-10-08T05:00:00Z', outcome: 'ok' } },
    campus: {
      lastOkAt: null,
      last: { at: '2026-10-08T05:00:00Z', outcome: 'token-expired', message: '401' },
    },
  },
  missingNights: ['2026-10-05'],
};
