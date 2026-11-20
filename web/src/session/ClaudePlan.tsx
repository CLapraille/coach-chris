import type {
  ClaudeContent,
  ClaudeContentVariant,
  ClaudeItem,
  ClaudeRoutine,
  ClaudeSport,
} from '@coach-chris/domain';
import { useState } from 'react';

const SPORT: Record<ClaudeSport, string> = {
  course: 'Course',
  velo: 'Vélo',
  rameur: 'Rameur',
  renfo: 'Renforcement',
  mobilite: 'Mobilité',
};
const COLOR: Record<ClaudeSport, string> = {
  course: 'var(--run)',
  velo: 'var(--bike)',
  rameur: 'var(--src-garmin)',
  renfo: 'var(--strength)',
  mobilite: 'var(--mobility)',
};

/**
 * Contenu d'une séance du plan Claude (D156) : pourquoi, échauffement, corps de séance, retour au calme.
 * La séance flexible montre ses autres sports possibles ; le choix enregistré du jour arrivera avec les check-ins.
 */
export function ClaudePlan({ content }: { content: ClaudeContent }) {
  const [shown, setShown] = useState(0);
  const v = content.variants[shown] ?? content.variants[0]!;
  return (
    <section
      className="card cl-plan"
      aria-label="Contenu de la séance"
      style={{ '--c': COLOR[v.sport] } as React.CSSProperties}
    >
      <header>
        <span className="label">Contenu de la séance</span>
        <span className="src claude">Plan Claude</span>
      </header>
      {content.pourquoi && <p className="cl-why">{content.pourquoi}</p>}
      {content.variants.length > 1 && (
        <div className="cl-swap">
          <span className="label">Version</span>
          <div className="theme" role="radiogroup" aria-label="Sport de la séance">
            {content.variants.map((x, i) => (
              <button
                key={x.sport}
                type="button"
                role="radio"
                aria-checked={i === shown}
                onClick={() => setShown(i)}
              >
                {SPORT[x.sport]} · {x.dureeMin} min
              </button>
            ))}
          </div>
        </div>
      )}
      <Variant v={v} />
    </section>
  );
}

function Variant({ v }: { v: ClaudeContentVariant }) {
  return (
    <div className="cl-phases">
      {v.warmup && <Routine label="Avant" r={v.warmup} />}
      <div className="cl-phase">
        <h4 className="label">Corps de séance · {v.dureeMin} min</h4>
        <ul className="cl-items">
          {v.corps.map((c, i) => (
            <Item key={i} c={c} />
          ))}
        </ul>
        {v.kinomap && <p className="cl-note">Kinomap · {v.kinomap}</p>}
      </div>
      {v.cooldown && <Routine label="Après" r={v.cooldown} />}
    </div>
  );
}

function Item({ c }: { c: ClaudeItem }) {
  if (c.bloc)
    return (
      <li className="cl-bloc">
        <b>{c.bloc}</b>
        {c.cible && <span className="cl-target">{c.cible}</span>}
        {c.consigne && <span className="cl-hint">{c.consigne}</span>}
      </li>
    );
  return (
    <li>
      <span className="cl-name">{c.exo}</span>
      {(c.charge || c.reps) && <span className="cl-q">{[c.charge, c.reps].filter(Boolean).join(' · ')}</span>}
      {c.consigne && <span className="cl-hint">{c.consigne}</span>}
    </li>
  );
}

function Routine({ label, r }: { label: string; r: ClaudeRoutine }) {
  return (
    <details className="cl-phase" open>
      <summary>
        <span className="label">
          {label} · {r.name} · {r.dureeMin} min
        </span>
      </summary>
      <ol className="cl-items">
        {(r.steps ?? []).map((st, i) => (
          <li key={i}>
            <span className="cl-name">{st.name}</span>
            {(st.duree || st.reps) && <span className="cl-q">{st.duree ?? st.reps}</span>}
            {st.consigne && <span className="cl-hint">{st.consigne}</span>}
          </li>
        ))}
      </ol>
      {r.adaptations && r.adaptations.length > 0 && (
        <ul className="cl-adapt">
          {r.adaptations.map((a) => (
            <li key={a.si}>
              <b>{a.si} :</b> {a.alors}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
