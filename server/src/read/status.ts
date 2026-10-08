import { addDays, type DataStatus, type SourceName } from '@coach-chris/domain';
import type { Doc, Store } from '../store/store.ts';
import { night } from './cache.ts';

type LogDoc = Doc & {
  source: SourceName;
  startedAt: string;
  outcome: 'ok' | 'token-expired' | 'error';
  message?: string;
};

/** État des sources (D81) : dernier passage réussi, dernier résultat, nuits manquantes de la semaine. */
export async function dataStatus(store: Store, today: string): Promise<DataStatus> {
  const [states, logs, nights] = await Promise.all([
    store.list<Doc & { lastOkAt?: string }>('ops', 'sync-state'),
    store.list<LogDoc>('ops', 'sync-log'),
    Promise.all(Array.from({ length: 7 }, (_, i) => night(store, addDays(today, -i)))),
  ]);
  const source = (name: SourceName): DataStatus['sources'][SourceName] => {
    const last = logs
      .filter((l) => l.id.endsWith(`:${name}`))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    return {
      lastOkAt: states.find((s) => s.id === `sync-state:${name}`)?.lastOkAt ?? null,
      last: last
        ? {
            at: last.startedAt,
            outcome: last.outcome,
            ...(last.message !== undefined && { message: last.message }),
          }
        : null,
    };
  };
  return {
    sources: { garmin: source('garmin'), campus: source('campus') },
    // Une nuit jamais synchronisée n'est pas « manquante » : seule une nuit relue sans sommeil ni VFC l'est.
    missingNights: nights
      .filter((n): n is NonNullable<typeof n> => !!n && !n.sleep && !n.hrv)
      .map((n) => n.day)
      .sort(),
  };
}
