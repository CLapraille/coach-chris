import type { Signal, TodayView } from '@coach-chris/domain';

type CheckState = 'ok' | 'warn' | 'none';

/** Ce que CoachChris surveille, et où chaque point en est ; une donnée absente reste « pas de donnée ». */
function checks(t: TodayView): { label: string; state: CheckState; text: string }[] {
  const weekly = t.form.night?.hrvPosition?.weekly;
  const cap = t.volume.cap.run;
  const offPlan = t.week.offPlan.length;
  return [
    {
      label: 'VFC moyenne 7 nuits',
      ...(!weekly || weekly === 'unknown'
        ? { state: 'none', text: 'pas de donnée' }
        : weekly === 'below'
          ? { state: 'warn', text: 'sous la plage' }
          : { state: 'ok', text: 'dans la plage' }),
    },
    {
      label: 'Volume course',
      ...(!cap
        ? { state: 'none', text: 'pas encore de repère' }
        : cap.status === 'over'
          ? { state: 'warn', text: 'prévu au-dessus du repère' }
          : { state: 'ok', text: 'sous le repère' }),
    },
    {
      label: 'Placement des séances',
      ...(!t.week.plan
        ? { state: 'none', text: 'pas de plan' }
        : t.week.warnings.length
          ? {
              state: 'warn',
              text: t.week.warnings.length > 1 ? `${t.week.warnings.length} règles` : '1 règle',
            }
          : { state: 'ok', text: 'règles respectées' }),
    },
    {
      label: 'Activités hors plan',
      ...(offPlan ? { state: 'warn', text: `${offPlan} cette semaine` } : { state: 'ok', text: 'aucune' }),
    },
  ] as { label: string; state: CheckState; text: string }[];
}

const MARK: Record<CheckState, string> = { ok: '✓', warn: '!', none: '—' };

export function SignalsCard({ signals, today }: { signals: Signal[]; today: TodayView }) {
  return (
    <article className="card s5 sig-card">
      <header>
        <span className="label">Signaux</span>
        <span className="src calc">Calculé</span>
      </header>
      {signals.length ? (
        <div className="insights">
          {signals.map((s) => (
            <div key={s.id} className={`ins ${s.level}`}>
              <div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                <details>
                  <summary>Règle</summary>
                  {s.rule}
                </details>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty">Rien à signaler.</p>
      )}
      <section className="sig-checks" aria-label="Points surveillés">
        <span className="label">Surveillé</span>
        <ul>
          {checks(today).map((c) => (
            <li key={c.label} className={c.state}>
              <i aria-hidden="true">{MARK[c.state]}</i>
              <span>{c.label}</span>
              <small>{c.text}</small>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
