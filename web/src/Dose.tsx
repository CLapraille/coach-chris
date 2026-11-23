import type { ReactNode } from 'react';

/**
 * Répétitions et durées d'exercice dans une couleur propre (D166) : « 3 × 8 », « 2 × 30 s », « 10 / côté »,
 * « Circuit × 2 tours », « 45 s », « 4′ ». Les charges (« 2 × 8 kg »), allures (« 6:50 /km »), cibles FC ou
 * puissance et distances ne sont pas des doses : elles restent dans la couleur du texte.
 */
// Unité suivie d'aucune lettre : « 3 s » oui, « 3 séances » non (\b ignore les lettres accentuées).
const UNIT = String.raw`(?:min|mn|sec|s|h)(?![\p{L}\d])`;
const PER = String.raw`(?:\s*\/\s*(?:côté|jambe|pied|sens|bras))*`;
const NUM = String.raw`\d+(?:[.,]\d+)?`;
const RANGE = String.raw`${NUM}(?:\s*[–-]\s*${NUM})?`;
export const DOSE_RE = new RegExp(
  [
    // 3 × 8, 2 × 30 s, 10 × 5 s / pied, 4 × ( — jamais une charge (2 × 8 kg).
    String.raw`\d+\s*[×x]\s*(?:\(|${RANGE}(?![\d.,]*\s*kg)(?:\s*${UNIT}|[′'″])?${PER})`,
    // × 2 tours, 3 séries, 12 répétitions, 2 fois
    String.raw`(?:[×x]\s*)?\d+\s*(?:tours?|séries?|reps?|répétitions?|fois)(?![\p{L}\d])`,
    // 30 s, 2–3 min, 45 s / côté, 1 min / pied
    String.raw`${RANGE}\s*${UNIT}${PER}`,
    // 4′, 1′30, 30″
    String.raw`\d+[′'″]\d*`,
    // 10 / côté, 15–20 / jambe, 8 / sens / côté
    String.raw`${RANGE}\s*\/\s*(?:côté|jambe|pied|sens|bras)${PER}`,
  ].join('|'),
  'giu',
);

/** Découpe un texte en morceaux ordinaires et doses. */
export function doseParts(text: string): { text: string; dose: boolean }[] {
  const out: { text: string; dose: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(DOSE_RE)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), dose: false });
    out.push({ text: m[0], dose: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), dose: false });
  return out;
}

/** Texte libre (consigne, bloc, note) avec ses doses colorées. */
export function DoseText({ text }: { text: string }) {
  return (
    <>
      {doseParts(text).map((p, i) =>
        p.dose ? (
          <span key={i} className="dose">
            {p.text}
          </span>
        ) : (
          p.text
        ),
      )}
    </>
  );
}

/** Valeur qui est entièrement une dose (champ répétitions ou durée d'un exercice). */
export function Dose({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={className ? `dose ${className}` : 'dose'}>{children}</span>;
}
