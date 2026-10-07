import type { CampusBlock } from '../plan/campus.ts';
import type { Lap } from '../plan/deviation.ts';

/** Séance S1-3 du 04/10 : 8 × (2′ footing lent + 1′ marche), soit 24 min (Campus). */
export const S1_3_BLOCKS: CampusBlock[] = [
  {
    repeat: 8,
    exercises: [
      {
        name: 'slow_2',
        exerciseType: 'running',
        durations: [{ value: 2, timeUnit: 'minutes' }],
        pace: { zoneKind: 'Z1' },
      },
      {
        name: 'Walk_1',
        exerciseType: 'recuperation',
        durations: [{ value: 1, timeUnit: 'minutes' }],
        pace: { zoneKind: 'RECOVER' },
      },
    ],
  },
];

/** Tours Garmin de l'activité 24607180087 (04/10, get_activity_splits), arrondis. */
const L = (
  durationS: number,
  movingS: number,
  avgHr: number,
  avgCadence: number,
  workoutStepIndex?: number,
): Lap =>
  workoutStepIndex === undefined
    ? { durationS, movingS, avgHr, avgCadence }
    : { durationS, movingS, avgHr, avgCadence, workoutStepIndex };

export const S1_3_LAPS: Lap[] = [
  L(120, 120, 122, 151, 0),
  L(60, 60, 115, 103, 1),
  L(120, 120, 112, 148, 0),
  L(60, 60, 117, 109, 1),
  L(120, 120, 114, 153, 0),
  L(60, 60, 123, 119, 1),
  L(120, 120, 123, 151, 0),
  L(60, 60, 123, 96, 1),
  L(120, 120, 126, 143, 0),
  L(60, 60, 135, 109, 1),
  L(120, 120, 120, 155, 0),
  L(60, 28, 128, 26, 1), // marche surtout à l'arrêt
  L(120, 109, 132, 131, 0),
  L(60, 60, 126, 125, 1),
  L(120, 120, 128, 139, 0),
  L(60, 60, 146, 160, 1), // « marche » courue
  L(320.464, 319, 106, 103), // après la fin du programme
  L(95.059, 88, 105, 82),
];
