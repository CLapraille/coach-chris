import { useEffect, useRef } from 'react';
import Mannequin from './mannequin.js';

/** Démonstration animée d'un exercice ; rien n'est affiché pour un exercice sans figure. */
export function Figure({ code, label, className }: { code: string; label: string; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current) Mannequin.mount(ref.current, code);
  }, [code]);
  if (!Mannequin.has(code)) return null;
  return <svg ref={ref} className={className} role="img" aria-label={label} />;
}
