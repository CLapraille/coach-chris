import {
  addDays,
  CATCH_UP_DAYS,
  canCheck,
  FEEL_VALUES,
  mondayOf,
  seasonView,
  comparePlans,
  summarize,
  type ActionRequest,
  type SourceName,
  type TestResults,
} from '@coach-chris/domain';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ActionError, Actions } from './actions/actions.ts';
import {
  deleteEvent,
  ImportError,
  importPlan,
  importSeason,
  readSeason,
  readSettings,
  saveEvent,
  saveSettings,
  setWeekSource,
} from './plan/claude.ts';
import { BRIEF_WEEKS, claudeBriefText } from './read/brief.ts';
import { planWeek } from './read/cache.ts';
import { readCheckins, setFoot, setSessionCheckin } from './read/checkin.ts';
import { addToInbox, listInbox, removeFromInbox } from './read/inbox.ts';
import { acceptReview, cancelReview, ReviewError, reviewView, reviewWeekFor } from './read/review.ts';
import { acceptBlock, BlockError, mobilityView, saveTests, setRoutineLog } from './read/mobility.ts';
import { sessionView } from './read/session.ts';
import { dataStatus } from './read/status.ts';
import { todayView } from './read/today.ts';
import { moveInWeek, PlacementError, resetWeek, weekData, weekView } from './read/week.ts';
import type { McpCaller } from './mcp/client.ts';
import type { Store } from './store/store.ts';
import { parisClock, type Clock, type Sync } from './sync/sync.ts';

export interface AppDeps {
  store: Store;
  sync: Sync;
  /** Garmin, pour lire à la demande le détail d'une activité (tours, zones) et pour les écritures. */
  garmin?: McpCaller;
  /** Campus, pour les écritures (valider une séance). */
  campus?: McpCaller;
  /** MyWhoosh, facultatif : envoi des séances vélo du plan Claude (D160). */
  mywhoosh?: McpCaller;
  clock?: Clock;
  /**
   * Seul compte autorisé (ARCHITECTURE §8). Sur Azure, Easy Auth valide déjà le jeton ; le BFF vérifie en plus
   * l'identifiant transmis par Easy Auth (défense en profondeur). Absent en local : pas d'authentification (D17).
   */
  allowedOid?: string;
}

const SOURCES: SourceName[] = ['garmin', 'campus'];
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sides = <T extends z.ZodType>(t: T) => z.object({ left: t, right: t }).optional();
const testResults = z
  .object({
    kneeToWallCm: sides(z.number().min(0).max(30)),
    hipInternalRotationDeg: sides(z.number().min(0).max(90)),
    thomas: sides(z.enum(['above', 'level', 'below'])),
    bigToeExtensionDeg: sides(z.number().min(0).max(120)),
    balanceEyesClosedS: sides(z.number().min(0).max(30)),
    singleLegSquat: sides(z.enum(['yes', 'sometimes', 'no'])),
  })
  .strict();

const actionRequest = z.discriminatedUnion('type', [
  z.object({ type: z.literal('campus.complete'), sessionKey: z.string().min(1) }),
  z.object({ type: z.literal('garmin.push'), sessionKey: z.string().min(1) }),
  z.object({ type: z.literal('mywhoosh.upload'), sessionKey: z.string().min(1) }),
  z.object({ type: z.literal('mywhoosh.import') }),
  z.object({
    type: z.literal('garmin.annotate'),
    activityId: z.string().regex(/^\d+$/),
    changes: z
      .object({
        name: z.string().max(100).optional(),
        description: z.string().max(2000).optional(),
        rpe: z.number().int().min(1).max(10).optional(),
        feel: z
          .number()
          .refine((v): v is (typeof FEEL_VALUES)[number] => (FEEL_VALUES as readonly number[]).includes(v))
          .optional(),
      })
      .strict(),
  }),
]);

/** « 2026-10 » → « 2026-11 ». */
function nextMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number) as [number, number];
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
}

