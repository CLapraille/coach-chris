import { useEffect, useRef, useState } from 'react';
import Mannequin from './mannequin.js';

/**
 * Démonstration animée d'un exercice ; rien n'est affiché pour un exercice sans figure. Si l'appareil demande
 * moins d'animations (économiseur de batterie, accessibilité), la pose reste fixe et « Animer » lance le
 * mouvement à la demande (D181) : ici l'animation est l'information, pas une décoration.
 */
export function Figure({ code, label, className }: { code: string; label: string; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [reduced] = useState(() => Mannequin.reducedMotion());
  const [playing, setPlaying] = useState(!reduced);
  useEffect(() => {
    if (ref.current) Mannequin.mount(ref.current, code, playing ? 'play' : 'still');
  }, [code, playing]);
  if (!Mannequin.has(code)) return null;
  const svg = <svg ref={ref} className={className} role="img" aria-label={label} />;
  if (!reduced) return svg;
  return (
    <span className="fig-wrap">
      {svg}
      <button
        type="button"
        className="btn small fig-play"
        aria-pressed={playing}
        onClick={() => setPlaying(!playing)}
      >
        {playing ? '⏸ Pause' : '▶ Animer'}
      </button>
    </span>
  );
}
