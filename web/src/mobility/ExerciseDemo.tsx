import { demoFor } from '@coach-chris/domain';
import { useState } from 'react';
import { Figure } from './Figure.tsx';

/**
 * Bouton « Démo » à côté d'un exercice (D167) : ouvre l'animation du mannequin quand elle existe et un lien
 * vers des vidéos de l'exercice. Rien pour une étape cardio (marche, course, vélo, rameur).
 */
export function ExerciseDemo({ name, code }: { name: string; code?: string }) {
  const [open, setOpen] = useState(false);
  const demo = demoFor(name, code);
  if (!demo) return null;
  return (
    <>
      <button
        className="demo-btn"
        type="button"
        aria-expanded={open}
        aria-label={`${open ? 'Masquer' : 'Voir'} la démo : ${name}`}
        onClick={() => setOpen(!open)}
      >
        {open ? '▾ Démo' : '▸ Démo'}
      </button>
      {open && (
        <span className="demo-pop">
          {demo.figure ? (
            <Figure code={demo.figure} label={`Démonstration : ${name}`} className="demo-fig" />
          ) : (
            <span className="faint">Pas encore d'animation pour cet exercice.</span>
          )}
          <VideoLink url={demo.videoUrl} />
        </span>
      )}
    </>
  );
}

/** Recherche de vidéos de l'exercice (YouTube), dans un nouvel onglet. */
export function VideoLink({ url }: { url: string }) {
  return (
    <a className="demo-video" href={url} target="_blank" rel="noreferrer">
      ▶ Voir en vidéo
    </a>
  );
}
