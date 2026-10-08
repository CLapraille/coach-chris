import type { MobilityToday, RoutineItemView, Slot } from '@coach-chris/domain';
import { useState } from 'react';
import { api } from '../api.ts';
import { mmss, shortDate } from '../format.ts';

const total = (items: RoutineItemView[]) => items.reduce((s, i) => s + i.durationS * (i.perSide ? 2 : 1), 0);
const minutes = (s: number) => `${Math.round(s / 60)} min`;

export function MobilityCard({
  mobility,
  today,
  onChanged,
  onOpenMobility,
}: {
  mobility: MobilityToday;
  today: string;
  onChanged: () => void;
  onOpenMobility: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const toggle = async (slot: Slot, done: boolean) => {
    setError(null);
    try {
      await api(`/mobility/log/${today}/${slot}`, { method: 'PUT', body: JSON.stringify({ done }) });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const done7 = mobility.last7.filter((d) => d.morning || d.evening).length;
  return (
    <article className="card s6">
      <header>
        <span className="label">Mobilité</span>
        <span className="src">CoachChris</span>
      </header>
      <div className="routine">
        <Routine
          title={`Matin · ${minutes(total(mobility.morning))}`}
          tag={<span className="tag fixe">fixe</span>}
          items={mobility.morning}
          checked={mobility.checked.morning}
          onToggle={(v) => toggle('morning', v)}
        />
        <Routine
          title={`Soir · ${minutes(total(mobility.evening))}`}
          tag={<span className="tag">proposition</span>}
          items={mobility.evening}
          checked={mobility.checked.evening}
          onToggle={(v) => toggle('evening', v)}
          slotIndex={mobility.evening.length - 1}
          footer={
            mobility.testsMissing && (
              <li>
                <small>
                  Routine du soir complète après les tests de mobilité.{' '}
                  <button type="button" className="linkbtn" onClick={onOpenMobility}>
                    Faire les tests
                  </button>
                </small>
              </li>
            )
          }
        />
      </div>
      {error && <p className="empty text-alert">{error}</p>}
      <div className="rt-streak">
        <span>Régularité 7 j</span>
        <span
          className="dots"
          role="img"
          aria-label={`${done7} jours sur 7 avec au moins une routine cochée`}
        >
          {mobility.last7.map((d) => (
            <i
              key={d.day}
              className={d.morning && d.evening ? 'on' : d.morning || d.evening ? 'half' : ''}
              title={`${shortDate(d.day)} : ${[d.morning && 'matin', d.evening && 'soir'].filter(Boolean).join(' + ') || 'non renseigné'}`}
            />
          ))}
        </span>
        <span className="muted">{done7 ? `${done7}/7 jours` : 'aucune donnée'}</span>
      </div>
    </article>
  );
}

function Routine({
  title,
  tag,
  items,
  checked,
  onToggle,
  slotIndex,
  footer,
}: {
  title: string;
  tag: React.ReactNode;
  items: RoutineItemView[];
  checked: boolean;
  onToggle: (done: boolean) => void;
  slotIndex?: number;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rt">
      <label className="rt-h">
        <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} />
        <b>{title}</b>
        {tag}
      </label>
      <ol className="rt-list">
        {items.map((it, i) => (
          <li key={it.code} className={i === slotIndex ? 'slot' : ''}>
            <span>
              {it.name}
              {it.reason && <small> · {it.reason}</small>}
            </span>
            <span>{mmss(it.durationS, it.perSide)}</span>
          </li>
        ))}
        {footer}
      </ol>
    </div>
  );
}
