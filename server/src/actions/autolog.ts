import { activitySport, addDays, manualStrength, mondayOf } from '@coach-chris/domain';
import type { McpCaller } from '../mcp/client.ts';
import { pushId, weekData } from '../read/week.ts';
import type { Doc, Store } from '../store/store.ts';
import { writeFailure } from '../sync/garmin.ts';
import type { Clock } from '../sync/sync.ts';

/**
 * Renforcement fait sans la montre → activité « Musculation » créée dans Garmin, automatiquement (D148, choix
 * explicite de l'utilisateur : pas d'aperçu ni de confirmation pour cette écriture-là). Chaque création est
 * journalisée comme les autres écritures.
 */
export const STRENGTH_LOG_KIND = 'strength-log';
type StrengthLogDoc = Doc & { sessionKey: string; activityId?: string; attempts: number; at: string };

/** Séances validées à partir de ce jour seulement : pas de rattrapage de l'historique. */
export const STRENGTH_LOG_SINCE = '2026-10-15';
/** Laisse à une activité faite avec la montre le temps d'arriver dans Garmin avant de conclure qu'il n'y en a pas. */
const GRACE_MS = 3 * 3600_000;
const MAX_ATTEMPTS = 3;
const LOG_TTL_S = 90 * 24 * 3600;

// Les synchros Garmin et Campus finissent souvent ensemble (ouverture de l'app) : un passage à la fois,
// sinon la même séance serait créée deux fois.
let queue: Promise<void> = Promise.resolve();

export function logStrengthToGarmin(
  store: Store,
  garmin: McpCaller,
  clock: Clock,
  since = STRENGTH_LOG_SINCE,
  graceMs = GRACE_MS,
): Promise<void> {
  const run = queue.then(() => pass(store, garmin, clock, since, graceMs));
  queue = run.catch(() => undefined);
  return run;
}

async function pass(
  store: Store,
  garmin: McpCaller,
  clock: Clock,
  since: string,
  graceMs: number,
): Promise<void> {
  const today = clock.today();
  const now = Date.parse(clock.now());
  const monday = mondayOf(today);
  for (const start of [addDays(monday, -7), monday]) {
    const { view, plan } = await weekData(store, start, today, false);
    for (const s of plan?.sessions ?? []) {
      const ws = view.sessions.find((x) => x.key === s.key);
      if (s.sport !== 'strength' || s.status !== 'done' || !s.completedAtUtc || ws?.match?.activityId)
        continue;
      const done = Date.parse(`${s.completedAtUtc.replace(' ', 'T')}:00Z`);
      if (s.completedAtUtc.slice(0, 10) < since || now - done < graceMs) continue;
      const req = manualStrength(s);
      if (!req) continue;
      // Une activité de renforcement existe déjà ce jour-là (montre) : rien à créer.
      if (
        view.activities.some((a) => a.startLocal.startsWith(req.date) && activitySport(a.type) === 'strength')
      )
        continue;
      const id = pushId(s.key);
      const prev = await store.get<StrengthLogDoc>('ops', id, STRENGTH_LOG_KIND);
      if (prev?.activityId || (prev?.attempts ?? 0) >= MAX_ATTEMPTS) continue;
      await create(store, garmin, clock, s.key, req, id, prev?.attempts ?? 0);
    }
  }
}

async function create(
  store: Store,
  garmin: McpCaller,
  clock: Clock,
  sessionKey: string,
  req: NonNullable<ReturnType<typeof manualStrength>>,
  id: string,
  attempts: number,
): Promise<void> {
  const at = clock.now();
  let failure: string | null;
  let activityId: string | undefined;
  try {
    const raw = await garmin.call('create_manual_activity', { ...req }, { write: true });
    const result = typeof raw === 'string' && raw.startsWith('{') ? (JSON.parse(raw) as unknown) : raw;
    failure = writeFailure(result);
    const created = (result as { activity?: { activityId?: unknown } } | null)?.activity?.activityId;
    if (!failure && created !== undefined) activityId = String(created);
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
  }
  await store.upsert('ops', {
    id,
    kind: STRENGTH_LOG_KIND,
    source: 'app',
    fetchedAt: at,
    schemaVersion: 1,
    sessionKey,
    ...(activityId && { activityId }),
    attempts: failure ? attempts + 1 : attempts,
    at,
  } satisfies StrengthLogDoc);
  // Le journal des écritures de l'écran Données (D123).
  await store.upsert('ops', {
    id: `${at}:action`,
    kind: 'action-log',
    source: 'app',
    fetchedAt: at,
    schemaVersion: 1,
    type: 'garmin.strength-log',
    title: `${req.activity_name} dans Garmin (${req.date} ${req.start_time}, ${req.duration_minutes} min)`,
    outcome: failure ? 'error' : 'ok',
    message: failure ?? 'Activité « Musculation » créée dans Garmin.',
    tools: ['create_manual_activity'],
    ttl: LOG_TTL_S,
  });
}
