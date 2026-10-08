import type { Side, TestResults } from '@coach-chris/domain';

/** Les 6 auto-tests (D74, mobility-library.md) : protocole, repère et zone, tels que dans la bibliothèque validée. */
export interface TestDef {
  key: keyof TestResults;
  code: string;
  name: string;
  how: string;
  benchmark: string;
  zone: string;
  input: { kind: 'number'; unit: string; max: number } | { kind: 'choice'; options: [string, string][] };
}

export const TESTS: TestDef[] = [
  {
    key: 'kneeToWallCm',
    code: 'T-1',
    name: 'Genou au mur',
    how: 'Distance max orteil-mur, talon au sol, genou qui touche le mur.',
    benchmark: '≥ 10 cm, écart D/G < 2',
    zone: 'Cheville',
    input: { kind: 'number', unit: 'cm', max: 30 },
  },
  {
    key: 'hipInternalRotationDeg',
    code: 'T-2',
    name: 'Rotation interne de hanche',
    how: "Assis au bord d'une table, faire pivoter le pied vers l'extérieur ; estimer l'angle (photo).",
    benchmark: '35–45°, symétrique',
    zone: 'Hanche',
    input: { kind: 'number', unit: '°', max: 90 },
  },
  {
    key: 'thomas',
    code: 'T-3',
    name: 'Thomas modifié',
    how: 'Allongé au bord du lit, un genou ramené : où est la cuisse pendante ?',
    benchmark: "au niveau ou sous l'horizontale",
    zone: 'Hanche (avant)',
    input: {
      kind: 'choice',
      options: [
        ['above', 'au-dessus'],
        ['level', 'au niveau'],
        ['below', 'en dessous'],
      ],
    },
  },
  {
    key: 'bigToeExtensionDeg',
    code: 'T-4',
    name: 'Extension du gros orteil',
    how: "Debout, relever le gros orteil à la main ; estimer l'angle (photo).",
    benchmark: '≈ 60° ou plus',
    zone: 'Pied',
    input: { kind: 'number', unit: '°', max: 120 },
  },
  {
    key: 'balanceEyesClosedS',
    code: 'T-5',
    name: 'Équilibre yeux fermés',
    how: 'Sur une jambe, yeux fermés : secondes tenues (30 au maximum).',
    benchmark: '≥ 20 s, symétrique',
    zone: 'Cheville / pied',
    input: { kind: 'number', unit: 's', max: 30 },
  },
  {
    key: 'singleLegSquat',
    code: 'T-6',
    name: 'Squat sur une jambe',
    how: "5 répétitions devant un miroir : le genou reste-t-il dans l'axe ?",
    benchmark: "genou dans l'axe",
    zone: 'Hanche / genou',
    input: {
      kind: 'choice',
      options: [
        ['yes', 'oui'],
        ['sometimes', 'parfois'],
        ['no', 'non'],
      ],
    },
  },
];

/** Résultat lisible : « 11 / 9 cm » (gauche / droite) ou « au-dessus / au niveau ». */
export function formatResult(def: TestDef, value: Side<number | string>): string {
  if (def.input.kind === 'number')
    return `${value.left} / ${value.right} ${def.input.unit}`.replace(' °', '°');
  const label = Object.fromEntries(def.input.options);
  return `${label[String(value.left)]} / ${label[String(value.right)]}`;
}
