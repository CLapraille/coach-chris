import type { PlanComparison, PlanSource, PlanSummary } from '@coach-chris/domain';
import { useState } from 'react';
import { api, useApi } from '../api.ts';
import { SPORT_LABEL, weekdayShort } from '../format.ts';
import { PlanSourceTag } from '../PlanSource.tsx';

/**
 * Plans Campus et Claude de la semaine côte à côte (D162). Le plan actif est celui du calendrier, de la montre
 * et des rapprochements ; l'autre reste en regard. Affiché seulement quand les deux existent.
 */
export function PlanCompare({ week, onChanged }: { week: string; onChanged: () => void }) {
  const res = useApi<PlanComparison>(`/plans/compare?week=${week}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (res.state !== 'ready' || !res.data.campus || !res.data.claude) return null;
  const c = res.data;

  const use = async (active: PlanSource) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/plans/${week}/source`, { method: 'PUT', body: JSON.stringify({ active }) });
      res.reload();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card pc" aria-label="Plans Campus et Claude">
      <header>
        <span className="label">Plans de la semaine</span>
        <span className="muted text-xs">un seul actif : calendrier, montre, rapprochements</span>
      </header>
      <div className="pc-cols">
        {[c.campus, c.claude].map((p) => (
          <Column key={p!.source} plan={p!} active={c.active === p!.source} busy={busy} onUse={use} />
        ))}
      </div>
      {c.differences.length > 0 && (
        <ul className="pc-diff">
          {c.differences.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
      {error && (
        <p className="text-alert" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function Column({
  plan: p,
  active,
  busy,
  onUse,
}: {
  plan: PlanSummary;
  active: boolean;
  busy: boolean;
  onUse: (s: PlanSource) => void;
}) {
  return (
    <div className={`pc-col${active ? ' on' : ''}`}>
      <div className="pc-top">
        <PlanSourceTag source={p.source} />
        {active ? (
          <span className="badge ok">Actif</span>
        ) : (
          <button className="btn small" type="button" disabled={busy} onClick={() => onUse(p.source)}>
            Utiliser ce plan
          </button>
        )}
      </div>
      <dl className="pc-stats">
        <div>
          <dt>Courses</dt>
          <dd className="num">
            {p.runCount} · {p.runMinutes} min
          </dd>
        </div>
        <div>
          <dt>Plus longue</dt>
          <dd className="num">{p.longRunMin} min</dd>
        </div>
        <div>
          <dt>Vélo</dt>
          <dd className="num">{p.bikeMinutes} min</dd>
        </div>
        <div>
          <dt>Renfo</dt>
          <dd className="num">{p.strengthCount}</dd>
        </div>
        <div>
          <dt>Intensité</dt>
          <dd className="num">{p.intenseCount}</dd>
        </div>
      </dl>
      <ol className="pc-list">
        {p.sessions.map((s, i) => (
          <li key={i}>
            <span className="faint">{s.day ? weekdayShort(s.day) : '—'}</span>
            <span>
              {s.name}
              {s.intense && <span className="pc-int"> · intensité</span>}
            </span>
            <span className="muted">
              {SPORT_LABEL[s.sport].toLowerCase()} · {s.durationMin} min
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
