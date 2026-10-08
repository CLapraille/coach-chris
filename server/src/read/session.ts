import {
  compareSteps,
  DEFAULT_RULES,
  plannedSteps,
  sessionBlocks,
  type ActivityDetail,
  type SessionView,
} from '@coach-chris/domain';
import type { McpCaller } from '../mcp/client.ts';
import type { Doc, Store } from '../store/store.ts';
import * as garmin from '../sync/garmin.ts';
import { pk } from '../sync/sync.ts';
import { weekData } from './week.ts';

const SCHEMA = 1;

/**
 * Détail d'une activité : lu une fois dans Garmin (résumé, tours, zones FC) puis gardé en cache,
 * car une activité terminée ne change plus.
 */
async function activityDetail(
  store: Store,
  mcp: McpCaller | undefined,
  id: string,
  day: string,
  now: string,
): Promise<ActivityDetail> {
  const cached = await store.get<Doc & { detail: ActivityDetail }>('cache', id, pk('detail', day));
  if (cached) return cached.detail;
  if (!mcp) throw new Error('Garmin non joignable : détail pas encore lu');
  const args = { activity_id: Number(id) };
  const summary = garmin.activitySummary(await mcp.call('get_activity', args));
  if (!summary) throw new Error('Activité introuvable dans Garmin');
  const detail: ActivityDetail = {
    ...summary,
    laps: garmin.laps(await mcp.call('get_activity_splits', args)),
    zones: garmin.hrZones(await mcp.call('get_activity_hr_in_timezones', args)),
  };
  await store.upsert('cache', {
    id,
    pk: pk('detail', day),
    source: 'garmin',
    fetchedAt: now,
    schemaVersion: SCHEMA,
    detail,
  });
  return detail;
}

/** Détail de séance (maquette v2). `undefined` si la clé ne correspond à aucune séance connue. */
export async function sessionView(
  store: Store,
  mcp: McpCaller | undefined,
  key: string,
  today: string,
  now: string,
): Promise<SessionView | undefined> {
  const weekStart = key.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return undefined;
  const { view, plan } = await weekData(store, weekStart, today);
  const session = view.sessions.find((s) => s.key === key);
  if (!session) return undefined;
  const details = plan?.details.get(session.index);
  const out: SessionView = {
    weekStart,
    session,
    blocks: sessionBlocks(details?.exercisesBlocks ?? []),
    activity: null,
    deviation: null,
    rules: DEFAULT_RULES,
    ...(details?.description && { description: details.description }),
    ...(details?.coachAdvice && { coachAdvice: details.coachAdvice }),
  };
  const id = session.match?.activityId;
  if (!id) return out;
  const day = view.activities.find((a) => a.id === id)?.startLocal.slice(0, 10) ?? session.match!.day;
  try {
    out.activity = await activityDetail(store, mcp, id, day, now);
  } catch (e) {
    out.activityError = e instanceof Error ? e.message : String(e);
    return out;
  }
  // Écart étape par étape seulement pour une course envoyée sur la montre : ses tours portent l'index d'étape.
  const indexed = out.activity.laps.some((l) => l.workoutStepIndex !== undefined);
  if (session.sport === 'run' && indexed && details?.exercisesBlocks?.length) {
    out.deviation = compareSteps(plannedSteps(details.exercisesBlocks), out.activity.laps);
  }
  return out;
}
