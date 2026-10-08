import { activitySport, type MonthView, type Sport, type WeekView } from '@coach-chris/domain';
import { SPORT_COLOR, shortDate } from '../format.ts';

const HEAD = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const COUNTED: Sport[] = ['run', 'bike', 'strength'];
const BAR: Record<string, string> = { run: 'var(--p-run)', bike: 'var(--p-bike)', strength: 'var(--p-str)' };

/** Minutes de la semaine par sport : réalisé (activités, séances validées sans montre) + reste prévu. */
function totals(w: WeekView): Record<'run' | 'bike' | 'strength', number> {
  const t = { run: 0, bike: 0, strength: 0 };
  for (const a of w.activities) {
    const s = activitySport(a.type);
    if (s === 'run' || s === 'bike' || s === 'strength') t[s] += Math.round(a.durationS / 60);
  }
  for (const s of w.sessions) {
    if (s.sport !== 'run' && s.sport !== 'bike' && s.sport !== 'strength') continue;
    if (s.status === 'done' && s.match && !s.match.activityId) t[s.sport] += s.durationMin;
    if (s.status === 'todo' && !s.match && s.day) t[s.sport] += s.durationMin;
  }
  return t;
}

export function Month({
  view,
  today,
  onOpenWeek,
}: {
  view: MonthView;
  today: string;
  onOpenWeek: (start: string) => void;
}) {
  const scale = Math.max(
    60,
    ...view.weeks.map((w) => {
      const t = totals(w);
      return t.run + t.bike + t.strength;
    }),
  );
  return (
    <>
      <div className="month">
        {HEAD.map((d) => (
          <div key={d} className="mh">
            {d}
          </div>
        ))}
        <div className="mh tot">Total semaine</div>
        {view.weeks.map((w) => {
          const t = totals(w);
          const total = t.run + t.bike + t.strength;
          const end = w.days[6]!.day;
          const state = end < today ? 'réalisé' : w.start > today ? 'prévu' : 'en cours';
          const label = w.plan?.goalWeek ? `S${w.plan.goalWeek.index} · ${state}` : state;
          return [
            ...w.days.map(({ day }) => (
              <div
                key={day}
                className={`mc${day.slice(0, 7) !== view.month ? ' out' : ''}${day === today ? ' today' : ''}`}
              >
                <div className="d">{Number(day.slice(8))}</div>
                <div className="pills">
                  {w.sessions
                    .filter((s) => s.day === day && s.status !== 'skipped')
                    .map((s) => (
                      <span
                        key={s.key}
                        className={`pill${s.status === 'todo' && !s.match ? ' prop' : ''}`}
                        style={
                          {
                            '--c': SPORT_COLOR[s.sport],
                            width: s.sport === 'strength' ? 18 : 26,
                          } as React.CSSProperties
                        }
                        title={`${s.displayName} · ${s.durationMin} min`}
                      />
                    ))}
                  {w.offPlan
                    .filter((a) => a.startLocal.startsWith(day) && COUNTED.includes(activitySport(a.type)))
                    .map((a) => (
                      <span
                        key={a.id}
                        className="pill"
                        style={
                          { '--c': SPORT_COLOR[activitySport(a.type)], width: 26 } as React.CSSProperties
                        }
                        title={`${a.name ?? 'Activité'} · ${Math.round(a.durationS / 60)} min · hors plan`}
                      />
                    ))}
                </div>
              </div>
            )),
            total || w.plan ? (
              <button
                key={`${w.start}-t`}
                type="button"
                className="mt"
                onClick={() => onOpenWeek(w.start)}
                title={`Ouvrir la semaine du ${shortDate(w.start)}`}
              >
                <span>{label}</span>
                <b>{total} min</b>
                <span className="bars">
                  {(['run', 'bike', 'strength'] as const).map((k) => (
                    <i key={k} style={{ width: `${(100 * t[k]) / scale}%`, background: BAR[k] }} />
                  ))}
                </span>
              </button>
            ) : (
              <div key={`${w.start}-t`} className="mt empty">
                pas de plan publié
              </div>
            ),
          ];
        })}
      </div>
      <div className="legend">
        <span>
          <i style={{ background: 'var(--run)' }} />
          Course
        </span>
        <span>
          <i style={{ background: 'var(--bike)' }} />
          Vélo
        </span>
        <span>
          <i style={{ background: 'var(--strength)' }} />
          Renforcement
        </span>
        <span>
          <i style={{ boxShadow: 'inset 0 0 0 1.5px var(--muted)' }} />
          Placement proposé (à venir)
        </span>
        <span>Total : réalisé pour le passé, prévu ensuite. Marches exclues.</span>
      </div>
    </>
  );
}
