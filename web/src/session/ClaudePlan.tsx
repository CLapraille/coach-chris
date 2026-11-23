import type {
  ClaudeContent,
  ClaudeContentVariant,
  ClaudeItem,
  ClaudeRoutine,
  ClaudeSport,
  SessionCheckin,
} from '@coach-chris/domain';
import { useState } from 'react';
import { api } from '../api.ts';
import { Dose, DoseText } from '../Dose.tsx';

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
export function ClaudePlan({
  content,
  checkin,
  today,
  onChanged,
}: {
  content: ClaudeContent;
  checkin?: SessionCheckin | undefined;
  today: string;
  onChanged: () => void;
}) {
  const [shown, setShown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const v = content.variants[shown] ?? content.variants[0]!;
  // Check-in de la séance (D159) : le choix du sport est enregistré ; tibia et effort une fois le jour venu.
  const save = async (patch: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/checkins/${content.date}/sessions/${content.id}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      setShown(0);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const flexible = content.role === 'flexible' && content.variants.length > 1;
  const done = today >= content.date;
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
          <span className="label">{flexible ? 'Aujourd’hui en' : 'Version'}</span>
          <div className="theme" role="radiogroup" aria-label="Sport de la séance">
            {content.variants.map((x, i) => (
              <button
                key={x.sport}
                type="button"
                role="radio"
                aria-checked={i === shown}
                disabled={busy}
                onClick={() => (flexible && i !== 0 ? void save({ swap: x.sport }) : setShown(i))}
              >
                {SPORT[x.sport]} · {x.dureeMin} min
              </button>
            ))}
          </div>
        </div>
      )}
      <Variant v={v} />
      {done && (
        <div className="cl-log">
          <span className="label">Après la séance</span>
          {v.sport === 'course' && (
            <Score
              label="Tibia /10"
              value={checkin?.shin}
              disabled={busy}
              onChange={(n) => void save({ shin: n })}
            />
          )}
          <Score
            label="Effort ressenti /10"
            value={checkin?.rpe}
            disabled={busy}
            onChange={(n) => void save({ rpe: n })}
          />
          {checkin?.shin !== undefined && checkin.shin > 3 && (
            <span className="warn">Tibia au-dessus de 3/10 : on en tient compte à la revue du dimanche.</span>
          )}
        </div>
      )}
      {error && (
        <p className="text-alert" role="alert">
          {error}
        </p>
      )}
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
        {v.kinomap && (
          <p className="cl-note">
            Kinomap · <DoseText text={v.kinomap} />
          </p>
        )}
      </div>
      {v.cooldown && <Routine label="Après" r={v.cooldown} />}
    </div>
  );
}

function Item({ c }: { c: ClaudeItem }) {
  if (c.bloc)
    return (
      <li className="cl-bloc">
        <b>
          <DoseText text={c.bloc} />
        </b>
        {c.cible && <span className="cl-target">{c.cible}</span>}
        {c.consigne && (
          <span className="cl-hint">
            <DoseText text={c.consigne} />
          </span>
        )}
      </li>
    );
  return (
    <li>
      <span className="cl-name">{c.exo}</span>
      {(c.charge || c.reps) && (
        <span className="cl-q">
          {c.charge}
          {c.charge && c.reps && ' · '}
          {c.reps && <Dose>{c.reps}</Dose>}
        </span>
      )}
      {c.consigne && (
        <span className="cl-hint">
          <DoseText text={c.consigne} />
        </span>
      )}
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
            {(st.duree || st.reps) && <Dose className="cl-q">{st.duree ?? st.reps}</Dose>}
            {st.consigne && (
              <span className="cl-hint">
                <DoseText text={st.consigne} />
              </span>
            )}
          </li>
        ))}
      </ol>
      {r.adaptations && r.adaptations.length > 0 && (
        <ul className="cl-adapt">
          {r.adaptations.map((a) => (
            <li key={a.si}>
              <b>{a.si} :</b> <DoseText text={a.alors} />
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function Score({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number | undefined;
  disabled: boolean;
  onChange: (n: number | null) => void;
}) {
  return (
    <label className="cl-score">
      {label}
      <select
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      >
        <option value="">–</option>
        {Array.from({ length: 11 }, (_, n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}