export function buildApp(deps?: AppDeps): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  app.get('/api/health', async () => ({ status: 'ok' }));
  if (!deps) return app;
  const { store, sync, garmin, campus, mywhoosh, clock = parisClock, allowedOid } = deps;
  const actions = new Actions({
    store,
    sync,
    clock,
    mcp: { ...(garmin && { garmin }), ...(campus && { campus }), ...(mywhoosh && { mywhoosh }) },
  });

  if (allowedOid) {
    app.addHook('onRequest', async (req, reply) => {
      if (req.url === '/api/health') return;
      if (req.headers['x-ms-client-principal-id'] !== allowedOid) {
        return reply.code(403).send({ error: 'Compte non autorisé' });
      }
    });
  }

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

  app.get('/api/sessions/:key', async (req, reply) => {
    const { key } = req.params as { key: string };
    const view = await sessionView(store, garmin, key, clock.today(), clock.now());
    return view ?? reply.code(404).send({ error: 'Séance introuvable' });
  });

  app.get('/api/data/status', async () => dataStatus(store, clock.today()));

  // Check-ins (D159) : jamais dans le futur, sauf le choix du sport d'une séance à venir.
  const score = z.number().int().min(0).max(10);
  app.get('/api/checkins', async (req, reply) => {
    const q = z.object({ from: day.optional(), to: day.optional() }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'from et to doivent être des dates AAAA-MM-JJ' });
    return readCheckins(store, q.data.from, q.data.to);
  });

  app.put('/api/checkins/:date', async (req, reply) => {
    const p = z.object({ date: day }).safeParse(req.params);
    const b = z.object({ foot: score.nullable() }).strict().safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: 'date ou score invalide (0 à 10)' });
    if (p.data.date > clock.today()) return reply.code(409).send({ error: 'Pas de check-in dans le futur' });
    return setFoot(store, p.data.date, b.data.foot, clock.now());
  });

  app.put('/api/checkins/:date/sessions/:id', async (req, reply) => {
    const p = z.object({ date: day, id: z.string().regex(/^[\w-]+$/) }).safeParse(req.params);
    const b = z
      .object({
        shin: score.nullable().optional(),
        rpe: score.nullable().optional(),
        swap: z.enum(['course', 'velo', 'rameur']).nullable().optional(),
      })
      .strict()
      .safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: 'séance, score ou sport invalide' });
    const scores = b.data.shin != null || b.data.rpe != null;
    if (scores && p.data.date > clock.today()) {
      return reply.code(409).send({ error: 'Tibia et effort se notent une fois la séance faite' });
    }
    const { shin, rpe, swap } = b.data;
    return setSessionCheckin(
      store,
      p.data.date,
      p.data.id,
      {
        ...(shin !== undefined && { shin }),
        ...(rpe !== undefined && { rpe }),
        ...(swap !== undefined && { swap }),
      },
      clock.now(),
    );
  });

  // Revue du dimanche (D161) : proposition calculée par règles, appliquée seulement une fois acceptée.
  app.get('/api/review', async (req, reply) => {
    const q = z.object({ week: day.optional() }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'week doit être une date AAAA-MM-JJ' });
    const today = clock.today();
    const week = q.data.week ? mondayOf(q.data.week) : reviewWeekFor(today, mondayOf(today));
    return { week, ...(await reviewView(store, week, today)) };
  });

  app.post('/api/review/:week/accept', async (req, reply) => {
    const p = z.object({ week: day }).safeParse(req.params);
    const b = z
      .object({
        durations: z.record(z.string(), z.number().int().min(10).max(300)).optional(),
        flex: z.enum(['velo', 'course']).optional(),
      })
      .strict()
      .safeParse(req.body ?? {});
    if (!p.success || !b.success) return reply.code(400).send({ error: 'semaine ou retouches invalides' });
    try {
      const { durations, flex } = b.data;
      return await acceptReview(
        store,
        mondayOf(p.data.week),
        clock.today(),
        { ...(durations && { durations }), ...(flex && { flex }) },
        clock.now(),
      );
    } catch (e) {
      if (e instanceof ReviewError) return reply.code(409).send({ error: e.message });
      throw e;
    }
  });

  app.delete('/api/review/:week', async (req, reply) => {
    const p = z.object({ week: day }).safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'semaine invalide' });
    await cancelReview(store, mondayOf(p.data.week));
    return { cancelled: mondayOf(p.data.week) };
  });

  // Plans Campus et Claude côte à côte (D162) ; un seul actif par semaine, choisi ici.
  app.get('/api/plans/compare', async (req, reply) => {
    const q = z.object({ week: day.optional() }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'week doit être une date AAAA-MM-JJ' });
    const week = mondayOf(q.data.week ?? clock.today());
    const [current, campusPlan, claudePlan] = await Promise.all([
      planWeek(store, week),
      planWeek(store, week, 'campus'),
      planWeek(store, week, 'claude'),
    ]);
    return comparePlans(
      week,
      current?.source ?? 'campus',
      campusPlan ? summarize('campus', campusPlan.sessions) : null,
      claudePlan ? summarize('claude', claudePlan.sessions) : null,
    );
  });

  app.put('/api/plans/:week/source', async (req, reply) => {
    const p = z.object({ week: day }).safeParse(req.params);
    const b = z
      .object({ active: z.enum(['campus', 'claude']) })
      .strict()
      .safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: 'semaine ou source invalide' });
    const week = mondayOf(p.data.week);
    if (!(await planWeek(store, week, b.data.active))) {
      return reply.code(409).send({
        error: `Pas de plan ${b.data.active === 'claude' ? 'Claude' : 'Campus'} pour cette semaine`,
      });
    }
    await setWeekSource(store, week, b.data.active, clock.now());
    return { week, active: b.data.active };
  });

  // Import depuis l'app (D164) : mêmes validations que la ligne de commande (D153, D154). `dryRun` d'abord
  // pour l'aperçu, puis le même fichier sans `dryRun` pour écrire ; un fichier refusé n'écrit rien.
  const importBody = z
    .object({ file: z.unknown(), dryRun: z.boolean().optional(), activate: z.boolean().optional() })
    .strict();
  const IMPORT_LIMIT = 2 * 1024 * 1024;
  const refused = (e: unknown) => {
    if (e instanceof ImportError) return { error: 'Fichier refusé', problems: e.problems };
    throw e;
  };

  app.post('/api/plans/import', { bodyLimit: IMPORT_LIMIT }, async (req, reply) => {
    const b = importBody.safeParse(req.body);
    if (!b.success || b.data.file === undefined) return reply.code(400).send({ error: 'fichier manquant' });
    try {
      return await importPlan(store, b.data.file, {
        now: clock.now(),
        activate: b.data.activate ?? true,
        dryRun: b.data.dryRun ?? false,
      });
    } catch (e) {
      return reply.code(422).send(refused(e));
    }
  });

  app.post('/api/season/import', { bodyLimit: IMPORT_LIMIT }, async (req, reply) => {
    const b = importBody.omit({ activate: true }).safeParse(req.body);
    if (!b.success || b.data.file === undefined) return reply.code(400).send({ error: 'fichier manquant' });
    try {
      return await importSeason(store, b.data.file, clock.now(), { dryRun: b.data.dryRun ?? false });
    } catch (e) {
      return reply.code(422).send(refused(e));
    }
  });

  // Courses de la saison à la main (D165) : ajout, modification, suppression, mêmes règles qu'un import.
  const eventId = z.object({ id: z.string().regex(/^[\w-]+$/) });
  app.post('/api/season/events', async (req, reply) => {
    try {
      return await saveEvent(store, req.body, clock.now());
    } catch (e) {
      return reply.code(422).send(refused(e));
    }
  });

  app.put('/api/season/events/:id', async (req, reply) => {
    const p = eventId.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'identifiant invalide' });
    try {
      return await saveEvent(store, req.body, clock.now(), p.data.id);
    } catch (e) {
      return reply.code(422).send(refused(e));
    }
  });

  app.delete('/api/season/events/:id', async (req, reply) => {
    const p = eventId.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'identifiant invalide' });
    if (!(await deleteEvent(store, p.data.id, clock.now()))) {
      return reply.code(404).send({ error: 'Course introuvable' });
    }
    return { deleted: p.data.id };
  });

  // Bilan pour Claude (D171) : texte à coller dans une session Claude pour rédiger le bloc suivant.
  app.get('/api/brief', async (req, reply) => {
    const q = z.object({ weeks: z.coerce.number().int().min(1).max(12).optional() }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'weeks doit être un nombre de 1 à 12' });
    const today = clock.today();
    return {
      text: await claudeBriefText(store, today, q.data.weeks ?? BRIEF_WEEKS),
      generatedAt: clock.now(),
    };
  });

  // Boîte à vidéos (D158) : liens http(s) seulement, note obligatoire (c'est elle qui dit quoi en faire).
  app.get('/api/inbox', async () => listInbox(store));

  app.post('/api/inbox', async (req, reply) => {
    const b = z
      .object({
        url: z.url({ protocol: /^https?$/ }).max(500),
        note: z.string().trim().min(1).max(500),
      })
      .strict()
      .safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: 'lien http(s) et note requis' });
    return addToInbox(store, b.data.url, b.data.note, clock.now());
  });

  app.delete('/api/inbox/:id', async (req, reply) => {
    const p = z.object({ id: z.uuid() }).safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'identifiant invalide' });
    await removeFromInbox(store, p.data.id);
    return { removed: p.data.id };
  });

  // Saison (D154) : courses importées, compte à rebours et réglage de la séance flexible (D153).
  app.get('/api/season', async () => {
    const [file, settings] = await Promise.all([readSeason(store), readSettings(store)]);
    return seasonView(file, settings, clock.today());
  });

  app.put('/api/season/settings', async (req, reply) => {
    const b = z
      .object({ flexDefault: z.enum(['velo', 'course']) })
      .strict()
      .safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: 'flexDefault doit valoir velo ou course' });
    await saveSettings(store, b.data, clock.now());
    return b.data;
  });

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

  app.get('/api/mobility', async () => {
    const today = clock.today();
    const { view, plan } = await weekData(store, mondayOf(today), today);
    return mobilityView(store, view.sessions, today, plan?.claude);
  });

  // Auto-tests (D74) : chaque test est facultatif ; un test refait remplace seulement son propre résultat.
  app.post('/api/mobility/tests', async (req, reply) => {
    const b = testResults.safeParse(req.body);
    if (!b.success || Object.keys(b.data).length === 0) {
      return reply.code(400).send({ error: 'résultats de tests invalides' });
    }
    await saveTests(store, clock.today(), b.data as TestResults, clock.now());
    return { saved: Object.keys(b.data) };
  });

  // Valider le bloc proposé (D78) : obligatoire avant de démarrer la routine du soir.
  app.post('/api/mobility/blocks/accept', async (req, reply) => {
    const b = z.object({ codes: z.array(z.string()).min(1) }).safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: 'codes manquants' });
    try {
      await acceptBlock(store, clock.today(), b.data.codes, clock.now());
      return { accepted: b.data.codes };
    } catch (e) {
      if (e instanceof BlockError) return reply.code(409).send({ error: e.message });
      throw e;
    }
  });

  // Écritures (D123) : aperçu relu dans les sources et signé, puis confirmation explicite.
  app.post('/api/actions/preview', async (req, reply) => {
    const b = actionRequest.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: 'demande d’écriture invalide' });
    try {
      return await actions.preview(b.data as ActionRequest);
    } catch (e) {
      if (e instanceof ActionError) return reply.code(e.status).send({ error: e.message });
      throw e;
    }
  });

  app.post('/api/actions/confirm', async (req, reply) => {
    const b = z.object({ token: z.string().min(1) }).safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: 'jeton manquant' });
    try {
      return await actions.confirm(b.data.token);
    } catch (e) {
      if (e instanceof ActionError) return reply.code(e.status).send({ error: e.message });
      throw e;
    }
  });

  // Reconnexion Campus depuis n'importe quel navigateur (D133) : le corps contient des secrets, jamais journalisé.
  app.post('/api/sources/campus/session', async (req, reply) => {
    const b = z.object({ pasted: z.string().min(1).max(10_000) }).safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: 'texte collé manquant' });
    try {
      return await actions.campusSession(b.data.pasted);
    } catch (e) {
      if (e instanceof ActionError) return reply.code(e.status).send({ error: e.message });
      throw e;
    }
  });

  app.post('/api/sync', async (req, reply) => {
    const q = z.object({ source: z.enum(['garmin', 'campus']).optional() }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'source doit valoir garmin ou campus' });
    const sources = q.data.source ? [q.data.source] : SOURCES;
    return Promise.all(sources.map((s) => sync.run(s, 'button')));
  });

  return app;
}
