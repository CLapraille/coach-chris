import { describe, expect, it } from 'vitest';
import { indoorRun, runningSeconds } from './runningTime.ts';

describe('runningSeconds (D178)', () => {
  it('ne compte que les tours courus : la marche d’échauffement et de retour au calme est exclue', () => {
    const laps = [
      { durationS: 480, movingS: 470, avgCadence: 112 }, // échauffement : marche rapide
      { durationS: 1800, movingS: 1795, avgCadence: 166 }, // corps de séance
      { durationS: 540, movingS: 500, avgCadence: 98 }, // retour au calme
    ];
    expect(runningSeconds({ durationS: 2820 }, laps)).toBe(1800);
  });

  it('tour sans cadence : compté ; sans tours : toute la durée', () => {
    expect(runningSeconds({ durationS: 2000 }, [{ durationS: 1200, movingS: 1200 }])).toBe(1200);
    expect(runningSeconds({ durationS: 2000 }, undefined)).toBe(2000);
    expect(runningSeconds({ durationS: 2000 }, [])).toBe(2000);
  });

  it('course à l’intérieur', () => {
    expect(
      ['treadmill_running', 'indoor_running', 'virtual_run', 'running', 'trail_running'].map(indoorRun),
    ).toEqual([true, true, true, false, false]);
  });
});
