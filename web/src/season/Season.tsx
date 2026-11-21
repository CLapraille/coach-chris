import type { FlexDefault, SeasonEventView, SeasonView } from '@coach-chris/domain';
import { useState } from 'react';
import { api, useApi } from '../api.ts';
import { Loading } from '../Loading.tsx';
import { decimal } from '../format.ts';
import { ImportCard } from './Import.tsx';

const PRIORITY_LABEL = { A: 'Objectif', B: 'Important', C: 'Entraînement' } as const;
const FLEX_LABEL: Record<FlexDefault, string> = { velo: 'Vélo', course: 'Course' };

const civil = (day: string) => new Date(`${day}T12:00:00Z`);
const monthOf = (day: string) =>
  civil(day).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayMonth = (day: string) =>
  civil(day).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/** « 21 km D+600 » ; `null` quand la distance n'est pas encore choisie. */
function distance(o: { km: number; dPlus?: number }): string {
  return `${decimal(o.km, o.km % 1 ? 1 : 0)} km${o.dPlus ? ` D+${o.dPlus}` : ''}`;
}

function countdown(days: number): string {
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'demain';
  if (days < 0) return 'passée';
  return days < 60 ? `dans ${days} jours` : `dans ${Math.round(days / 7)} semaines`;
}

/** Saison de courses (D154) : les événements importés, la prochaine course A et le réglage de la séance flexible. */
export function Season() {
  const season = useApi<SeasonView>('/season');
  if (season.state === 'loading') return <Loading />;
  if (season.state === 'error')
    return (
      <p className="empty" role="alert">
        {season.error.message}
      </p>
    );
  const v = season.data;
  const nextA = v.events.find((e) => e.id === v.nextA);
  const upcoming = v.events.filter((e) => !e.past);
  const next = upcoming[0];

  return (
    <section className="season-screen" aria-labelledby="season-title">
      <div className="head">
        <div>
          <h1 id="season-title">Saison{v.season ? ` ${v.season}` : ''}</h1>
          <div className="sub">
            {next
              ? `Prochaine course : ${next.name}, ${countdown(next.daysUntil)}`
              : 'Aucune course à venir.'}
          </div>
        </div>
        <span className="src claude">Plan Claude</span>
      </div>
      <div className="grid">
        <article className="card s7" aria-label="Objectif principal">
          <header>
            <span className="label">Prochain objectif</span>
            {nextA?.series && <span className="pri pri-A">{nextA.series}</span>}
          </header>
          {nextA ? (
            <div className="sn-goal">
              <div>
                <h3>{nextA.name}</h3>
                <div className="muted">
                  {dayMonth(nextA.date)} · {nextA.place}
                  {nextA.chosen !== undefined && ` · ${distance(nextA.options[nextA.chosen]!)}`}
                </div>
              </div>
              <div className="sn-count">
                <b className="num">{nextA.daysUntil}</b>
                <span>jours</span>
              </div>
            </div>
          ) : (
            <p className="empty">Aucune course A importée.</p>
          )}
        </article>
        <Settings initial={v.settings.flexDefault} onSaved={season.reload} />
        <article className="card s12" aria-label="Calendrier des courses">
          <header>
            <span className="label">Courses retenues · {v.events.length}</span>
            <span className="muted text-xs">A objectif · B important · C entraînement</span>
          </header>
          {v.events.length === 0 ? (
            <p className="empty">Pas encore de saison. Importe le fichier de saison ci-dessous.</p>
          ) : (
            <EventList events={v.events} />
          )}
        </article>
        <ImportCard onImported={season.reload} />
      </div>
    </section>
  );
}

function Settings({ initial, onSaved }: { initial: FlexDefault; onSaved: () => void }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const choose = async (f: FlexDefault) => {
    const before = value;
    setValue(f);
    setError(null);
    try {
      await api('/season/settings', { method: 'PUT', body: JSON.stringify({ flexDefault: f }) });
      onSaved();
    } catch (e) {
      setValue(before);
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <article className="card s5" aria-label="Semaine type">
      <header>
        <span className="label">Semaine type</span>
        <span className="muted text-xs">2 courses fixes + 1 flexible</span>
      </header>
      <div className="sn-setting">
        <span>3e séance par défaut</span>
        <div className="theme" role="radiogroup" aria-label="Sport par défaut de la séance flexible">
          {(['velo', 'course'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={value === f}
              onClick={() => void choose(f)}
            >
              {FLEX_LABEL[f]}
            </button>
          ))}
        </div>
      </div>
      <p className="empty">
        La séance flexible du plan s'affiche dans ce sport. Tu peux toujours la faire autrement le jour même
        (vélo, course ou rameur).
      </p>
      {error && (
        <p className="text-alert" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

function EventList({ events }: { events: SeasonEventView[] }) {
  const byId = new Map(events.map((e) => [e.id, e]));
  const months: { month: string; items: SeasonEventView[] }[] = [];
  for (const e of events) {
    const m = monthOf(e.date);
    const last = months.at(-1);
    if (last?.month === m) last.items.push(e);
    else months.push({ month: m, items: [e] });
  }
  return (
    <div className="sn-list">
      {months.map(({ month, items }) => (
        <section key={month} aria-label={month}>
          <h4 className="label">{month}</h4>
          <ol>
            {items.map((e) => (
              <li key={e.id} className={`sn-ev${e.past ? ' past' : ''}`}>
                <div className="sn-date">
                  <span className="num">
                    {e.dateConfirmed ? dayMonth(e.date) : (e.dateLabel ?? dayMonth(e.date))}
                  </span>
                  {!e.dateConfirmed && <span className="faint">à confirmer</span>}
                </div>
                <div className="sn-main">
                  <div className="sn-name">
                    <span className={`pri pri-${e.priority}`} title={PRIORITY_LABEL[e.priority]}>
                      {e.priority}
                    </span>
                    {e.url ? (
                      <a href={e.url} target="_blank" rel="noreferrer">
                        {e.name}
                      </a>
                    ) : (
                      e.name
                    )}
                    {e.series && <span className="faint"> · {e.series}</span>}
                  </div>
                  <div className="muted">
                    {e.place} · {e.country} · {e.terrain === 'trail' ? 'trail' : 'route'}
                  </div>
                  {e.note && <div className="faint">{e.note}</div>}
                  {e.closeTo.length > 0 && !e.past && (
                    <div className="warn">
                      ⚠ À moins de 14 jours de {e.closeTo.map((id) => byId.get(id)?.name ?? id).join(', ')}
                    </div>
                  )}
                </div>
                <div className="sn-opts">
                  {e.options.map((o, i) => (
                    <span key={i} className={`sn-opt${i === e.chosen ? ' on' : ''}`}>
                      {distance(o)}
                    </span>
                  ))}
                </div>
                <div className="sn-when muted">{countdown(e.daysUntil)}</div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
