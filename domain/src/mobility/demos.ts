/**
 * Démonstrations des exercices de renforcement et de mobilité (D167) : animation du mannequin (D80) quand une
 * figure existe, et toujours un lien de recherche vidéo. Le lien est une recherche, pas une vidéo choisie :
 * Claude ne regarde pas les vidéos et ne peut pas en garantir une.
 */

/** Nom d'exercice (plan Claude ou bibliothèque) → code de la figure animée, du plus précis au plus général. */
const FIGURES: [RegExp, string][] = [
  [/fente (statique|arrière)|fentes? marchées?/, 'X1'],
  [/squat/, 'X2'],
  [/soulevé de terre roumain/, 'X3'],
  [/^mont[ée]+s? (de )?mollet.*genou fléchi/, 'X4'],
  [/^mont[ée]+s? (de )?mollet|descente lente sur une marche/, 'C6'],
  [/montées? sur (les )?pointes/, 'X5'],
  [/relevés? (du )?tibial/, 'X6'],
  [/pont fessier unipodal|pont fessier sur une jambe/, 'X7'],
  [/pont fessier/, 'H9'],
  [/planche latérale/, 'X8'],
  [/dead bug/, 'X9'],
  [/bird dog/, 'X10'],
  [/glissement nerveux.*assis/, 'X11'],
  [/glissement nerveux.*allongé/, 'X12'],
  [/marche latérale/, 'X13'],
  [/montées de genoux|genoux hauts/, 'X14'],
  [/respiration ventrale/, 'X15'],
  [/genou au mur/, 'C1'],
  [/balancier.*latéra/, 'H12'],
  [/balancier/, 'H11'],
  [/mollet et soléaire/, 'C2'],
  [/soléaire/, 'C3'],
  [/étirement (du )?mollet|mollet jambe tendue/, 'C2'],
  [/fléchisseur de hanche|fente basse/, 'H2'],
  [/balle sous le pied/, 'P4'],
  [/quadriceps/, 'G1'],
  [/^chat-vache$/, 'T1'],
  [/90\/90/, 'H1'],
  [/pied court/, 'P3'],
  [/équilibre (unipodal|sur une jambe)/, 'C5'],
  [/écarter les orteils/, 'P2'],
  [/gros orteil/, 'P1'],
  [/orteils retournés/, 'P5'],
  [/clamshell/, 'H10'],
  [/pigeon/, 'H5'],
  [/couch stretch/, 'H3'],
  [/essuie-glace/, 'H4'],
  [/grenouille/, 'H6'],
  [/fente latérale/, 'H7'],
  [/cercles de hanche/, 'H8'],
  [/cercles de cheville/, 'C4'],
  [/glissés de talon/, 'G2'],
  [/ischios.*sangle/, 'G3'],
  [/charnière de hanche/, 'G4'],
  [/livre ouvert/, 'T2'],
  [/jambes au mur/, 'R1'],
];

/** Figures dessinées pour le plan Claude (D167), listées dans la bibliothèque de démonstrations. */
export const PLAN_FIGURES: { code: string; name: string }[] = [
  { code: 'X1', name: 'Fente (statique, arrière, marchée)' },
  { code: 'X2', name: 'Squat poids du corps' },
  { code: 'X3', name: 'Soulevé de terre roumain sur une jambe' },
  { code: 'X4', name: 'Montée mollet genou fléchi (soléaire)' },
  { code: 'X5', name: 'Montées sur pointes' },
  { code: 'X6', name: 'Relevés tibial dos au mur' },
  { code: 'X7', name: 'Pont fessier sur une jambe' },
  { code: 'X8', name: 'Planche latérale' },
  { code: 'X9', name: 'Dead bug' },
  { code: 'X10', name: 'Bird dog' },
  { code: 'X11', name: 'Glissement nerveux sciatique assis' },
  { code: 'X12', name: 'Glissement nerveux sciatique allongé' },
  { code: 'X13', name: 'Marche latérale élastique' },
  { code: 'X14', name: 'Montées de genoux sur place' },
  { code: 'X15', name: 'Respiration ventrale' },
];

/** Étapes d'échauffement cardio (marche, course, vélo, rameur) : pas des exercices à démontrer. */
const NOT_AN_EXERCISE =
  /^(marche( rapide)?|course.*|pédalage.*|rame.*|palier|accélérations|montée progressive)$/i;

export interface ExerciseDemo {
  /** Figure animée du mannequin, si l'exercice en a une. */
  figure?: string;
  /** Recherche YouTube de l'exercice (toujours présente). */
  videoUrl: string;
}

/** Démonstration d'un exercice ; `null` pour une étape cardio (marche, course, vélo, rameur). */
export function demoFor(name: string, code?: string): ExerciseDemo | null {
  const n = name.trim();
  if (!n || NOT_AN_EXERCISE.test(n)) return null;
  const key = n.toLowerCase();
  const figure = code ?? FIGURES.find(([re]) => re.test(key))?.[1];
  const query = `${n} exercice`;
  return {
    ...(figure && { figure }),
    videoUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
  };
}
