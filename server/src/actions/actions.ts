import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  annotationChanges,
  claudeGarminWorkout,
  claudeWhooshWorkout,
  campusRacingNote,
  FEEL_LABEL,
  fixMyWhooshFit,
  FitError,
  garminWorkout,
  parisOffsetS,
  mondayOf,
  sessionBlocks,
  sessionShort,
  WorkoutError,
  workoutSeconds,
  type ActionPreview,
  type ActionRequest,
  type ActionResult,
  type Annotation,
  type CampusBlock,
  type PlannedSession,
  type WeekSession,
} from '@coach-chris/domain';
import type { McpCaller, McpName } from '../mcp/client.ts';
import type { PlanWeek } from '../read/cache.ts';
import { claudeSessionOf } from '../read/session.ts';
import { activities } from '../read/cache.ts';
import { pushId, PUSH_KIND, weekData, type PushDoc } from '../read/week.ts';
import type { Doc, Store } from '../store/store.ts';
import * as garmin from '../sync/garmin.ts';
import { pk, type Clock, type Sync } from '../sync/sync.ts';

/** Durée de validité d'un aperçu (ARCHITECTURE §7). */
const TTL_MS = 5 * 60 * 1000;
const LOG_TTL_S = 90 * 24 * 3600;

/** Refus lisible, avec le code HTTP à renvoyer au front. */
export class ActionError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

/** Un appel d'outil d'écriture, figé au moment de l'aperçu. */
interface Step {
  source: McpName;
  tool: string;
  args: Record<string, unknown>;
  /** Reçoit en `workout_id` l'identifiant du workout créé par l'étape précédente. */
  useWorkoutId?: true;
}

type After =
  | { kind: 'campus' }
  | { kind: 'push'; sessionKey: string; date: string }
  | { kind: 'whoosh'; sessionKey: string; date: string; workoutId: number }
  | { kind: 'annotate'; activityId: string; day: string }
  | { kind: 'whooshImport'; rideId: string; day: string; startUtc?: string };

/** Sortie MyWhoosh à importer dans Garmin (D169) : le fichier est relu à la confirmation, jamais gardé. */
interface WhooshImport {
  rideId: string;
  fileId: string;
  fileName: string;
  /** Début annoncé par MyWhoosh : le fichier téléchargé doit lui correspondre. */
  startUtc?: string;
}

/** Sortie telle que renvoyée par l'outil maison `listActivities` (champs MyWhoosh non documentés). */
interface WhooshRide {
  id?: unknown;
  title?: unknown;
  routeName?: unknown;
  startDatetime?: unknown;
  rideDuration?: unknown;
  distance?: unknown;
  watt?: unknown;
  heartrate?: unknown;
  activityFileId?: unknown;
}

/** Imports déjà faits : partition `whoosh-import` du conteneur `ops`, un document par sortie. */
export const WHOOSH_IMPORT_KIND = 'whoosh-import';
/** Seules les sorties récentes sont proposées. */
const WHOOSH_IMPORT_DAYS = 21;
/** Écart toléré entre le début annoncé par MyWhoosh et celui d'une activité Garmin pour parler de doublon. */
const SAME_RIDE_S = 120;

