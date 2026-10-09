import {
  compareSteps,
  DEFAULT_RULES,
  plannedSteps,
  sessionBlocks,
  type SessionView,
} from '@coach-chris/domain';
import type { McpCaller } from '../mcp/client.ts';
import type { Store } from '../store/store.ts';
import { activityDetail } from '../sync/sync.ts';
import { weekData } from './week.ts';

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
