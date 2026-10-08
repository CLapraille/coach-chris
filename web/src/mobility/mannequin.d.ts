/** Moteur du mannequin (mannequin.js) : démonstration animée d'un exercice de la bibliothèque dans un SVG. */
declare const Mannequin: {
  /** Anime l'exercice dans le SVG ; l'animation s'arrête d'elle-même quand le SVG quitte la page. */
  mount(svg: SVGSVGElement, code: string): boolean;
  has(code: string): boolean;
  codes: string[];
};
export default Mannequin;
