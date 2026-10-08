import { addDays, mondayOf, type MonthView, type WeekView } from '@coach-chris/domain';
import { useState } from 'react';
import { useApi } from '../api.ts';
import { parisDay } from '../format.ts';
import { Month } from './Month.tsx';
import { Week } from './Week.tsx';

const monthOf = (day: string) => day.slice(0, 7);
function shiftMonth(m: string, n: number): string {
  const [y, mo] = m.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

const MONTH_FMT = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthTitle = (m: string) => {
  const s = MONTH_FMT.format(new Date(`${m}-15T12:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const weekTitle = (start: string) =>
  `Semaine du ${new Date(`${start}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' })}`;

export function Calendar({ onOpenSession }: { onOpenSession: (key: string) => void }) {
  const today = parisDay(new Date().toISOString());
  const [view, setView] = useState<'week' | 'month'>('week');
  const [start, setStart] = useState(mondayOf(today));
  const [month, setMonth] = useState(monthOf(today));
  const [walks, setWalks] = useState(false);

  const shift = (n: number) =>
    view === 'week' ? setStart(addDays(start, 7 * n)) : setMonth(shiftMonth(month, n));
  const goToday = () => (view === 'week' ? setStart(mondayOf(today)) : setMonth(monthOf(today)));
  const openWeek = (w: string) => {
    setStart(w);
    setView('week');
  };

  return (
    <section className="cal" aria-labelledby="cal-title">
      <div className="toolbar">
        <div>
          <h1 id="cal-title">{view === 'week' ? weekTitle(start) : monthTitle(month)}</h1>
        </div>
        <div className="tools">
          <div className="seg" role="group" aria-label="Vue">
            <button type="button" aria-pressed={view === 'week'} onClick={() => setView('week')}>
              Semaine
            </button>
            <button type="button" aria-pressed={view === 'month'} onClick={() => setView('month')}>
              Mois
            </button>
          </div>
          <button className="btn" type="button" aria-label="Période précédente" onClick={() => shift(-1)}>
            ‹
          </button>
          <button className="btn" type="button" onClick={goToday}>
            Aujourd'hui
          </button>
          <button className="btn" type="button" aria-label="Période suivante" onClick={() => shift(1)}>
            ›
          </button>
          {view === 'week' && (
            <label className="toggle">
              <input type="checkbox" checked={walks} onChange={(e) => setWalks(e.target.checked)} />
              Afficher les marches
            </label>
          )}
        </div>
      </div>
      {view === 'week' ? (
        <WeekLoader key={start} start={start} today={today} walks={walks} onOpenSession={onOpenSession} />
      ) : (
        <MonthLoader key={month} month={month} today={today} onOpenWeek={openWeek} />
      )}
    </section>
  );
}

function WeekLoader({
  start,
  today,
  walks,
  onOpenSession,
}: {
  start: string;
  today: string;
  walks: boolean;
  onOpenSession: (key: string) => void;
}) {
  const res = useApi<WeekView>(`/calendar/week?start=${start}`);
  if (res.state === 'loading') return <p className="muted">Chargement…</p>;
  if (res.state === 'error')
    return (
      <p className="empty" role="alert">
        {res.error.message}
      </p>
    );
  return (
    <Week week={res.data} today={today} walks={walks} onChanged={res.reload} onOpenSession={onOpenSession} />
  );
}

function MonthLoader({
  month,
  today,
  onOpenWeek,
}: {
  month: string;
  today: string;
  onOpenWeek: (start: string) => void;
}) {
  const res = useApi<MonthView>(`/calendar/month?m=${month}`);
  if (res.state === 'loading') return <p className="muted">Chargement…</p>;
  if (res.state === 'error')
    return (
      <p className="empty" role="alert">
        {res.error.message}
      </p>
    );
  return <Month view={res.data} today={today} onOpenWeek={onOpenWeek} />;
}
