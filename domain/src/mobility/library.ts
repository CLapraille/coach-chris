/** Bibliothèque de mobilité v1.0, validée le 2026-10-06 (D79). Source rédactionnelle : mobility-library.md. */

export type Category = 'mobility' | 'activation' | 'recovery' | 'strength';
export type ExerciseType = 'static' | 'dynamic' | 'control';
export type ZoneId =
  'ankle' | 'hip-rotation' | 'hip-flexors' | 'big-toe' | 'foot-ankle-control' | 'hip-knee-control';

export interface Exercise {
  code: string;
  name: string;
  categories: Category[];
  type: ExerciseType;
  level: 1 | 2 | 3;
  /** Durée d'une exécution ; doublée si `perSide`. */
  durationS: number;
  perSide: boolean;
  instruction: string;
  precautions?: string;
}

const ex = (
  code: string,
  name: string,
  categories: Category[],
  type: ExerciseType,
  level: 1 | 2 | 3,
  durationS: number,
  perSide: boolean,
  instruction: string,
  precautions?: string,
): Exercise => ({
  code,
  name,
  categories,
  type,
  level,
  durationS,
  perSide,
  instruction,
  ...(precautions && { precautions }),
});

/** Routine du matin, fixe (§24) : jamais générée ni adaptée. */
// prettier-ignore
export const MORNING: Exercise[] = [
  ex('M1', 'Claps devant / derrière', ['activation'], 'dynamic', 1, 60, false, 'Bras tendus, clap devant le corps puis derrière le dos.'),
  ex('M2', 'Balancement des bras', ['activation'], 'dynamic', 1, 60, false, "Bras tendus, un bras monte pendant que l'autre descend, puis inverse."),
  ex('M3', 'Genoux hauts + ouverture des bras', ['activation'], 'dynamic', 1, 60, false, 'Genou haut, mains qui touchent le genou ; pied au sol, bras ouverts à 90°, cage thoracique ouverte. Alterner.'),
  ex('M4', 'Rotation du buste', ['activation'], 'dynamic', 1, 60, false, 'Bras tendus devant, rotations du buste droite / gauche.'),
];

