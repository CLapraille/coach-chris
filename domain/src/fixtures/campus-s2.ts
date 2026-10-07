import type { CampusSessionDetails, CampusWeek } from '../plan/campus.ts';
import type { Activity } from '../plan/matching.ts';

/** Semaine S2 du plan « Retour de blessure », relevée le 2026-10-07 (champs utiles seulement). */
const W = '6ac4db9a6ac27a06177d3600';
const D = '2026-10-05 00:00';

export const S2_WEEK: CampusWeek = {
  weekId: W,
  weekDate: D,
  sessions: [
    {
      weekId: W,
      sessionIndex: 0,
      displayName: 'Renforcement',
      name: 'MIX - MID - BLESSURE - SEMAINE 2 SEANCE 1',
      status: 'done',
      trainingType: 'PPG',
      sport: 'ppg',
      weekDate: D,
      duration: { value: 30, timeUnit: 'minutes' },
    },
    {
      weekId: W,
      sessionIndex: 1,
      displayName: 'Retour de blessure',
      name: 'Retour_Blessure_S2_1',
      status: 'done',
      trainingType: 'EF',
      sport: 'road',
      test: false,
      weekDate: D,
      stats: { expectedDuration: 1800 },
    },
    {
      weekId: W,
      sessionIndex: 2,
      displayName: 'Retour de blessure',
      name: 'Retour_Blessure_S2_2',
      status: 'todo',
      trainingType: 'EF',
      sport: 'road',
      test: false,
      weekDate: D,
      stats: { expectedDuration: 2160 },
    },
    {
      weekId: W,
      sessionIndex: 3,
      displayName: 'Renforcement',
      name: 'MIX - MID - BLESSURE - SEMAINE 2 SEANCE 2',
      status: 'todo',
      trainingType: 'PPG',
      sport: 'ppg',
      weekDate: D,
      duration: { value: 30, timeUnit: 'minutes' },
    },
    {
      weekId: W,
      sessionIndex: 4,
      displayName: 'Retour de blessure',
      name: 'Retour_Blessure_S2_3',
      status: 'todo',
      trainingType: 'EF',
      sport: 'road',
      test: false,
      weekDate: D,
      stats: { expectedDuration: 1200 },
    },
  ],
};

export const S2_DETAILS = new Map<number, CampusSessionDetails>([
  [
    0,
    {
      racingNote: { completionDate: '2026-10-07 18:40' },
      exercisesBlocks: [
        {
          exercises: [
            { name: 'Chaise' },
            { name: 'Mollet statique' },
            { name: 'Gainage Frontal' },
            { name: 'Gainage Latéral' },
            { name: 'Récupération', exerciseType: 'recuperation' },
          ],
        },
      ],
    },
  ],
  [1, { racingNote: { externalId: '24631672339', completionDate: '2026-10-06 18:58' } }],
]);

/** Activités Garmin de la semaine du 05/10 jusqu'au 07/10 (get_activities, relevé du 2026-10-07). */
export const S2_ACTIVITIES: Activity[] = [
  { id: '24615257479', startLocal: '2026-10-05 17:11:19', type: 'walking', durationS: 614 },
  { id: '24631672339', startLocal: '2026-10-06 20:58:51', type: 'running', durationS: 1801 },
  { id: '24636237784', startLocal: '2026-10-07 09:17:35', type: 'walking', durationS: 947 },
];
