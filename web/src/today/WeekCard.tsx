import type { RoutineItemView, WeekView } from '@coach-chris/domain';
import { SPORT_COLOR, sessionLabel, weekdayShort } from '../format.ts';

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function WeekCard({
  week,
  evenings,
  today,
  onOpenCalendar,
}: {
  week: WeekView;
  evenings: Record<string, RoutineItemView | null>;
  today: string;
  onOpenCalendar: () => void;
}) {
  const active = week.sessions.filter((s) => s.status !== 'skipped');
  const done = active.filter((s) => s.status === 'done').length;
  const unplaced = active.filter((s) => s.status === 'todo' && !s.day);
  return (
    <article className="card s6">
      <header>
        <span className="label">Cette semaine{week.plan ? ` · ${done}/${active.length}` : ''}</span>
        <span>
          <span className="src">Campus</span> <span className="src">Calculé</span>
        </span>
      </header>
      {!week.plan && <p className="empty">Campus n'a pas encore fourni le plan de cette semaine.</p>}
      <ol className="wk">
        {week.days.map(({ day }) => {
          const sessions = active.filter((s) => s.day === day);
          const evening = evenings[day];
          const past = day < today;
          return (
            <li
              key={day}
              className={day === today ? 'today' : past ? 'past' : ''}
              aria-current={day === today ? 'date' : undefined}
            >
              <b>{weekdayShort(day)}</b>
              <div>
                {sessions.length ? (
                  sessions.map((s) => (
                    <span key={s.key} className="wk-s">
                      <i style={{ background: SPORT_COLOR[s.sport] }} />
                      {sessionLabel(s)} · {s.durationMin} min
                      {s.status === 'done' && (
                        <span className="ok" aria-label="faite">
                          ✓
                        </span>
                      )}
                    </span>
                  ))
                ) : (
                  <span className="wk-s rest">Repos</span>
                )}
                <small>{!past && evening ? `soir : + ${lowerFirst(evening.name)}` : '—'}</small>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="wk-foot">
        {week.warnings.length ? (
          week.warnings.map((w) => (
            <span key={w.rule + w.days.join()} className="w">
              ⚠ {w.message}.{' '}
            </span>
          ))
        ) : (
          <>
            <span className="ok">✓ Règles respectées</span> : pas deux courses d'affilée, pas de renforcement
            jambes la veille d'une intensité, au moins un jour de repos.{' '}
          </>
        )}
        {unplaced.length > 0 && (
          <span className="w">
            {unplaced.length === 1 ? '1 séance non placée' : `${unplaced.length} séances non placées`}.{' '}
          </span>
        )}
        <button type="button" className="linkbtn" onClick={onOpenCalendar}>
          Ajuster dans le Calendrier
        </button>
      </p>
    </article>
  );
}
