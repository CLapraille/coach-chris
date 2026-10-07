import { exercise, totalS, ZONE_EXERCISES, type Exercise } from './library.ts';
import { STATUS_RANK, type ZoneAssessment } from './tests.ts';

export interface RoutineItem {
  code: string;
  /** Règle qui a choisi l'exercice, affichée sous l'exercice (D75, D78). */
  reason: string;
}

/** Durée maximale de la routine du soir, socle + créneau du jour (D78). */
export const EVENING_MAX_S = 8 * 60;
const SOCLE_SIZE = 3;
/** Le socle reste accessible tous les soirs du bloc : pas de niveau 3 (sa version douce est prise à la place). */
const SOCLE_MAX_LEVEL = 2;

const usable = (e: Exercise, maxLevel: number) => !e.categories.includes('strength') && e.level <= maxLevel;

/**
 * Socle d'un bloc de 2 semaines (D78) : 3 exercices sur 1 à 3 zones, en commençant par la zone au statut le plus bas.
 * Une zone « bonne » n'est jamais travaillée. Si moins de 3 zones sont à travailler, la zone la plus faible reçoit un 2e exercice.
 */
export function chooseSocle(zones: ZoneAssessment[]): RoutineItem[] {
  const toWork = zones
    .filter((z) => z.status !== 'good')
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
  const picked: RoutineItem[] = [];
  for (let round = 0; picked.length < SOCLE_SIZE && round < 3; round++) {
    for (const z of toWork.slice(0, 3)) {
      if (picked.length === SOCLE_SIZE) break;
      const code = ZONE_EXERCISES[z.zone].filter((c) => usable(exercise(c), SOCLE_MAX_LEVEL))[round];
      if (code && !picked.some((p) => p.code === code)) picked.push({ code, reason: z.reason });
    }
  }
  return picked;
}

/** Contexte du jour pour le créneau variable (D78, règles du créneau du jour). */
export interface DayContext {
  /** Renforcement bas du corps fait aujourd'hui. */
  legsStrengthToday: boolean;
  runToday: boolean;
  /** Séance intense ou longue demain. */
  intenseTomorrow: boolean;
  /** Aucune séance aujourd'hui. */
  restDay: boolean;
}

const GENTLE = ['R1', 'P4', 'C3', 'G3'];

/**
 * Créneau du jour (~2 min) : un exercice choisi selon le contexte, sans doublon avec le socle,
 * jamais de renforcement, jamais de niveau 3 la veille d'une intensité, total ≤ 8:00.
 */
export function chooseDailySlot(
  socle: RoutineItem[],
  ctx: DayContext,
  priorityZones: ZoneAssessment[],
): RoutineItem | null {
  const options: [string[], string][] = [];
  if (ctx.intenseTomorrow) options.push([GENTLE, 'routine douce : séance intense demain']);
  if (ctx.legsStrengthToday)
    options.push([['G1', 'C2', 'C3', 'H2', 'H3'], "après le renforcement jambes d'aujourd'hui"]);
  if (ctx.runToday) options.push([['C3', 'H2', 'P4', 'R1'], "après la course d'aujourd'hui"]);
  const worst = [...priorityZones].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])[0];
  if (worst && worst.status !== 'good')
    options.push([
      ZONE_EXERCISES[worst.zone],
      ctx.restDay ? `jour de repos : ${worst.reason}` : worst.reason,
    ]);
  options.push([GENTLE, 'retour au calme']);

  const used = socle.reduce((s, i) => s + totalS(exercise(i.code)), 0);
  const maxLevel = ctx.intenseTomorrow ? 1 : 2;
  for (const [codes, reason] of options) {
    const code = codes.find((c) => {
      const e = exercise(c);
      return usable(e, maxLevel) && !socle.some((i) => i.code === c) && used + totalS(e) <= EVENING_MAX_S;
    });
    if (code) return { code, reason };
  }
  return null;
}
