import type { ZoneId } from './library.ts';

/** Statut d'une zone (mobility-library.md, auto-tests). Ordre : du plus préoccupant au meilleur. */
export type ZoneStatus = 'priority' | 'weak' | 'watch' | 'good';
export const STATUS_RANK: Record<ZoneStatus, number> = { priority: 0, weak: 1, watch: 2, good: 3 };

export type Side<T> = { left: T; right: T };

/** Résultats des 6 auto-tests (D74). Chaque test est facultatif : un test non fait ne donne pas de statut. */
export interface TestResults {
  /** T-1 Genou au mur : distance orteil-mur en cm. */
  kneeToWallCm?: Side<number>;
  /** T-2 Rotation interne de hanche assis, en degrés. */
  hipInternalRotationDeg?: Side<number>;
  /** T-3 Thomas modifié : position de la cuisse pendante par rapport à l'horizontale. */
  thomas?: Side<'above' | 'level' | 'below'>;
  /** T-4 Extension du gros orteil, en degrés. */
  bigToeExtensionDeg?: Side<number>;
  /** T-5 Équilibre unipodal yeux fermés, en secondes (max 30). */
  balanceEyesClosedS?: Side<number>;
  /** T-6 Squat sur une jambe : le genou reste dans l'axe ? */
  singleLegSquat?: Side<'yes' | 'sometimes' | 'no'>;
}

/**
 * Repères indicatifs (mobility-library.md) et seuils de « à surveiller », à ajuster ensemble :
 * proche du repère = au moins 80 % du repère ; asymétrie modérée = écart droite / gauche au-delà du seuil.
 */
const NUMERIC: [keyof TestResults, ZoneId, number, number][] = [
  ['kneeToWallCm', 'ankle', 10, 2],
  ['hipInternalRotationDeg', 'hip-rotation', 35, 5],
  ['bigToeExtensionDeg', 'big-toe', 60, 10],
  ['balanceEyesClosedS', 'foot-ankle-control', 20, 5],
];
const NEAR = 0.8;

export interface ZoneAssessment {
  zone: ZoneId;
  status: ZoneStatus;
  /** Explication affichée (« test genou au mur : 7 cm »). */
  reason: string;
}

function numericStatus(v: Side<number>, benchmark: number, asymLimit: number): ZoneStatus {
  const worst = Math.min(v.left, v.right);
  const asym = Math.abs(v.left - v.right);
  if (worst < benchmark * NEAR) return 'weak';
  if (worst < benchmark || asym >= asymLimit) return 'watch';
  return 'good';
}

const worstOf = (a: ZoneStatus, b: ZoneStatus) => (STATUS_RANK[a] <= STATUS_RANK[b] ? a : b);

/**
 * Statut de chaque zone testée. Une zone faible devient « priorité » si elle fait partie
 * des limitations déclarées (D37 : hanche et pied).
 */
export function assessZones(r: TestResults, declared: ReadonlySet<ZoneId>): ZoneAssessment[] {
  const out: ZoneAssessment[] = [];
  const push = (zone: ZoneId, status: ZoneStatus, reason: string) =>
    out.push({ zone, status: status === 'weak' && declared.has(zone) ? 'priority' : status, reason });

  for (const [key, zone, benchmark, asym] of NUMERIC) {
    const v = r[key] as Side<number> | undefined;
    if (!v) continue;
    push(
      zone,
      numericStatus(v, benchmark, asym),
      `${label[key]} : G ${v.left} / D ${v.right} (repère ${benchmark})`,
    );
  }
  if (r.thomas) {
    const s = (x: 'above' | 'level' | 'below'): ZoneStatus => (x === 'above' ? 'weak' : 'good');
    push(
      'hip-flexors',
      worstOf(s(r.thomas.left), s(r.thomas.right)),
      `Thomas : G ${fr[r.thomas.left]} / D ${fr[r.thomas.right]}`,
    );
  }
  if (r.singleLegSquat) {
    const s = (x: 'yes' | 'sometimes' | 'no'): ZoneStatus =>
      x === 'yes' ? 'good' : x === 'sometimes' ? 'watch' : 'weak';
    push(
      'hip-knee-control',
      worstOf(s(r.singleLegSquat.left), s(r.singleLegSquat.right)),
      `Squat 1 jambe, genou dans l'axe : G ${fr[r.singleLegSquat.left]} / D ${fr[r.singleLegSquat.right]}`,
    );
  }
  return out;
}

const label: Partial<Record<keyof TestResults, string>> = {
  kneeToWallCm: 'Genou au mur (cm)',
  hipInternalRotationDeg: 'Rotation interne de hanche (°)',
  bigToeExtensionDeg: 'Extension du gros orteil (°)',
  balanceEyesClosedS: 'Équilibre yeux fermés (s)',
};
const fr: Record<string, string> = {
  above: 'au-dessus',
  level: 'au niveau',
  below: 'en dessous',
  yes: 'oui',
  sometimes: 'parfois',
  no: 'non',
};

/** Limitations déclarées au départ (D37) : hanche et pied. */
export const DECLARED_ZONES: ReadonlySet<ZoneId> = new Set<ZoneId>([
  'hip-rotation',
  'hip-flexors',
  'big-toe',
  'foot-ankle-control',
]);

export const ZONE_LABEL: Record<ZoneId, string> = {
  'hip-rotation': 'Hanche · rotation interne',
  'hip-flexors': 'Hanche · fléchisseurs',
  'big-toe': 'Pied · gros orteil',
  'foot-ankle-control': 'Cheville et pied · équilibre',
  ankle: 'Cheville · flexion dorsale',
  'hip-knee-control': 'Hanche et genou · contrôle',
};

/** Test qui renseigne chaque zone (D74). */
export const ZONE_TEST: Record<ZoneId, keyof TestResults> = {
  ankle: 'kneeToWallCm',
  'hip-rotation': 'hipInternalRotationDeg',
  'hip-flexors': 'thomas',
  'big-toe': 'bigToeExtensionDeg',
  'foot-ankle-control': 'balanceEyesClosedS',
  'hip-knee-control': 'singleLegSquat',
};
