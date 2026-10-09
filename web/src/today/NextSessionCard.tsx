import type { ActionRequest, NextSession, SessionBlock, WeekSession } from '@coach-chris/domain';
import { useState } from 'react';
import { ActionDialog } from '../actions/ActionDialog.tsx';
import { SPORT_COLOR, longDate, sessionLabel, shortDate, stepDuration } from '../format.ts';

export function NextSessionCard({
  next,
  then,
  today,
  onOpen,
  onChanged,
}: {
  next: NextSession | null;
  then: WeekSession | null;
  today: string;
  onOpen: (key: string) => void;
  onChanged: () => void;
}) {
  const [action, setAction] = useState<ActionRequest | null>(null);
  // Envoi sur la montre (D126) : course à faire, avec un jour placé.
  const canPush = next?.sport === 'run' && next.status === 'todo' && !next.match && !!next.day;
  return (
    <article className="card s7">
      <header>
        <span className="label">
          Prochaine séance{next?.day && next.day !== today ? ` · ${longDate(next.day)}` : ''}
        </span>
        <span className="src">Campus</span>
      </header>
      {next ? (
        <>
          <div className="nx">
            <div className="nx-title">
              <span className="sport-dot" style={{ background: SPORT_COLOR[next.sport] }} />
              <h3>{sessionLabel(next)}</h3>
              <span className="nx-dur num">{next.durationMin} min</span>
            </div>
            {next.blocks.map((b, i) => (
              <Block key={i} block={b} color={SPORT_COLOR[next.sport]} />
            ))}
            {next.description && <p className="nx-sub">{next.description}</p>}
          </div>
          <div className="nx-foot">
            <span className="muted">
              {then && (
                <>
                  Ensuite :{' '}
                  <span className="text-fg">
                    {sessionLabel(then)}, {then.durationMin} min
                  </span>
                </>
              )}
            </span>
            <span className="nx-acts">
              {canPush && (
                <button
                  className="btn"
                  type="button"
                  title={next.pushed ? `Envoyée le ${shortDate(next.pushed.at.slice(0, 10))}` : undefined}
                  onClick={() => setAction({ type: 'garmin.push', sessionKey: next.key })}
                >
                  {next.pushed ? 'Renvoyer sur la montre' : 'Envoyer sur la montre'}
                </button>
              )}
              <button className="btn primary" type="button" onClick={() => onOpen(next.key)}>
                Détail
              </button>
            </span>
          </div>
          {action && <ActionDialog request={action} onClose={() => setAction(null)} onDone={onChanged} />}
        </>
      ) : (
        <p className="empty">Plus de séance à faire cette semaine.</p>
      )}
    </article>
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
