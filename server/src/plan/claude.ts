import {
  addDays,
  CLAUDE_PLAN_FORMAT,
  DEFAULT_SETTINGS,
  planProblems,
  seasonProblems,
  type ClaudeBlock,
  type ClaudePlanFile,
  type ClaudeRoutine,
  type ClaudeWeek,
  type PlanImportResult,
  type PlanSource,
  type SeasonEvent,
  type SeasonFile,
  type SeasonImportResult,
  type SeasonSettings,
} from '@coach-chris/domain';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Doc, Store } from '../store/store.ts';

/**
 * Import d'un plan rédigé par Claude (D153) et de la saison de courses (D154).
 * Écritures internes à Cosmos uniquement : rien n'est envoyé à Garmin ni à Campus.
 */

const SCHEMA = 1;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sport = z.enum(['course', 'velo', 'rameur', 'renfo', 'mobilite']);
const step = z.object({
  name: z.string().min(1),
  duree: z.string().optional(),
  reps: z.string().optional(),
  consigne: z.string().optional(),
});
const item = z.object({
  bloc: z.string().optional(),
  exo: z.string().optional(),
  cible: z.string().optional(),
  charge: z.string().optional(),
  reps: z.string().optional(),
  consigne: z.string().optional(),
});
const variant = z.object({
  titre: z.string().min(1),
  dureeMin: z.number().int().positive().max(600),
  echauffement: z.string().nullish(),
  retourAuCalme: z.string().nullish(),
  corps: z.array(item),
  kinomap: z.string().optional(),
});

export const claudePlanSchema = z.object({
  format: z.literal(CLAUDE_PLAN_FORMAT),
  source: z.literal('claude'),
  generatedAt: day,
  note: z.string().optional(),
  athlete: z.record(z.string(), z.unknown()).optional(),
  block: z.object({
    id: z.string().min(1),
    phase: z.string().min(1),
    name: z.string().min(1),
    start: day,
    end: day,
    objectif: z.string().optional(),
    rules: z.record(z.string(), z.unknown()).optional(),
  }),
  routines: z.record(
    z.string(),
    z.object({
      name: z.string().min(1),
      dureeMin: z.number().positive(),
      quand: z.string().optional(),
      steps: z.array(step).optional(),
      base: z.array(z.string()).optional(),
      adaptations: z.array(z.object({ si: z.string(), alors: z.string() })).optional(),
    }),
  ),
  weeks: z
    .array(
      z.object({
        index: z.number().int().positive(),
        start: day,
        focus: z.string().optional(),
        volumeCourseMin: z.number().optional(),
        routineMatin: z
          .object({ remplace: z.record(z.string(), z.string()), pourquoi: z.string().optional() })
          .optional(),
        sessions: z.array(
          variant.extend({
            id: z.string().regex(/^[\w-]+$/, 'identifiant : lettres, chiffres, - et _'),
            date: day,
            sport,
            role: z.enum(['fixe', 'cle', 'flexible', 'optionnelle']),
            pourquoi: z.string().optional(),
            alternatives: z.partialRecord(sport, variant).optional(),
            montre: z.unknown().optional(),
            mywhoosh: z.unknown().optional(),
          }),
        ),
      }),
    )
    .min(1),
});

export const seasonEventSchema = z.object({
  id: z.string().regex(/^[\w-]+$/),
  name: z.string().min(1),
  date: day,
  dateConfirmed: z.boolean(),
  dateLabel: z.string().optional(),
  place: z.string(),
  country: z.string(),
  url: z.url().optional(),
  terrain: z.enum(['route', 'trail']),
  priority: z.enum(['A', 'B', 'C']),
  options: z.array(z.object({ km: z.number().positive(), dPlus: z.number().nonnegative().optional() })),
  chosen: z.number().int().nonnegative().optional(),
  series: z.string().optional(),
  note: z.string().optional(),
});

export const seasonSchema = z.object({
  format: z.literal('coach-chris.season/v1'),
  season: z.string().min(1),
  events: z.array(seasonEventSchema),
});

