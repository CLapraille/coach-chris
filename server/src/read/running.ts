import { activitySport, runningSeconds, type ActivityDetail, type CachedActivity } from '@coach-chris/domain';
import type { Doc, Store } from '../store/store.ts';
import { pk } from '../sync/sync.ts';

/**
 * Temps de course réel (D178) : les courses d'une liste d'activités, sans la marche de l'échauffement ni du
 * retour au calme, d'après les tours en cache (lus par la synchro). Une activité dont le détail n'est pas en
 * cache compte pour toute sa durée.
 */
export async function runningMinutes(store: Store, acts: CachedActivity[]): Promise<number> {
  const runs = acts.filter((a) => activitySport(a.type) === 'run');
  const seconds = await Promise.all(
    runs.map(async (a) => {
      const d = await store.get<Doc & { detail: ActivityDetail }>(
        'cache',
        a.id,
        pk('detail', a.startLocal.slice(0, 10)),
      );
      return runningSeconds(a, d?.detail.laps);
    }),
  );
  return Math.round(seconds.reduce((s, x) => s + x, 0) / 60);
}
