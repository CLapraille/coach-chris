import type { GoalView } from '@coach-chris/domain';
import { GOAL_LABEL, decimal, hoursMinutes, shortDate } from '../format.ts';

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export function GoalCard({ goal, today }: { goal: GoalView | null; today: string }) {
  return (
    <article className="card s6">
      <header>
        <span className="label">Objectif en cours</span>
        <span className="src campus">Campus</span>
      </header>
      {goal ? <Goal goal={goal} today={today} /> : <p className="empty">Aucun objectif actif dans Campus.</p>}
    </article>
  );
}

function Goal({ goal, today }: { goal: GoalView; today: string }) {
  const left = daysBetween(today, goal.endDate);
  const n = goal.durationInWeeks;
  const testWeek = goal.test ? Math.floor(daysBetween(goal.startDate, goal.test.weekDate) / 7) : -1;
  return (
    <div className="goal">
      <div className="goal-title">
        <h3>{GOAL_LABEL[goal.goalType] ?? goal.goalType}</h3>
        {left >= 0 && <span className="muted num text-lg">J-{left}</span>}
      </div>
      {goal.description && <p className="nx-sub">{goal.description}</p>}
      <div className="plan">
        <div
          className="phase-bar"
          style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
          role="img"
          aria-label={goal.weekIndex ? `Semaine ${goal.weekIndex} sur ${n}` : `${n} semaines`}
        >
          {Array.from({ length: n }, (_, i) => {
            const cls =
              goal.weekIndex && i < goal.weekIndex - 1
                ? 'done'
                : goal.weekIndex && i === goal.weekIndex - 1
                  ? 'now'
                  : i === testWeek
                    ? 'test'
                    : '';
            const title = i === testWeek && goal.test ? `S${i + 1} · ${goal.test.name}` : `S${i + 1}`;
            return <b key={i} className={cls} title={title} />;
          })}
        </div>
        <div className="plan-bot">
          <span>{shortDate(goal.startDate)}</span>
          {goal.weekIndex && (
            <span>
              S{goal.weekIndex}/{n}
            </span>
          )}
          <span>{goal.test ? `test ${shortDate(goal.endDate)}` : `fin ${shortDate(goal.endDate)}`}</span>
        </div>
      </div>
      <div className="goal-stats">
        <Stat
          value={goal.sessionsDone}
          unit={goal.sessionsTotal ? `/ ${goal.sessionsTotal} séances` : 'séances'}
        />
        <Stat value={goal.distanceKm === undefined ? undefined : decimal(goal.distanceKm)} unit="km courus" />
        <Stat value={goal.timeS === undefined ? undefined : hoursMinutes(goal.timeS)} unit="de course" />
      </div>
    </div>
  );
}

function Stat({ value, unit }: { value: string | number | undefined; unit: string }) {
  return (
    <div>
      <b className={`num ${value === undefined ? 'na' : ''}`}>{value ?? '—'}</b>
      <span>{unit}</span>
    </div>
  );
}