export class ImportError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Import refusé :\n- ${problems.join('\n- ')}`);
    this.problems = problems;
  }
}

function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const r = schema.safeParse(raw);
  if (!r.success) {
    throw new ImportError(r.error.issues.map((i) => `${i.path.join('.') || '(racine)'} : ${i.message}`));
  }
  return r.data;
}

/** Semaine du plan Claude telle que stockée : partition `weekDate` du conteneur `plan`, id `claude`. */
export type ClaudePlanDoc = Doc & {
  kind: 'claude';
  weekDate: string;
  hash: string;
  block: ClaudeBlock;
  week: ClaudeWeek;
  /** Seulement les routines citées par la semaine. */
  routines: Record<string, ClaudeRoutine>;
  /** Repères de l'athlète du plan (FC max, plafond FC facile, FTP…), D160. */
  athlete?: Record<string, unknown>;
};

/** Source qui alimente une semaine : partition `weekDate`, id `source`. Absent = Campus. */
export type PlanSourceDoc = Doc & { kind: 'source'; weekDate: string; active: PlanSource };

export const CLAUDE_ID = 'claude';
export const SOURCE_ID = 'source';

export type ImportResult = PlanImportResult;

const hashOf = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

function routinesOf(week: ClaudeWeek, all: Record<string, ClaudeRoutine>): Record<string, ClaudeRoutine> {
  const ids = new Set<string>(['routine-bureau', 'routine-matin']);
  for (const s of week.sessions) {
    for (const v of [s, ...Object.values(s.alternatives ?? {})]) {
      if (v?.echauffement) ids.add(v.echauffement);
      if (v?.retourAuCalme) ids.add(v.retourAuCalme);
    }
  }
  return Object.fromEntries([...ids].filter((id) => all[id]).map((id) => [id, all[id]!]));
}

/**
 * Importe un plan Claude semaine par semaine. Comme pour Campus (D45), chaque contenu différent est archivé
 * en version, jamais écrasé. `activate` (par défaut) fait de Claude la source active de ces semaines ;
 * sinon le plan est gardé à côté, pour la comparaison avec Campus (étape 5). `dryRun` valide et décrit
 * ce que ferait l'import sans rien écrire (aperçu de l'import depuis l'app, D164).
 */
export async function importPlan(
  store: Store,
  raw: unknown,
  opts: { now: string; activate?: boolean; dryRun?: boolean },
): Promise<ImportResult> {
  const plan = parse(claudePlanSchema, raw) as ClaudePlanFile;
  const problems = planProblems(plan);
  if (problems.length) throw new ImportError(problems);
  const activate = opts.activate ?? true;
  const base = (id: string) => ({ id, source: 'app' as const, fetchedAt: opts.now, schemaVersion: SCHEMA });

  const weeks: ImportResult['weeks'] = [];
  for (const week of plan.weeks) {
    const weekDate = week.start;
    const routines = routinesOf(week, plan.routines);
    const hash = hashOf({ block: plan.block, week, routines, athlete: plan.athlete });
    const latest = await store.get<ClaudePlanDoc>('plan', CLAUDE_ID, weekDate);
    const content = {
      kind: 'claude' as const,
      weekDate,
      hash,
      block: plan.block,
      week,
      routines,
      ...(plan.athlete && { athlete: plan.athlete }),
    };
    const changed = latest?.hash !== hash;
    const current = await store.get<PlanSourceDoc>('plan', SOURCE_ID, weekDate);
    const active: PlanSource = activate ? 'claude' : (current?.active ?? 'campus');
    if (!opts.dryRun) {
      if (changed)
        await store.upsert('plan', { ...base(`claude-v:${opts.now}`), ...content, kind: 'claude-version' });
      await store.upsert('plan', { ...base(CLAUDE_ID), ...content });
      if (activate) await store.upsert('plan', { ...base(SOURCE_ID), kind: 'source', weekDate, active });
    }
    weeks.push({ weekDate, changed, active, sessions: week.sessions.length });
  }
  const { id, name, start, end } = plan.block;
  return { block: id, blockName: name, start, end, weeks };
}

/** Rend une semaine à Campus (le plan Claude reste stocké). */
export async function setWeekSource(store: Store, weekDate: string, active: PlanSource, now: string) {
  await store.upsert('plan', {
    id: SOURCE_ID,
    source: 'app',
    fetchedAt: now,
    schemaVersion: SCHEMA,
    kind: 'source',
    weekDate,
    active,
  });
}

/** Lundis couverts par un intervalle, pour les lectures par semaine. */
export function mondaysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 7)) out.push(d);
  return out;
}

/** Saison et réglages : partition `season` du conteneur `user`. */
export const SEASON_KIND = 'season';
export type SeasonDoc = Doc & { kind: typeof SEASON_KIND; file: SeasonFile };
export type SettingsDoc = Doc & { kind: typeof SEASON_KIND; settings: SeasonSettings };

export async function importSeason(
  store: Store,
  raw: unknown,
  now: string,
  opts: { dryRun?: boolean } = {},
): Promise<SeasonImportResult> {
  const file = parse(seasonSchema, raw) as SeasonFile;
  const problems = seasonProblems(file);
  if (problems.length) throw new ImportError(problems);
  const result = {
    season: file.season,
    events: file.events.length,
    replaces: (await readSeason(store))?.events.length ?? 0,
  };
  if (opts.dryRun) return result;
  await store.upsert('user', {
    id: 'events',
    source: 'app',
    fetchedAt: now,
    schemaVersion: SCHEMA,
    kind: SEASON_KIND,
    file,
  });
  return result;
}

export async function readSeason(store: Store): Promise<SeasonFile | undefined> {
  return (await store.get<SeasonDoc>('user', 'events', SEASON_KIND))?.file;
}

/** « Les Boucles Ardennaises », 2027 → « les-boucles-ardennaises-2027 ». */
function slug(name: string, date: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${base || 'course'}-${date.slice(0, 4)}`;
}

