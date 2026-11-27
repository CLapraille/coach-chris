/** Moteur du mannequin (mannequin.js) : démonstration animée d'un exercice de la bibliothèque dans un SVG. */
declare const Mannequin: {
  /**
   * Anime l'exercice dans le SVG ; l'animation s'arrête d'elle-même quand le SVG quitte la page.
   * `auto` (défaut) : pose fixe si l'appareil demande moins d'animations ; `play` : toujours animé (D181) ;
   * `still` : pose fixe.
   */
  mount(svg: SVGSVGElement, code: string, mode?: 'auto' | 'play' | 'still'): boolean;
  has(code: string): boolean;
  /** L'appareil demande moins d'animations (prefers-reduced-motion). */
  reducedMotion(): boolean;
  codes: string[];
};
export default Mannequin;
