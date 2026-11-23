import { exercise, type RoutineItemView } from '@coach-chris/domain';
import { useEffect, useRef, useState } from 'react';
import { Dose } from '../Dose.tsx';
import { mmss } from '../format.ts';
import { Figure } from './Figure.tsx';

interface Step {
  code: string;
  name: string;
  text: string;
  seconds: number;
  side?: string;
}

/** Un exercice par côté devient deux étapes (côté droit puis gauche). */
function steps(items: RoutineItemView[]): Step[] {
  return items.flatMap((it) => {
    const base = { code: it.code, name: it.name, text: exercise(it.code).instruction, seconds: it.durationS };
    return it.perSide
      ? [
          { ...base, side: 'Côté droit' },
          { ...base, side: 'Côté gauche' },
        ]
      : [base];
  });
}

/**
 * Mode guidé plein écran (D76) : compte à rebours, sans passage automatique ;
 * « Valider » fait passer à l'exercice suivant, et la routine est cochée à la fin.
 */
export function Guide({
  title,
  items,
  onDone,
  onClose,
}: {
  title: string;
  items: RoutineItemView[];
  onDone: () => void;
  onClose: () => void;
}) {
  const seq = steps(items);
  const [idx, setIdx] = useState(0);
  const [left, setLeft] = useState(seq[0]?.seconds ?? 0);
  const [paused, setPaused] = useState(false);
  const next = useRef<HTMLButtonElement>(null);
  const step = seq[idx]!;
  const last = idx === seq.length - 1;

  useEffect(() => {
    if (paused || left <= 0) return;
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left, paused]);

  useEffect(() => {
    next.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const advance = () => {
    if (last) return onDone();
    setIdx(idx + 1);
    setLeft(seq[idx + 1]!.seconds);
    setPaused(false);
  };

  return (
    <div className="guide" role="dialog" aria-modal="true" aria-label={title}>
      <div className="g-top">
        <span>{title}</span>
        <div className="g-steps" aria-hidden="true">
          {seq.map((_, i) => (
            <i key={i} className={i < idx ? 'done' : i === idx ? 'now' : ''} />
          ))}
        </div>
        <button className="btn small" type="button" onClick={onClose}>
          Quitter
        </button>
      </div>
      <div className="g-body">
        <span className="label">
          Exercice {idx + 1} / {seq.length}
        </span>
        <Figure key={`${idx}`} code={step.code} label={`Démonstration : ${step.name}`} className="g-fig" />
        <h2>{step.name}</h2>
        <p>{step.text}</p>
        <div className={`g-timer${left === 0 ? ' over' : ''}`} role="timer" aria-live="off">
          {left > 0 ? <Dose>{mmss(left)}</Dose> : 'Terminé'}
        </div>
        {step.side && <span className="g-side">{step.side}</span>}
      </div>
      <div className="g-bottom">
        <button className="btn" type="button" onClick={() => setPaused(!paused)}>
          {paused ? 'Reprendre' : 'Pause'}
        </button>
        <button ref={next} className="btn primary" type="button" onClick={advance}>
          {last ? 'Valider et terminer' : 'Valider'}
        </button>
      </div>
    </div>
  );
}
