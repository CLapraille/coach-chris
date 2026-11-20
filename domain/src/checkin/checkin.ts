import type { ClaudeSport } from '../plan/claude.ts';

/**
 * Check-ins (D159) : douleur du pied au premier pas chaque matin, et après chaque séance du plan Claude
 * la tension du tibia (course), l'effort ressenti et le sport choisi pour la séance flexible.
 * Échelle 0–10. Règle de douleur du bloc : ≤ 3/10 pendant l'effort et revenue à la normale le lendemain.
 */
export interface SessionCheckin {
  shin?: number;
  rpe?: number;
  /** Sport choisi le jour même pour la séance flexible (échange). */
  swap?: ClaudeSport;
}

export interface CheckinDay {
  /** AAAA-MM-JJ */
  date: string;
  foot?: number;
  /** Par identifiant de séance du plan (stable d'un import à l'autre). */
  sessions?: Record<string, SessionCheckin>;
}

/** Seuil de la règle de douleur : au-delà, la séance se raccourcit ou s'échange (D159). */
export const PAIN_LIMIT = 3;

export type PainZone = 'ok' | 'warn' | 'alert';

/** ≤ 3 : vert ; 4–5 : prudence ; ≥ 6 : stop. */
export function painZone(n: number): PainZone {
  return n <= PAIN_LIMIT ? 'ok' : n <= 5 ? 'warn' : 'alert';
}

/**
 * Le pied du matin à 3/10 ou plus fait proposer d'abord le vélo ou le rameur pour la séance flexible
 * (décision du 20/11 : l'échange reste toujours le choix de l'utilisateur).
 */
export function suggestLowImpact(foot: number | undefined): boolean {
  return foot !== undefined && foot >= PAIN_LIMIT;
}

/** Sports choisis pour les séances flexibles, par identifiant de séance, à partir des check-ins. */
export function swapsOf(days: CheckinDay[]): Record<string, ClaudeSport> {
  const out: Record<string, ClaudeSport> = {};
  for (const d of days) {
    for (const [id, s] of Object.entries(d.sessions ?? {})) if (s.swap) out[id] = s.swap;
  }
  return out;
}