/**
 * Ajout ou modification d'une course à la main (D165) : même validation qu'un import de saison ; sans saison
 * enregistrée, une saison est créée à l'année de la course. Sans `id`, un identifiant lisible est créé.
 */
export async function saveEvent(store: Store, raw: unknown, now: string, id?: string): Promise<SeasonEvent> {
  const r = seasonEventSchema.omit({ id: true }).safeParse(raw);
  if (!r.success) {
    throw new ImportError(r.error.issues.map((i) => `${i.path.join('.') || '(racine)'} : ${i.message}`));
  }
  const current = await readSeason(store);
  const events = current?.events ?? [];
  if (id && !events.some((e) => e.id === id)) throw new ImportError([`course « ${id} » introuvable`]);
  let newId = id ?? slug(r.data.name, r.data.date);
  for (let n = 2; !id && events.some((e) => e.id === newId); n++)
    newId = `${slug(r.data.name, r.data.date)}-${n}`;
  const event = { ...r.data, id: newId } as SeasonEvent;
  const file: SeasonFile = {
    format: 'coach-chris.season/v1',
    season: current?.season ?? r.data.date.slice(0, 4),
    events: id ? events.map((e) => (e.id === id ? event : e)) : [...events, event],
  };
  const problems = seasonProblems(file);
  if (problems.length) throw new ImportError(problems);
  await writeSeason(store, file, now);
  return event;
}

export async function deleteEvent(store: Store, id: string, now: string): Promise<boolean> {
  const current = await readSeason(store);
  if (!current?.events.some((e) => e.id === id)) return false;
  await writeSeason(store, { ...current, events: current.events.filter((e) => e.id !== id) }, now);
  return true;
}

async function writeSeason(store: Store, file: SeasonFile, now: string): Promise<void> {
  await store.upsert('user', {
    id: 'events',
    source: 'app',
    fetchedAt: now,
    schemaVersion: SCHEMA,
    kind: SEASON_KIND,
    file,
  });
}

export async function readSettings(store: Store): Promise<SeasonSettings> {
  const d = await store.get<SettingsDoc>('user', 'settings', SEASON_KIND);
  return { ...DEFAULT_SETTINGS, ...d?.settings };
}

export async function saveSettings(store: Store, settings: SeasonSettings, now: string): Promise<void> {
  await store.upsert('user', {
    id: 'settings',
    source: 'app',
    fetchedAt: now,
    schemaVersion: SCHEMA,
    kind: SEASON_KIND,
    settings,
  });
}
