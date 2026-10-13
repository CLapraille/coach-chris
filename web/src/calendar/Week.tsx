import {
  activitySport,
  canCheck,
  type CachedActivity,
  type Slot,
  type WeekSession,
  type WeekView,
} from '@coach-chris/domain';
import { useState } from 'react';
import { api } from '../api.ts';
import { SPORT_COLOR, SPORT_LABEL, decimal, sessionLabel, weekdayShort } from '../format.ts';

/** Écart de durée au-delà duquel une séance faite est signalée (D67 : ±10 %). */
const OVER = 0.1;

const minSec = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export function Week({
  week,
  today,
  walks,
  onChanged,
  onOpenSession,
}: {
  week: WeekView;
  today: string;
  walks: boolean;
  onChanged: () => void;
  onOpenSession: (key: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const end = week.days[6]!.day;
  const editable = end >= today && week.plan !== null;
  const byId = new Map(week.activities.map((a) => [a.id, a]));
  const active = week.sessions.filter((s) => s.status !== 'skipped');
  const unplaced = active.filter((s) => s.status === 'todo' && !s.day);

  const call = async (path: string, init: RequestInit) => {
    setError(null);
    try {
      await api(path, init);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const move = (key: string, day: string) =>
    call(`/calendar/week/${week.start}/placement`, { method: 'PUT', body: JSON.stringify({ key, day }) });
  const reset = () => call(`/calendar/week/${week.start}/placement`, { method: 'DELETE' });
  const check = (day: string, slot: Slot, done: boolean) =>
    call(`/mobility/log/${day}/${slot}`, { method: 'PUT', body: JSON.stringify({ done }) });

  const openDays = week.days.map((d) => d.day).filter((d) => d >= today);

  return (
    <>
      <div className="notice">
        {editable ? (
          <>
            <span className="src calc">Calculé</span>
            <span>
              {week.manual
                ? 'Séance déplacée à la main ; le reste de la semaine est replacé autour.'
                : 'Placement proposé par CoachChris, à ajuster librement.'}
            </span>
            {week.warnings.length ? (
              week.warnings.map((w) => (
                <span key={w.rule + w.days.join()} className="warn">
                  ⚠ {w.message}
                </span>
              ))
            ) : (
              <span className="ok">Aucune règle enfreinte</span>
            )}
            {week.manual && (
              <button className="btn" type="button" onClick={reset}>
                Revenir à la proposition
              </button>
            )}
          </>
        ) : week.plan ? (
          <>
            <span className="src garmin">Garmin</span>
            <span className="src campus">Campus</span>
            <span>
              {end < today
                ? 'Semaine terminée : séances rattachées aux activités Garmin.'
                : 'Semaine à venir.'}
            </span>
          </>
        ) : (
          <span>Campus n'a pas de plan pour cette semaine.</span>
        )}
        {unplaced.length > 0 && (
          <span className="warn">
            Non faite{unplaced.length > 1 ? 's' : ''} : {unplaced.map(sessionLabel).join(', ')}
          </span>
        )}
        {error && (
          <span className="warn" role="alert">
            {error}
          </span>
        )}
      </div>
      <div className="week">
        {week.days.map(({ day }) => {
          const sessions = active.filter((s) => s.day === day);
          const extras = week.offPlan.filter((a) => a.startLocal.startsWith(day));
          const walkCount = week.activities.filter(
            (a) => a.startLocal.startsWith(day) && activitySport(a.type) === 'walk',
          ).length;
          const rd = week.readiness[day];
          const dropOk = editable && day >= today;
          const empty = !sessions.length && !extras.length && !(walks && walkCount);
          return (
            <div
              key={day}
              className={`day${day === today ? ' today' : day < today ? ' past' : ''}${over === day ? ' over' : ''}`}
              onDragOver={(e) => {
                if (!dropOk) return;
                e.preventDefault();
                setOver(day);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
              }}
              onDrop={(e) => {
                if (!dropOk) return;
                e.preventDefault();
                setOver(null);
                const key = e.dataTransfer.getData('text/plain');
                if (key) void move(key, day);
              }}
            >
              <div className="dh">
                <b>
                  {weekdayShort(day).split(' ')[0]}
                  <small>{Number(day.slice(8))}</small>
                </b>
                {rd !== null && rd !== undefined && (
                  <span
                    className={`rd ${rd >= 70 ? 'hi' : rd >= 40 ? 'mid' : 'lo'}`}
                    title="Disponibilité du matin (Garmin)"
                  >
                    {rd}
                  </span>
                )}
              </div>
              <div className="items">
                {sessions.map((s) =>
                  s.status === 'done' || s.fixed ? (
                    <DoneItem
                      key={s.key}
                      s={s}
                      onOpen={onOpenSession}
                      activity={s.match?.activityId ? byId.get(s.match.activityId) : undefined}
                    />
                  ) : (
                    <PlanItem
                      key={s.key}
                      s={s}
                      onOpen={onOpenSession}
                      draggable={editable}
                      days={openDays}
                      onMove={(d) => void move(s.key, d)}
                    />
                  ),
                )}
                {extras.map((a) => (
                  <ExtraItem key={a.id} a={a} />
                ))}
                {walks && walkCount > 0 && (
                  <div className="it walk">
                    <div className="t">
                      <span>Marche × {walkCount}</span>
                    </div>
                    <div className="m">trajets, hors charge</div>
                  </div>
                )}
                {empty && <div className="restday">{day < today || !editable ? 'Repos' : 'Libre'}</div>}
              </div>
              <MobRow
                day={day}
                today={today}
                routines={week.routines[day] ?? { morning: false, evening: false }}
                onCheck={check}
              />
            </div>
          );
        })}
      </div>
      <Summary week={week} />
    </>
  );
}

/** Titre de séance cliquable : ouvre le Détail de séance. */
function Title({ s, onOpen }: { s: WeekSession; onOpen: (key: string) => void }) {
  return (
    <button type="button" className="it-open" onClick={() => onOpen(s.key)}>
      {sessionLabel(s)}
    </button>
  );
}

function DoneItem({
  s,
  activity,
  onOpen,
}: {
  s: WeekSession;
  activity: CachedActivity | undefined;
  onOpen: (key: string) => void;
}) {
  const planned = s.durationMin * 60;
  const ratio = activity && planned ? activity.durationS / planned - 1 : 0;
  const isOver = ratio > OVER;
  const meta = activity
    ? [
        `${minSec(activity.durationS)} / ${minSec(planned)}`,
        activity.distanceM !== undefined && `${decimal(activity.distanceM / 1000, 2)} km`,
      ]
        .filter(Boolean)
        .join(' · ')
    : `${s.durationMin} min · validée sans montre`;
  return (
    <div className="it done" style={{ '--c': SPORT_COLOR[s.sport] } as React.CSSProperties}>
      <div className="t">
        <Title s={s} onOpen={onOpen} />
        <span className={`st ${isOver ? 'over' : 'done'}`}>
          {isOver ? `+${Math.round(ratio * 100)} %` : s.status === 'done' ? 'fait' : 'rattaché'}
        </span>
      </div>
      <div className="m">{meta}</div>
    </div>
  );
}

function PlanItem({
  s,
  draggable,
  days,
  onMove,
  onOpen,
}: {
  s: WeekSession;
  onOpen: (key: string) => void;
  draggable: boolean;
  days: string[];
  onMove: (day: string) => void;
}) {
  const [drop, setDrop] = useState(false);
  return (
    <div
      className={`it plan${drop ? ' drop' : ''}`}
      style={{ '--c': SPORT_COLOR[s.sport] } as React.CSSProperties}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', s.key);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={() => draggable && setDrop(true)}
      onDragLeave={() => setDrop(false)}
      onDrop={() => setDrop(false)}
    >
      <div className="t">
        <Title s={s} onOpen={onOpen} />
        <span className="st todo">à faire</span>
      </div>
      <div className="m">
        {s.durationMin} min · {s.trainingType}
      </div>
      {draggable && days.length > 1 && (
        <select
          aria-label={`Déplacer ${sessionLabel(s)}`}
          value={s.day ?? ''}
          onChange={(e) => onMove(e.target.value)}
        >
          {days.map((d) => (
            <option key={d} value={d}>
              {weekdayShort(d)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function ExtraItem({ a }: { a: CachedActivity }) {
  const sport = activitySport(a.type);
  return (
    <div className="it extra" style={{ '--c': SPORT_COLOR[sport] } as React.CSSProperties}>
      <div className="t">
        <span>{a.name ?? SPORT_LABEL[sport]}</span>
        <span className="st todo">hors plan</span>
      </div>
      <div className="m">
        {Math.round(a.durationS / 60)} min{a.avgHr !== undefined && ` · FC ${a.avgHr}`}
      </div>
    </div>
  );
}

function MobRow({
  day,
  today,
  routines,
  onCheck,
}: {
  day: string;
  today: string;
  routines: Record<Slot, boolean>;
  onCheck: (day: string, slot: Slot, done: boolean) => void;
}) {
  if (day > today) return <div className="mobrow" />;
  if (!canCheck(day, today)) {
    const done = (['morning', 'evening'] as const).filter((s) => routines[s]);
    return (
      <div className="mobrow">
        <span className="na">
          Mobilité :{' '}
          {done.length ? done.map((s) => (s === 'morning' ? 'matin' : 'soir')).join(' + ') : 'non renseignée'}
        </span>
      </div>
    );
  }
  return (
    <div className="mobrow">
      {(['morning', 'evening'] as const).map((slot) => (
        <label key={slot}>
          <input
            type="checkbox"
            checked={routines[slot]}
            onChange={(e) => onCheck(day, slot, e.target.checked)}
          />
          {slot === 'morning' ? 'matin' : 'soir'}
        </label>
      ))}
    </div>
  );
}

function Summary({ week }: { week: WeekView }) {
  const sessions = week.sessions.filter((s) => s.status !== 'skipped');
  const minutes = (sport: string) =>
    week.activities
      .filter((a) => activitySport(a.type) === sport)
      .reduce((n, a) => n + Math.round(a.durationS / 60), 0);
  const planned = (sport: string) =>
    sessions.filter((s) => s.sport === sport).reduce((n, s) => n + s.durationMin, 0);
  const strength = sessions.filter((s) => s.sport === 'strength');
  const bikeOff = week.offPlan.filter((a) => activitySport(a.type) === 'bike');
  return (
    <div className="weeksum">
      {week.plan && (
        <span>
          Réalisé :{' '}
          <b>
            {sessions.filter((s) => s.status === 'done').length}/{sessions.length}
          </b>{' '}
          séances
        </span>
      )}
      <span>
        Course <b>{minutes('run')} min</b>
        {planned('run') > 0 && ` / ${planned('run')} prévues`}
      </span>
      {(minutes('bike') > 0 || bikeOff.length > 0) && (
        <span>
          Vélo <b>{minutes('bike')} min</b>
          {bikeOff.length > 0 && ' hors plan'}
        </span>
      )}
      {strength.length > 0 && (
        <span>
          Renforcement{' '}
          <b>
            {strength.filter((s) => s.status === 'done').length}/{strength.length}
          </b>
        </span>
      )}
    </div>
  );
}