/** « 2026-11-24 08:59:29 » : heure de Paris, au format des activités Garmin en cache. */
function parisLocal(isoUtc: string): string {
  const s = Date.parse(isoUtc) / 1000;
  return new Date((s + parisOffsetS(s)) * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

/** Contenu signé du jeton d'action : exactement ce que la confirmation exécutera. */
interface Signed {
  id: string;
  exp: number;
  type: ActionRequest['type'] | 'campus.session';
  title: string;
  steps: Step[];
  after: After;
  /** Import MyWhoosh → Garmin (D169), exécuté avant les étapes. */
  whooshImport?: WhooshImport;
}

export interface ActionDeps {
  store: Store;
  sync: Sync;
  mcp: Partial<Record<McpName, McpCaller>>;
  clock: Clock;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const two = (n: number) => String(n).padStart(2, '0');
const shortDate = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const duration = (s: number) => {
  const r = Math.round(s);
  const h = Math.floor(r / 3600);
  const m = Math.floor((r % 3600) / 60);
  return h ? `${h} h ${two(m)}` : `${m}:${two(r % 60)}`;
};
const minutes = (s: number) => (s % 60 ? `${Math.floor(s / 60)}′${two(s % 60)}` : `${s / 60}′`);
const longDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

function sessionTitle(s: { name: string; displayName: string }): string {
  const short = sessionShort(s.name);
  return short ? `Course ${short}` : s.displayName;
}

/** « 4 × (4′ Lent + 1′ Marche) » : les étapes telles que la montre les déroulera. */
function stepsSummary(blocks: CampusBlock[]): string {
  return sessionBlocks(blocks)
    .map((b) => {
      const inner = b.steps.map((s) => `${minutes(s.seconds)} ${s.name}`).join(' + ');
      return b.repeat > 1 ? `${b.repeat} × (${inner})` : inner;
    })
    .join(', ');
}

/**
 * Écritures avec aperçu puis confirmation (D123) : l'aperçu relit les sources et signe les appels exacts,
 * la confirmation exécute ce qui a été signé, contrôle chaque réponse et journalise.
 */
export class Actions {
  private readonly deps: ActionDeps;
  /** Clé aléatoire par processus : un seul réplica, aperçus de 5 min (D123). */
  private readonly key = randomBytes(32);
  /** Jetons déjà confirmés, jusqu'à leur expiration. */
  private readonly used = new Map<string, number>();

  constructor(deps: ActionDeps) {
    this.deps = deps;
  }

  async preview(req: ActionRequest): Promise<ActionPreview> {
    const built =
      req.type === 'campus.complete'
        ? await this.completePreview(req.sessionKey)
        : req.type === 'garmin.push'
          ? await this.pushPreview(req.sessionKey)
          : req.type === 'mywhoosh.upload'
            ? await this.whooshPreview(req.sessionKey)
            : req.type === 'mywhoosh.import'
              ? await this.whooshImportPreview()
              : await this.annotatePreview(req.activityId, req.changes);
    const exp = Date.parse(this.deps.clock.now()) + TTL_MS;
    const signed: Signed = { id: randomUUID(), exp, type: req.type, ...built.signed };
    const body = b64(JSON.stringify(signed));
    return {
      token: `${body}.${this.sign(body)}`,
      expiresAt: new Date(exp).toISOString(),
      title: signed.title,
      target: built.target,
      fields: built.fields,
      warnings: built.warnings,
    };
  }

  async confirm(token: string): Promise<ActionResult> {
    const plan = this.verify(token);
    this.used.set(plan.id, plan.exp);
    const done: string[] = [];
    let workoutId: unknown;
    let result: ActionResult;
    try {
      // Import MyWhoosh (D169) : son issue (doublon ou non) passe à `after` par la même variable.
      if (plan.whooshImport) workoutId = await this.runWhooshImport(plan.whooshImport, done);
      for (const step of plan.steps) {
        const mcp = this.source(step.source);
        const args = step.useWorkoutId ? { ...step.args, workout_id: workoutId } : step.args;
        const res = await mcp.call(step.tool, args, { write: true });
        if (step.source === 'mywhoosh') {
          // Le serveur MyWhoosh signale ses échecs en erreur d'outil (ToolError) : une réponse suffit.
        } else if (step.source === 'garmin') {
          const failure = garmin.writeFailure(res);
          if (failure) throw new Error(failure);
          if (step.tool === 'upload_workout') {
            workoutId = (res as { workout_id?: unknown }).workout_id;
            if (workoutId === undefined) throw new Error('Garmin n’a pas renvoyé l’identifiant du workout');
          }
        } else {
          const status = (res as { status?: unknown } | null)?.status;
          if (status === 'unverified') {
            throw new Error('Campus a reçu la demande, mais la séance n’apparaît pas validée à la relecture');
          }
          if (status !== 'success') throw new Error('Réponse inattendue de Campus');
        }
        done.push(step.tool);
      }
      result = { ok: true, message: await this.after(plan.after, workoutId) };
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      const partial = done.length ? ` Déjà effectué : ${done.join(', ')}.` : '';
      result = { ok: false, message: `${plan.title} : échec (${why}).${partial}` };
    }
    await this.log(plan, result, done);
    return result;
  }

  /**
   * Reconnexion Campus depuis le navigateur (D133) : le texte collé (copié par le snippet dans une fenêtre
   * privée) part vers le MCP, qui vérifie les jetons avant de les garder. Ni aperçu ni journal du contenu :
   * ce sont des secrets, seule l'issue est journalisée.
   */
  async campusSession(pasted: string): Promise<ActionResult> {
    let tokens: { atk?: unknown; rtk?: unknown };
    try {
      // trim() retire aussi le BOM (U+FEFF) éventuel.
      tokens = JSON.parse(pasted.trim()) as typeof tokens;
    } catch {
      throw new ActionError(
        'Texte collé illisible : relance la ligne dans la console de Campus, puis colle à nouveau',
        400,
      );
    }
    if (typeof tokens?.rtk !== 'string' || !tokens.rtk) {
      throw new ActionError(
        'Pas de jeton Campus dans le texte collé : es-tu connecté à Campus dans cette fenêtre ?',
        400,
      );
    }
    const atk = typeof tokens.atk === 'string' ? tokens.atk : null;
    const plan: Signed = {
      id: randomUUID(),
      exp: 0,
      type: 'campus.session',
      title: 'Reconnexion Campus',
      steps: [],
      after: { kind: 'campus' },
    };
    let result: ActionResult;
    try {
      const res = await this.source('campus').call<{ status?: unknown }>(
        'save_session',
        { atk, rtk: tokens.rtk },
        { write: true },
      );
      if (res?.status !== 'success') throw new Error('Réponse inattendue de Campus');
      const sync = await this.deps.sync.run('campus', 'action');
      result =
        sync.outcome === 'ok'
          ? { ok: true, message: 'Campus reconnecté : synchro faite.' }
          : {
              ok: true,
              message: `Campus reconnecté, mais la synchro a échoué : ${sync.message ?? sync.outcome}`,
            };
    } catch (e) {
      const why =
        e instanceof Error
          ? e.message.replace(/^campus\.save_session : (Error executing tool save_session: )?/, '')
          : String(e);
      result = { ok: false, message: `Reconnexion Campus : échec (${why}).` };
    }
    await this.log(plan, result, result.ok ? ['save_session'] : []);
    return result;
  }

  // ------------------------------------------------------------------ aperçus

  private async completePreview(sessionKey: string) {
    const { session, planned, weekStart } = await this.session(sessionKey);
    if (session.status !== 'todo') throw new ActionError('Séance déjà validée dans Campus');
    if (session.sport !== 'run') throw new ActionError('Seules les courses se valident depuis l’app (D125)');
    const activityId = session.match?.activityId;
    if (!activityId) throw new ActionError('Aucune activité Garmin rattachée à cette séance');
    const figures = garmin.activityFigures(
      await this.source('garmin').call('get_activity', { activity_id: Number(activityId) }),
    );
    if (!figures) throw new ActionError('Activité introuvable dans Garmin', 404);
    const device = await this.deps.store.get<Doc & { name: string }>('cache', 'garmin', 'device');
    const note = this.guard(() => campusRacingNote(figures, device?.name));
    const fields = [
      { label: 'Séance', value: `${sessionTitle(planned)} · ${planned.displayName}` },
      { label: 'Semaine', value: `du ${shortDate(weekStart)}` },
      {
        label: 'Activité Garmin',
        value: `${figures.name ?? activityId} · ${shortDate(session.match!.day)}`,
      },
      { label: 'Rattachement', value: session.match!.reason },
      { label: 'Distance', value: `${(note.distance as number).toFixed(2).replace('.', ',')} km` },
      { label: 'Durée', value: duration(note.time as number) },
      { label: 'Allure', value: `${duration(note.pace as number)} /km` },
    ];
    const opt = (label: string, v: unknown, unit = '') => {
      if (v !== undefined) fields.push({ label, value: `${String(v).replace('.', ',')}${unit}` });
    };
    opt('FC moyenne', note.averageHeartRateInBeatsPerMinute, ' bpm');
    opt('Cadence moyenne', note.averageRunCadenceInStepsPerMinute, ' pas/min');
    opt('Dénivelé +', note.totalElevationGainInMeters, ' m');
    opt('Dénivelé −', note.totalElevationLossInMeters, ' m');
    opt('Calories', note.activeCalories, ' kcal');
    opt('Montre', note.deviceName);
    const warnings: string[] = [];
    if (planned.sourceSport !== 'trailV2') {
      warnings.push(
        'Formulaire « route » pas encore confirmé (seul le trail a été capturé) : la relecture après l’envoi dira si Campus l’a accepté.',
      );
    }
    if (session.match!.confidence !== 'sure') {
      warnings.push(
        `Rattachement ${session.match!.confidence === 'probable' ? 'probable' : 'incertain'} : vérifie que c’est la bonne activité.`,
      );
    }
    return {
      target: 'Campus Coach' as const,
      fields,
      warnings,
      signed: {
        title: 'Valider dans Campus',
        steps: [
          {
            source: 'campus' as const,
            tool: 'complete_session',
            args: {
              week_date: weekStart,
              session_index: planned.index,
              session_name: planned.name,
              racing_note: note,
            },
          },
        ],
        after: { kind: 'campus' as const },
      },
    };
  }

  private async pushPreview(sessionKey: string) {
    const { session, planned, details, plan } = await this.session(sessionKey);
    if (planned.source === 'claude') return this.claudePushPreview(sessionKey, session, planned, plan!);
    if (session.sport !== 'run') throw new ActionError('Seules les courses s’envoient sur la montre (D126)');
    if (session.status !== 'todo' || session.match) throw new ActionError('Séance déjà faite');
    const today = this.deps.clock.today();
    if (!session.day || session.day < today)
      throw new ActionError('La séance n’a pas de jour à venir dans le calendrier');
    const blocks = details?.exercisesBlocks ?? [];
    if (!blocks.length) {
      throw new ActionError('Détail Campus de la séance pas encore lu : actualise Campus dans Données', 422);
    }
    const workout = this.guard(() =>
      garminWorkout({
        name: sessionTitle(planned),
        blocks,
        ...(details?.description && { description: details.description }),
      }),
    );
    const previous = await this.deps.store.get<PushDoc>('ops', pushId(sessionKey), PUSH_KIND);
    const steps: Step[] = [
      { source: 'garmin', tool: 'upload_workout', args: { workout_data: workout } },
      {
        source: 'garmin',
        tool: 'schedule_workout',
        args: { calendar_date: session.day },
        useWorkoutId: true,
      },
    ];
    // L'ancien workout n'est supprimé qu'une fois le nouveau en place : un échec laisse l'ancien intact.
    if (previous) {
      steps.push({
        source: 'garmin',
        tool: 'delete_workout',
        args: { workout_id: Number(previous.workoutId) },
      });
    }
    const fields = [
      { label: 'Nom', value: workout.workoutName as string },
      { label: 'Jour', value: longDay(session.day) },
      { label: 'Étapes', value: stepsSummary(blocks) },
      { label: 'Durée totale', value: duration(workoutSeconds(blocks)) },
      { label: 'Cible', value: 'aucune' },
    ];
    if (details?.description) fields.push({ label: 'Description', value: details.description });
    const warnings = previous
      ? [
          `Remplace l’envoi du ${shortDate(previous.at.slice(0, 10))} (prévu le ${shortDate(previous.date)}) : l’ancien workout sera supprimé de Garmin.`,
        ]
      : [];
    return {
      target: 'Garmin Connect' as const,
      fields,
      warnings,
      signed: {
        title: 'Envoyer sur la montre',
        steps,
        after: { kind: 'push' as const, sessionKey, date: session.day },
      },
    };
  }

  /**
   * Séance du plan Claude vers Garmin (D160) : course (étapes « montre » du plan, sinon plafond FC facile),
   * et renforcement (pas de rameur, D163), dans le sport choisi pour le jour. Même protocole que D126 : workout « CC · »
   * planifié au jour placé, un renvoi remplace l'ancien.
   */
  private async claudePushPreview(
    sessionKey: string,
    session: WeekSession,
    planned: PlannedSession,
    plan: PlanWeek,
  ) {
    if (session.match) throw new ActionError('Séance déjà faite');
    const today = this.deps.clock.today();
    if (!session.day || session.day < today)
      throw new ActionError('La séance n’a pas de jour à venir dans le calendrier');
    const c = await claudeSessionOf(this.deps.store, plan, planned);
    if (!c) throw new ActionError('Séance introuvable', 404);
    const variant = c.content.variants[0]!;
    if (variant.sport === 'velo')
      throw new ActionError('Une séance vélo part dans MyWhoosh, pas sur la montre');
    const cap = Number(c.athlete.fcFacileCourseMax);
    // Étapes « montre » du plan pour la séance d'origine ; une variante course reçoit le format facile du plan.
    const watch =
      variant.sport === c.raw.sport
        ? c.raw.montre
        : variant.sport === 'course' && cap > 0
          ? [
              { type: 'warmup', note: 'Échauffement (voir l’app)' },
              { type: 'run', dureeMin: variant.dureeMin, cible: { fc: [null, cap] } },
              { type: 'cooldown', dureeMin: 5 },
            ]
          : undefined;
    const workout = this.guard(() => claudeGarminWorkout({ name: variant.titre, variant, watch }));
    const previous = await this.deps.store.get<PushDoc>('ops', pushId(sessionKey), PUSH_KIND);
    const steps: Step[] = [
      { source: 'garmin', tool: 'upload_workout', args: { workout_data: workout } },
      {
        source: 'garmin',
        tool: 'schedule_workout',
        args: { calendar_date: session.day },
        useWorkoutId: true,
      },
    ];
    if (previous) {
      steps.push({
        source: 'garmin',
        tool: 'delete_workout',
        args: { workout_id: Number(previous.workoutId) },
      });
    }
    const segment = (workout.workoutSegments as { workoutSteps: unknown[] }[])[0]!;
    const fields = [
      { label: 'Nom', value: workout.workoutName as string },
      { label: 'Jour', value: longDay(session.day) },
      { label: 'Sport', value: (workout.sportType as { sportTypeKey: string }).sportTypeKey },
      { label: 'Étapes', value: `${segment.workoutSteps.length} (échauffement terminé par Tour)` },
      { label: 'Durée prévue', value: `${variant.dureeMin} min` },
    ];
    const warnings = [
      ...(previous
        ? [
            `Remplace l’envoi du ${shortDate(previous.at.slice(0, 10))} : l’ancien workout sera supprimé de Garmin.`,
          ]
        : []),
      ...(variant.sport === 'renfo'
        ? ['Exercices en étapes terminées par Tour, charges et répétitions en description.']
        : []),
    ];
    return {
      target: 'Garmin Connect' as const,
      fields,
      warnings,
      signed: {
        title: 'Envoyer sur la montre',
        steps,
        after: { kind: 'push' as const, sessionKey, date: session.day },
      },
    };
  }

  /** Séance vélo du plan Claude vers MyWhoosh (D160), via le serveur communautaire figé. */
  private async whooshPreview(sessionKey: string) {
    const { session, planned, plan } = await this.session(sessionKey);
    const c = plan && (await claudeSessionOf(this.deps.store, plan, planned));
    if (!c) throw new ActionError('Seules les séances vélo du plan Claude partent dans MyWhoosh', 409);
    const variant = c.content.variants[0]!;
    if (variant.sport !== 'velo') throw new ActionError('Cette séance n’est pas en vélo aujourd’hui', 409);
    if (session.match) throw new ActionError('Séance déjà faite');
    const day = session.day ?? c.raw.date;
    const workout = this.guard(() =>
      claudeWhooshWorkout({
        sessionKey,
        name: variant.titre,
        description: variant.corps.map((x) => [x.bloc, x.cible].filter(Boolean).join(' · ')).join(' / '),
        plan: c.raw.mywhoosh,
      }),
    );
    const wSteps = workout.WorkoutStepsArray as { Power: number; EndPower: number }[];
    const ftp = Number(c.athlete.ftpW);
    const peak = Math.max(...wSteps.map((s) => Math.max(s.Power, s.EndPower)));
    const previous = await this.deps.store.get<PushDoc>('ops', `whoosh:${pushId(sessionKey)}`, PUSH_KIND);
    return {
      target: 'MyWhoosh' as const,
      fields: [
        { label: 'Nom', value: workout.Name as string },
        { label: 'Pour le', value: longDay(day) },
        { label: 'Étapes', value: String(workout.StepCount) },
        { label: 'Durée totale', value: duration(workout.Time as number) },
        {
          label: 'Puissance max',
          value: `${Math.round(peak * 100)} % FTP${ftp > 0 ? ` (≈ ${Math.round(peak * ftp)} W)` : ''}`,
        },
      ],
      warnings: [
        ...(previous ? ['Met à jour le workout déjà envoyé (même identifiant).'] : []),
        'Passe par un accès MyWhoosh non officiel (serveur communautaire) : il peut cesser de fonctionner sans prévenir.',
      ],
      signed: {
        title: 'Envoyer dans MyWhoosh',
        steps: [{ source: 'mywhoosh' as const, tool: 'uploadCustomWorkout', args: { workouts: [workout] } }],
        after: { kind: 'whoosh' as const, sessionKey, date: day, workoutId: workout.Id as number },
      },
    };
  }

  /**
   * Import MyWhoosh → Garmin (D169) : la plus récente sortie des 21 derniers jours qui n'a pas encore été
   * importée. L'aperçu ne télécharge rien ; le fichier est relu, corrigé et envoyé à la confirmation, en mémoire.
   */
  private async whooshImportPreview() {
    const { store, clock } = this.deps;
    const listed = await this.source('mywhoosh').call<{ rides?: WhooshRide[] }>('listActivities', {
      limit: 10,
    });
    const imported = new Set(
      (await store.list<Doc & { rideId: string }>('ops', WHOOSH_IMPORT_KIND)).map((d) => d.rideId),
    );
    const since = Date.parse(clock.now()) - WHOOSH_IMPORT_DAYS * 86_400_000;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);
    const rides = (listed?.rides ?? []).filter((r) => r.id !== undefined && str(r.activityFileId));
    const startOf = (r: WhooshRide) => {
      const s = str(r.startDatetime);
      return s && Number.isFinite(Date.parse(s)) ? new Date(Date.parse(s)).toISOString() : undefined;
    };
    const ride = rides.find((r) => {
      const start = startOf(r);
      return !imported.has(String(r.id)) && (!start || Date.parse(start) >= since);
    });
    if (!ride) {
      throw new ActionError(
        rides.length
          ? 'Aucune nouvelle sortie MyWhoosh à importer (les plus récentes sont déjà dans Garmin)'
          : 'Aucune sortie trouvée dans MyWhoosh',
        409,
      );
    }
    const rideId = String(ride.id);
    const startUtc = startOf(ride);
    const local = startUtc ? parisLocal(startUtc) : undefined;
    const day = local?.slice(0, 10) ?? clock.today();
    // Doublon visible dans le cache : une activité vélo Garmin qui démarre à la même minute.
    if (local) {
      const at = Date.parse(local.replace(' ', 'T') + 'Z');
      const same = (await activities(store, day, day)).find(
        (a) =>
          /ride|cycling|bike|biking/.test(a.type) &&
          Math.abs(Date.parse(a.startLocal.replace(' ', 'T') + 'Z') - at) <= SAME_RIDE_S * 1000,
      );
      if (same) throw new ActionError('Cette sortie est déjà dans Garmin Connect', 409);
    }
    const km = num(ride.distance);
    const distance = km === undefined ? undefined : km > 500 ? km / 1000 : km;
    const name = str(ride.title) ?? str(ride.routeName) ?? 'Sortie MyWhoosh';
    return {
      target: 'Garmin Connect' as const,
      fields: [
        { label: 'Sortie', value: name },
        ...(local ? [{ label: 'Début', value: `${longDay(day)}, ${local.slice(11, 16)}` }] : []),
        ...(str(ride.rideDuration) ? [{ label: 'Durée', value: str(ride.rideDuration)! }] : []),
        ...(distance !== undefined
          ? [{ label: 'Distance', value: `${distance.toFixed(1).replace('.', ',')} km` }]
          : []),
        ...(num(ride.watt)
          ? [{ label: 'Puissance moyenne', value: `${Math.round(num(ride.watt)!)} W` }]
          : []),
        ...(num(ride.heartrate)
          ? [{ label: 'FC moyenne', value: `${Math.round(num(ride.heartrate)!)} bpm` }]
          : []),
      ],
      warnings: [
        'Le fichier FIT est téléchargé de MyWhoosh, corrigé (horodatages de fin et heure locale) et envoyé à Garmin en mémoire : aucun fichier n’est gardé.',
        'Passe par un accès MyWhoosh non officiel (serveur communautaire) : il peut cesser de fonctionner sans prévenir.',
      ],
      signed: {
        title: 'Importer la sortie MyWhoosh dans Garmin',
        steps: [],
        whooshImport: {
          rideId,
          fileId: str(ride.activityFileId)!,
          fileName: `MyWhoosh-${day}.fit`,
          ...(startUtc && { startUtc }),
        },
        after: { kind: 'whooshImport' as const, rideId, day, ...(startUtc && { startUtc }) },
      },
    };
  }

  /** Télécharge le FIT (MyWhoosh), le corrige et l'envoie (Garmin), sans rien écrire sur disque. */
  private async runWhooshImport(imp: WhooshImport, done: string[]): Promise<{ duplicate: boolean }> {
    const dl = await this.source('mywhoosh').call<{ fit?: unknown }>('downloadActivityFile', {
      fileId: imp.fileId,
    });
    if (typeof dl?.fit !== 'string' || !dl.fit)
      throw new Error('MyWhoosh n’a pas renvoyé le fichier de la sortie');
    done.push('downloadActivityFile');
    let fix;
    try {
      fix = fixMyWhooshFit(Buffer.from(dl.fit, 'base64'));
    } catch (e) {
      if (e instanceof FitError) throw new Error(`Fichier MyWhoosh illisible : ${e.message}`, { cause: e });
      throw e;
    }
    if (imp.startUtc && Math.abs(Date.parse(fix.startUtc) - Date.parse(imp.startUtc)) > 5 * 60_000) {
      throw new Error('Le fichier téléchargé ne correspond pas à la sortie de l’aperçu');
    }
    const res = await this.source('garmin').call<{
      success?: unknown;
      duplicate?: unknown;
      message?: unknown;
    }>(
      'upload_activity_fit',
      { fit_base64: Buffer.from(fix.bytes).toString('base64'), file_name: imp.fileName },
      { write: true },
    );
    if (res?.duplicate === true) return { duplicate: true };
    const failure = garmin.writeFailure(res);
    if (failure) throw new Error(failure);
    done.push('upload_activity_fit');
    return { duplicate: false };
  }

  private async annotatePreview(activityId: string, wanted: Annotation) {
    const id = Number(activityId);
    const summary = garmin.activitySummary(
      await this.source('garmin').call('get_activity', { activity_id: id }),
    );
    if (!summary) throw new ActionError('Activité introuvable dans Garmin', 404);
    const changes = annotationChanges(summary, wanted);
    const steps: Step[] = [];
    const fields = [
      { label: 'Activité', value: `${summary.name ?? activityId} · ${shortDate(summary.startLocal)}` },
    ];
    const write = (tool: string, args: Record<string, unknown>) =>
      steps.push({ source: 'garmin', tool, args: { activity_id: id, ...args } });
    if (changes.name !== undefined) {
      write('set_activity_name', { activity_name: changes.name });
      fields.push({ label: 'Nom', value: `${summary.name ?? '—'} → ${changes.name}` });
    }
    if (changes.description !== undefined) {
      write('set_activity_description', { description: changes.description });
      fields.push({ label: 'Description', value: changes.description || '(effacée)' });
    }
    if (changes.rpe !== undefined) {
      write('set_perceived_effort', { rpe: changes.rpe });
      const before = summary.rpe !== undefined ? `${summary.rpe / 10}/10` : '—';
      fields.push({ label: 'Effort perçu', value: `${before} → ${changes.rpe}/10` });
    }
    if (changes.feel !== undefined) {
      write('set_activity_feel', { feel: changes.feel });
      const before =
        summary.feel !== undefined
          ? (FEEL_LABEL[summary.feel as keyof typeof FEEL_LABEL] ?? String(summary.feel))
          : '—';
      fields.push({ label: 'Ressenti', value: `${before} → ${FEEL_LABEL[changes.feel]}` });
    }
    if (!steps.length) throw new ActionError('Rien à modifier : ce sont déjà les valeurs de Garmin', 422);
    return {
      target: 'Garmin Connect' as const,
      fields,
      warnings: [] as string[],
      signed: {
        title: 'Annoter dans Garmin',
        steps,
        after: { kind: 'annotate' as const, activityId, day: summary.startLocal.slice(0, 10) },
      },
    };
  }

  // ------------------------------------------------------------------ outils

  private async session(sessionKey: string): Promise<{
    session: WeekSession;
    planned: PlannedSession;
    weekStart: string;
    details: ReturnType<PlanWeek['details']['get']>;
    plan: PlanWeek | undefined;
  }> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionKey.slice(0, 10)))
      throw new ActionError('Séance introuvable', 404);
    const weekStart = mondayOf(sessionKey.slice(0, 10));
    const { view, plan } = await weekData(this.deps.store, weekStart, this.deps.clock.today());
    const session = view.sessions.find((s) => s.key === sessionKey);
    const planned = plan?.sessions.find((s) => s.key === sessionKey);
    if (!session || !planned) throw new ActionError('Séance introuvable', 404);
    return { session, planned, weekStart, details: plan?.details.get(planned.index), plan };
  }

  private source(name: McpName): McpCaller {
    const mcp = this.deps.mcp[name];
    const label = { garmin: 'Garmin', campus: 'Campus', mywhoosh: 'MyWhoosh' }[name];
    if (!mcp) throw new ActionError(`${label} non joignable`, 503);
    return mcp;
  }

  private guard<T>(f: () => T): T {
    try {
      return f();
    } catch (e) {
      if (e instanceof WorkoutError) throw new ActionError(e.message, 422);
      throw e;
    }
  }

  private sign(body: string): string {
    return createHmac('sha256', this.key).update(body).digest('base64url');
  }

  private verify(token: string): Signed {
    const [body = '', mac = ''] = token.split('.');
    const expected = Buffer.from(this.sign(body));
    const given = Buffer.from(mac);
    const now = Date.parse(this.deps.clock.now());
    for (const [id, exp] of this.used) if (exp < now) this.used.delete(id);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new ActionError('Aperçu invalide : refais l’aperçu', 400);
    }
    const plan = JSON.parse(Buffer.from(body, 'base64url').toString()) as Signed;
    if (plan.exp < now || this.used.has(plan.id)) {
      throw new ActionError('Aperçu expiré ou déjà utilisé : refais l’aperçu', 410);
    }
    return plan;
  }

  /** Effets côté app après une écriture réussie ; renvoie le message affiché. */
  private async after(after: After, workoutId: unknown): Promise<string> {
    const { store, sync, clock } = this.deps;
    if (after.kind === 'campus') {
      // Relire Campus tout de suite : la séance passe « faite » à l'écran.
      await sync.run('campus', 'action');
      return 'Séance validée dans Campus.';
    }
    if (after.kind === 'push') {
      await store.upsert('ops', {
        id: pushId(after.sessionKey),
        kind: PUSH_KIND,
        source: 'app',
        fetchedAt: clock.now(),
        schemaVersion: 1,
        sessionKey: after.sessionKey,
        workoutId: String(workoutId),
        date: after.date,
        at: clock.now(),
      } satisfies PushDoc);
      return `Séance envoyée dans le calendrier Garmin pour ${longDay(after.date)}. Elle arrive sur la montre à sa prochaine synchronisation.`;
    }
    if (after.kind === 'whoosh') {
      await store.upsert('ops', {
        id: `whoosh:${pushId(after.sessionKey)}`,
        kind: PUSH_KIND,
        source: 'app',
        fetchedAt: clock.now(),
        schemaVersion: 1,
        sessionKey: after.sessionKey,
        workoutId: String(after.workoutId),
        date: after.date,
        at: clock.now(),
        target: 'mywhoosh',
      });
      return 'Séance ajoutée à tes workouts personnalisés MyWhoosh (préfixe « CC · »). Elle apparaît au prochain lancement de l’app.';
    }
    if (after.kind === 'whooshImport') {
      const duplicate = (workoutId as { duplicate?: boolean } | undefined)?.duplicate === true;
      await store.upsert('ops', {
        id: `${WHOOSH_IMPORT_KIND}:${after.rideId}`,
        kind: WHOOSH_IMPORT_KIND,
        source: 'app',
        fetchedAt: clock.now(),
        schemaVersion: 1,
        rideId: after.rideId,
        day: after.day,
        ...(after.startUtc && { startUtc: after.startUtc }),
        duplicate,
        at: clock.now(),
      });
      // Garmin traite l'import en quelques secondes : la synchro le ramène et le rattache à la séance vélo.
      sync.run('garmin', 'action').catch(() => undefined);
      return duplicate
        ? 'Cette sortie était déjà dans Garmin Connect : rien n’a été ajouté.'
        : `Sortie MyWhoosh du ${longDay(after.day)} importée dans Garmin Connect. Elle apparaît dans l’app à la prochaine synchro.`;
    }
    // Le détail en cache (nom, effort, ressenti) est relu à la prochaine ouverture ; la liste des activités aussi.
    await store.delete('cache', after.activityId, pk('detail', after.day));
    sync.run('garmin', 'action').catch(() => undefined);
    return 'Activité annotée dans Garmin.';
  }

  private async log(plan: Signed, result: ActionResult, done: string[]): Promise<void> {
    const now = this.deps.clock.now();
    await this.deps.store.upsert('ops', {
      id: `${now}:action`,
      kind: 'action-log',
      source: 'app',
      fetchedAt: now,
      schemaVersion: 1,
      type: plan.type,
      title: plan.title,
      outcome: result.ok ? 'ok' : 'error',
      message: result.message,
      tools: done,
      ttl: LOG_TTL_S,
    });
  }
}
