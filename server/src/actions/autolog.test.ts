import type { PlannedSession, WeekSession } from '@coach-chris/domain';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../store/store.ts';
import { pushId } from '../read/week.ts';
import { garminLogStatus, STRENGTH_LOG_KIND } from './autolog.ts';

const planned = {
  key: '2026-10-19#2#MIX - MID - BLESSURE - SEMAINE 4 SEANCE 1',
  sport: 'strength',
  status: 'done',
  completedAtUtc: '2026-10-21 18:24',
} as PlannedSession;
const session = { key: planned.key } as WeekSession;
const log = (extra: Record<string, unknown>) => ({
  id: pushId(planned.key),
  kind: STRENGTH_LOG_KIND,
  source: 'app' as const,
  fetchedAt: '2026-10-21T19:30:00Z',
  schemaVersion: 1,
  sessionKey: planned.key,
  at: '2026-10-21T19:30:00Z',
  attempts: 0,
  ...extra,
});

describe('garminLogStatus (D152)', () => {
  it('validée il y a peu : en attente jusqu’à 1 h après la validation', async () => {
    expect(await garminLogStatus(new MemoryStore(), planned, session)).toEqual({
      state: 'waiting',
      after: '2026-10-21T19:24:00.000Z',
    });
  });

  it('créée, échouée, rattachée, à faire, hors renforcement, avant la mise en service', async () => {
    const store = new MemoryStore();
    await store.upsert('ops', log({ activityId: '1', name: 'CC · Renfo S4-1' }));
    expect(await garminLogStatus(store, planned, session)).toEqual({
      state: 'created',
      name: 'CC · Renfo S4-1',
    });

    const failed = new MemoryStore();
    await failed.upsert('ops', log({ attempts: 3, message: 'Error 500' }));
    expect(await garminLogStatus(failed, planned, session)).toEqual({
      state: 'failed',
      message: 'Error 500',
    });

    const linked = { ...session, match: { day: '2026-10-21', activityId: '1' } } as WeekSession;
    expect(await garminLogStatus(store, planned, linked)).toEqual({ state: 'linked' });
    expect(await garminLogStatus(store, { ...planned, status: 'todo' }, session)).toEqual({
      state: 'planned',
    });
    expect(await garminLogStatus(store, { ...planned, sport: 'run' }, session)).toBeUndefined();
    expect(
      await garminLogStatus(new MemoryStore(), { ...planned, completedAtUtc: '2026-10-13 19:27' }, session),
    ).toEqual({ state: 'before' });
  });
});
