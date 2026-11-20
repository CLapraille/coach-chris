import { VERDICT_LABEL, type FlexDefault, type ReviewView } from '@coach-chris/domain';
import { useState } from 'react';
import { api, useApi } from '../api.ts';
import { shortDate } from '../format.ts';

const VERDICT_CLASS = { progress: 'ok', hold: 'warn', 'step-back': 'alert' } as const;
const FLEX_LABEL: Record<FlexDefault, string> = { velo: 'Vélo', course: 'Course' };

/**
 * Revue du dimanche (D161) : la proposition des règles (progresser, tenir, alléger), ses raisons et les durées
 * de course de la semaine suivante, retouchables. Rien ne change dans le plan avant « Accepter ».
 * Visible du samedi au lundi, ou tant que la revue n'est pas acceptée.
 */
export function ReviewCard({ today, onChanged }: { today: string; onChanged: () => void }) {
  const res = useApi<ReviewView>('/review');
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [flex, setFlex] = useState<FlexDefault | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (res.state !== 'ready' || !res.data.proposal) return null;
  const { proposal: p, accepted, week, nextWeek } = res.data;
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  if (accepted && ![6, 0, 1].includes(dow)) return null;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      res.reload();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const accept = () =>
    run(() =>
      api(`/review/${week}/accept`, {
        method: 'POST',
        body: JSON.stringify({
          ...(Object.keys(durations).length && { durations }),
          ...(flex && { flex }),
        }),
      }),
    );
  const cancel = () => run(() => api(`/review/${week}`, { method: 'DELETE' }));
  const chosenFlex = accepted?.flex ?? flex ?? p.flex;
  const pain = [
    p.pain.footMax !== null && `pied max ${p.pain.footMax}/10 (${p.pain.footDays} matins notés)`,
    p.pain.shinMax !== null && `tibia max ${p.pain.shinMax}/10`,
  ].filter(Boolean);

  return (
    <article className="card s12 review" aria-label="Revue de la semaine">
      <header>
        <span className="label">
          Revue de la semaine du {shortDate(week)} · pour la semaine du {shortDate(nextWeek)}
        </span>
        <span className="src calc">Règles</span>
      </header>
      <div className="rv-head">
        <span className={`badge ${VERDICT_CLASS[p.verdict]}`}>{VERDICT_LABEL[p.verdict]}</span>
        <span className="muted">
          Séances fixes {p.completion.fixedDone}/{p.completion.fixedTotal} · course {p.volume.actual} min →{' '}
          {p.volume.proposedNext} min
          {p.volume.acwrNext !== null && ` · charge ×${p.volume.acwrNext.toFixed(2)}`}
          {pain.length > 0 && ` · ${pain.join(' · ')}`}
        </span>
      </div>
      <ul className="rv-reasons">
        {p.reasons.map((r, i) => (
          <li key={i} className={r.level}>
            {r.text}
          </li>
        ))}
      </ul>
      {Object.keys(p.adjustments).length > 0 && (
        <div className="rv-adj">
          <span className="label">Durées proposées</span>
          {Object.entries(p.adjustments).map(([id, a]) => (
            <label key={id}>
              <span className="muted">{id}</span>
              <span className="faint">{a.from} →</span>
              <input
                id={`rv-${id}`}
                type="number"
                min={10}
                max={300}
                step={5}
                disabled={!!accepted || busy}
                value={accepted?.durations[id] ?? durations[id] ?? a.to}
                onChange={(e) => setDurations({ ...durations, [id]: Number(e.target.value) })}
              />
              <span className="muted">min</span>
            </label>
          ))}
        </div>
      )}
      <div className="sn-setting">
        <span>Séance flexible de la semaine</span>
        <div className="theme" role="radiogroup" aria-label="Sport de la séance flexible la semaine suivante">
          {(['velo', 'course'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={chosenFlex === f}
              disabled={!!accepted || busy}
              onClick={() => setFlex(f)}
            >
              {FLEX_LABEL[f]}
            </button>
          ))}
        </div>
      </div>
      <div className="nx-acts">
        {accepted ? (
          <>
            <span className="ok">
              ✓ Acceptée le {shortDate(accepted.acceptedAt.slice(0, 10))} : la semaine suivante est ajustée.
            </span>
            <button className="linkbtn" type="button" disabled={busy} onClick={() => void cancel()}>
              Annuler
            </button>
          </>
        ) : (
          <button className="btn primary small" type="button" disabled={busy} onClick={() => void accept()}>
            Accepter pour la semaine du {shortDate(nextWeek)}
          </button>
        )}
      </div>
      {error && (
        <p className="text-alert" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