// prettier-ignore
export const EXERCISES: Exercise[] = [
  ex('H1', 'Hanche 90/90, transitions', ['mobility'], 'dynamic', 1, 120, false, "Assis, jambes pliées à 90° devant et sur le côté. Basculer les genoux de l'autre côté, lentement, buste droit. Mains au sol si besoin.", "Rester dans une amplitude sans pincement à l'aine."),
  ex('H2', 'Fente basse, fléchisseurs de hanche', ['mobility'], 'static', 1, 60, true, 'Genou arrière au sol (coussin), bassin rentré, avancer doucement le bassin. Bras du côté du genou levé au-dessus de la tête.', "Ne pas cambrer le bas du dos ; c'est le bassin qui avance."),
  ex('H3', 'Couch stretch', ['mobility'], 'static', 2, 60, true, 'Genou arrière contre un mur ou un canapé, tibia vertical contre le support, autre pied devant. Redresser le buste progressivement.', 'Intense ; commencer buste penché en avant. Coussin sous le genou.'),
  ex('H4', 'Essuie-glaces assis', ['mobility'], 'dynamic', 1, 60, false, "Assis, mains derrière, pieds écartés à largeur d'épaules. Laisser tomber les deux genoux d'un côté puis de l'autre, lentement."),
  ex('H5', 'Pigeon modifié', ['mobility', 'recovery'], 'static', 2, 60, true, 'Jambe avant pliée devant soi (au sol ou sur un lit), jambe arrière tendue. Buste droit puis penché vers l’avant.', 'Genou avant sans douleur ; sinon version allongée sur le dos (cheville croisée sur le genou).'),
  ex('H6', 'Grenouille', ['mobility'], 'static', 2, 60, false, 'À quatre pattes, écarter les genoux, tibias parallèles. Reculer doucement le bassin vers les talons.', 'Coussins sous les genoux ; amplitude modeste au début.'),
  ex('H7', 'Fente latérale assistée', ['mobility'], 'dynamic', 2, 60, false, "Pieds très écartés, fléchir un genou en gardant l'autre jambe tendue, puis passer de l'autre côté. Mains sur une chaise si besoin.", 'Talon de la jambe pliée au sol.'),
  ex('H8', 'Cercles de hanche à quatre pattes', ['activation'], 'control', 1, 60, false, "À quatre pattes, dessiner un grand cercle lent avec le genou (avant, côté, arrière). 3 dans chaque sens, puis l'autre jambe.", 'Dos immobile.'),
  ex('H9', 'Pont fessier', ['activation'], 'control', 1, 60, false, 'Allongé, pieds au sol, monter le bassin en serrant les fessiers, tenir 2 s, redescendre lentement.', 'Pas de cambrure ; sensation dans les fessiers, pas dans le dos.'),
  ex('H10', 'Clamshell', ['activation'], 'control', 1, 60, true, 'Sur le côté, genoux pliés, pieds joints. Ouvrir le genou du dessus sans rouler le bassin.'),
  ex('H11', 'Balanciers de jambe avant / arrière', ['mobility'], 'dynamic', 1, 60, true, "Main sur un mur, balancer la jambe tendue d'avant en arrière, amplitude croissante.", "Rester grand, ne pas forcer en fin d'amplitude."),
  ex('H12', 'Balanciers de jambe latéraux', ['mobility'], 'dynamic', 1, 60, true, 'Face au mur, balancer la jambe devant soi de gauche à droite.'),
  ex('P1', 'Extension du gros orteil', ['mobility'], 'static', 1, 60, true, 'Debout face à un mur, gros orteil relevé contre le mur, talon au sol. Avancer doucement le genou.', "Sans douleur à l'articulation."),
  ex('P2', 'Écarter les orteils', ['activation'], 'control', 1, 60, false, 'Pied à plat, écarter les orteils au maximum, tenir 3 s, relâcher. Puis lever le gros orteil seul, puis les quatre autres seuls.'),
  ex('P3', 'Pied court', ['activation'], 'control', 2, 60, true, 'Pied à plat, rapprocher la tête du gros orteil du talon sans plier les orteils (la voûte monte). Tenir 5 s.', 'Ne pas crisper les orteils.'),
  ex('P4', 'Balle sous le pied', ['recovery'], 'dynamic', 1, 60, true, 'Assis ou debout, rouler une balle sous le pied, du talon aux orteils, pression modérée.', 'Pression supportable ; éviter en cas de douleur vive au talon.'),
  ex('P5', 'Assis sur les orteils retournés', ['mobility'], 'static', 3, 45, false, "À genoux, orteils retournés au sol, s'asseoir progressivement vers les talons. Mains au sol pour doser.", 'Intense ; commencer par 20 s, mains au sol.'),
  ex('C1', 'Genou au mur, dynamique', ['mobility'], 'dynamic', 1, 60, true, 'Pied à quelques cm du mur, talon au sol, amener le genou toucher le mur puis revenir. Reculer le pied si c’est facile.', "Talon toujours au sol ; pas de pincement à l'avant de la cheville."),
  ex('C2', 'Mollet jambe tendue', ['mobility', 'recovery'], 'static', 1, 60, true, 'Mains au mur, jambe arrière tendue, talon au sol, pied droit. Avancer le bassin.'),
  ex('C3', 'Soléaire genou plié', ['mobility', 'recovery'], 'static', 1, 60, true, 'Même position que C2, mais fléchir le genou arrière en gardant le talon au sol.', "Pas d'étirement fort en cas de douleur au tendon d'Achille."),
  ex('C4', 'Cercles de cheville', ['activation'], 'control', 1, 60, false, "Pied en l'air, dessiner de grands cercles lents avec la pointe du pied, 5 dans chaque sens, puis l'autre pied."),
  ex('C5', 'Équilibre sur une jambe', ['activation'], 'control', 1, 60, true, 'Debout sur une jambe, genou légèrement fléchi, 30 s yeux ouverts puis 30 s yeux fermés.', "Près d'un mur."),
  ex('C6', 'Descente lente sur une marche', ['strength'], 'control', 2, 180, false, 'Sur la pointe des pieds au bord d’une marche, descendre lentement le talon sous la marche sur une jambe (3 s), remonter avec les deux.', 'À ne pas ajouter de soi-même pendant le plan de reprise : Campus programme déjà le renforcement.'),
  ex('G1', 'Quadriceps debout', ['recovery'], 'static', 1, 60, true, 'Debout, attraper la cheville derrière soi, genoux serrés, bassin rentré.', 'Appui sur un mur.'),
  ex('G2', 'Glissés de talon', ['mobility'], 'dynamic', 1, 60, false, 'Allongé, faire glisser le talon vers les fesses puis tendre la jambe, lentement.'),
  ex('G3', 'Ischios allongé avec sangle', ['mobility', 'recovery'], 'static', 1, 60, true, "Allongé, sangle ou serviette sous le pied, monter la jambe tendue jusqu'à une tension modérée. L'autre jambe reste au sol.", 'Tension modérée, jamais de douleur derrière le genou.'),
  ex('G4', 'Charnière de hanche avec bâton', ['activation'], 'control', 1, 60, false, 'Bâton le long du dos (tête, haut du dos, sacrum). Pencher le buste en reculant les fesses, genoux légèrement fléchis, sans perdre le contact.'),
  ex('T1', 'Chat-vache', ['mobility'], 'dynamic', 1, 60, false, 'À quatre pattes, arrondir le dos en expirant, puis le creuser en inspirant, lentement.'),
  ex('T2', 'Livre ouvert', ['mobility'], 'dynamic', 1, 60, true, "Allongé sur le côté, genoux pliés, bras tendus devant. Ouvrir le bras du dessus vers l'autre côté en suivant la main des yeux.", 'Genoux restent collés.'),
  ex('R1', 'Jambes au mur', ['recovery'], 'static', 1, 120, false, 'Allongé, fesses près du mur, jambes posées contre le mur. Respirer lentement.'),
];

export const byCode = new Map([...MORNING, ...EXERCISES].map((e) => [e.code, e]));

export function exercise(code: string): Exercise {
  const e = byCode.get(code);
  if (!e) throw new Error(`Exercice inconnu : ${code}`);
  return e;
}

/** Durée totale d'un exercice dans une routine (les deux côtés si nécessaire). */
export const totalS = (e: Exercise) => e.durationS * (e.perSide ? 2 : 1);

/** Exercices travaillant chaque zone de test, du plus simple au plus exigeant. */
export const ZONE_EXERCISES: Record<ZoneId, string[]> = {
  ankle: ['C1', 'C3', 'C2'],
  'hip-flexors': ['H2', 'H3'],
  'hip-rotation': ['H1', 'H4', 'H5'],
  'big-toe': ['P1', 'P5'],
  'foot-ankle-control': ['C5', 'P3', 'P2'],
  'hip-knee-control': ['H10', 'H9', 'H8'],
};
