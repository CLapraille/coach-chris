import type {
  ActionRequest,
  NextSession,
  RoutineItemView,
  SessionBlock,
  WeekSession,
  WeekView,
} from '@coach-chris/domain';
import { useState } from 'react';
import { ActionDialog } from '../actions/ActionDialog.tsx';
import { SPORT_COLOR, longDate, sessionLabel, shortDate, stepDuration, weekdayShort } from '../format.ts';

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Cette semaine et prochaine séance réunies (demande de l'utilisateur du 09/10) : la liste des jours, où la
 * prochaine séance se déplie (étapes, description, envoi sur la montre, détail). Chaque séance ouvre son Détail.
 */
export function WeekCard({
  week,
  next,
  evenings,
  today,
  onOpen,
  onOpenCalendar,
  onChanged,
}: {
  week: WeekView;
  next: NextSession | null;
  evenings: Record<string, RoutineItemView | null>;
  today: string;
  onOpen: (key: string) => void;
  onOpenCalendar: () => void;
  onChanged: () => void;
}) {
  const [action, setAction] = useState<ActionRequest | null>(null);
  const active = week.sessions.filter((s) => s.status !== 'skipped');
  const done = active.filter((s) => s.status === 'done' || s.match).length;
  const unplaced = active.filter((s) => s.status === 'todo' && !s.day);
  // La prochaine séance peut tomber la semaine suivante : elle s'affiche alors sous la liste.
  const nextInWeek = !!next?.day && week.days.some((d) => d.day === next.day);
  const nextPanel = next && (
    <NextPanel next={next} today={today} onOpen={onOpen} onPush={(r) => setAction(r)} />
  );
  return (
    <article className="card s5">
      <header>
        <span className="label">Cette semaine{week.plan ? ` · ${done}/${active.length}` : ''}</span>
        <span>
          <span className="src campus">Campus</span> <span className="src calc">Calculé</span>
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
                    <SessionLine key={s.key} s={s} onOpen={onOpen} isNext={s.key === next?.key} />
                  ))
                ) : (
                  <span className="wk-s rest">Repos</span>
                )}
                {sessions.some((s) => s.key === next?.key) && nextPanel}
                <small>{!past && evening ? `soir : + ${lowerFirst(evening.name)}` : '—'}</small>
              </div>
            </li>
          );
        })}
      </ol>
      {next && !nextInWeek && (
        <div className="wk-next-out">
          <span className="label">Prochaine séance{next.day ? ` · ${longDate(next.day)}` : ''}</span>
          <SessionLine s={next} onOpen={onOpen} isNext />
          {nextPanel}
        </div>
      )}
      {!next && week.plan && <p className="empty">Plus de séance à faire cette semaine.</p>}
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
      {action && <ActionDialog request={action} onClose={() => setAction(null)} onDone={onChanged} />}
    </article>
  );
}

function SessionLine({
  s,
  onOpen,
  isNext,
}: {
  s: WeekSession;
  onOpen: (key: string) => void;
  isNext: boolean;
}) {
  const doneOrLinked = s.status === 'done' || !!s.match;
  return (
    <span className={`wk-s${isNext ? ' next' : ''}`}>
      <i style={{ background: SPORT_COLOR[s.sport] }} />
      <button type="button" className="wk-open" onClick={() => onOpen(s.key)}>
        {sessionLabel(s)}
      </button>{' '}
      · {s.durationMin} min
      {isNext && <span className="wk-tag">prochaine séance</span>}
      {doneOrLinked && (
        <span
          className="ok"
          aria-label={s.status === 'done' ? 'faite' : 'faite, pas encore validée dans Campus'}
          title={s.status === 'done' ? undefined : 'Activité rattachée, pas encore validée dans Campus'}
        >
          ✓
        </span>
      )}
    </span>
  );
}

/** Prochaine séance dépliée : étapes, description, envoi sur la montre (D126) et détail. */
function NextPanel({
  next,
  today,
  onOpen,
  onPush,
}: {
  next: NextSession;
  today: string;
  onOpen: (key: string) => void;
  onPush: (r: ActionRequest) => void;
}) {
  const canPush = next.sport === 'run' && next.status === 'todo' && !next.match && !!next.day;
  return (
    <div className="nx wk-next" aria-label={`Prochaine séance : ${sessionLabel(next)}`}>
      {next.blocks.map((b, i) => (
        <Block key={i} block={b} color={SPORT_COLOR[next.sport]} />
      ))}
      {next.description && <p className="nx-sub">{next.description}</p>}
      <span className="nx-acts">
        {canPush && (
          <button
            className="btn"
            type="button"
            title={next.pushed ? `Envoyée le ${shortDate(next.pushed.at.slice(0, 10))}` : undefined}
            onClick={() => onPush({ type: 'garmin.push', sessionKey: next.key })}
          >
            {next.pushed ? 'Renvoyer sur la montre' : 'Envoyer sur la montre'}
          </button>
        )}
        <button className="btn primary" type="button" onClick={() => onOpen(next.key)}>
          Détail
        </button>
        {next.day && next.day !== today && (
          <span className="muted text-xs">prévue {longDate(next.day).toLowerCase()}</span>
        )}
      </span>
    </div>
  );
}

function Block({ block, color }: { block: SessionBlock; color: string }) {
  const label = block.steps.map((s) => `${s.name} ${stepDuration(s.seconds)}`).join(', ');
  return (
    <div
      className="nx-bar"
      role="img"
      aria-label={block.repeat > 1 ? `${label}. À répéter ${block.repeat} fois.` : label}
      style={{ '--c': color } as React.CSSProperties}
    >
      {block.steps.map((s, i) => (
        <div
          key={i}
          className={s.kind === 'walk' || s.kind === 'rest' ? 'r' : ''}
          style={{ flex: s.seconds || 1 }}
        >
          <b>{s.name}</b>
          <span>{stepDuration(s.seconds)}</span>
        </div>
      ))}
      {block.repeat > 1 && <em>× {block.repeat}</em>}
    </div>
  );
}
