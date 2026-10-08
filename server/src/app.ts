import { addDays, CATCH_UP_DAYS, canCheck, mondayOf, type SourceName } from '@coach-chris/domain';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { setRoutineLog } from './read/mobility.ts';
import { dataStatus } from './read/status.ts';
import { todayView } from './read/today.ts';
import { moveInWeek, PlacementError, resetWeek, weekView } from './read/week.ts';
import type { Store } from './store/store.ts';
import { parisClock, type Clock, type Sync } from './sync/sync.ts';

export interface AppDeps {
  store: Store;
  sync: Sync;
  clock?: Clock;
}

const SOURCES: SourceName[] = ['garmin', 'campus'];
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** « 2026-10 » → « 2026-11 ». */
function nextMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number) as [number, number];
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
}

export function buildApp(deps?: AppDeps): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  app.get('/api/health', async () => ({ status: 'ok' }));
  if (!deps) return app;
  const { store, sync, clock = parisClock } = deps;

  // Le cache répond tout de suite ; un rattrapage part en arrière-plan si le dernier passage est ancien (D15).
  const catchUp = () => {
    for (const source of SOURCES) sync.ensureFresh(source).catch((e: unknown) => app.log.error(e));
  };

  app.get('/api/today', async () => {
    catchUp();
    return todayView(store, clock.today());
  });

  app.get('/api/calendar/week', async (req, reply) => {
    const q = z.object({ start: day.optional() }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'start doit être une date AAAA-MM-JJ' });
    catchUp();
    return weekView(store, mondayOf(q.data.start ?? clock.today()), clock.today());
  });

  app.get('/api/calendar/month', async (req, reply) => {
    const q = z
      .object({
        m: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .optional(),
      })
      .safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'm doit être un mois AAAA-MM' });
    catchUp();
    const month = q.data.m ?? clock.today().slice(0, 7);
    const last = addDays(`${nextMonth(month)}-01`, -1);
    const mondays: string[] = [];
    for (let w = mondayOf(`${month}-01`); w <= last; w = addDays(w, 7)) mondays.push(w);
    return { month, weeks: await Promise.all(mondays.map((w) => weekView(store, w, clock.today()))) };
  });

  // Déplacer une séance (D50) : la réponse porte la semaine recalculée et ses avertissements.
  app.put('/api/calendar/week/:start/placement', async (req, reply) => {
    const p = z.object({ start: day }).safeParse(req.params);
    const b = z.object({ key: z.string(), day }).safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: 'semaine, séance ou jour invalide' });
    try {
      return await moveInWeek(
        store,
        mondayOf(p.data.start),
        clock.today(),
        b.data.key,
        b.data.day,
        clock.now(),
      );
    } catch (e) {
      if (e instanceof PlacementError) return reply.code(409).send({ error: e.message });
      throw e;
    }
  });

  app.delete('/api/calendar/week/:start/placement', async (req, reply) => {
    const p = z.object({ start: day }).safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'semaine invalide' });
    return resetWeek(store, mondayOf(p.data.start), clock.today());
  });

  app.get('/api/data/status', async () => dataStatus(store, clock.today()));

  // Cocher ou décocher une routine (D38) : rattrapage jusqu'à J-3, rien dans le futur.
  app.put('/api/mobility/log/:date/:slot', async (req, reply) => {
    const p = z.object({ date: day, slot: z.enum(['morning', 'evening']) }).safeParse(req.params);
    const b = z.object({ done: z.boolean() }).safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: 'date, créneau ou corps invalide' });
    if (!canCheck(p.data.date, clock.today())) {
      return reply.code(409).send({ error: `Rattrapage possible jusqu'à J-${CATCH_UP_DAYS} seulement` });
    }
    await setRoutineLog(store, p.data.date, p.data.slot, b.data.done, clock.now());
    return { date: p.data.date, slot: p.data.slot, done: b.data.done };
  });

  app.post('/api/sync', async (req, reply) => {
    const q = z.object({ source: z.enum(['garmin', 'campus']).optional() }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'source doit valoir garmin ou campus' });
    const sources = q.data.source ? [q.data.source] : SOURCES;
    return Promise.all(sources.map((s) => sync.run(s, 'button')));
  });

  return app;
}
