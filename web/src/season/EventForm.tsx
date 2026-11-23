import type { Priority, SeasonEvent } from '@coach-chris/domain';
import { useState } from 'react';
import { api, ApiError } from '../api.ts';

type Draft = {
  name: string;
  date: string;
  dateConfirmed: boolean;
  dateLabel: string;
  place: string;
  country: string;
  url: string;
  terrain: 'route' | 'trail';
  priority: Priority;
  options: { km: string; dPlus: string }[];
  chosen: number | null;
  series: string;
  note: string;
};

const EMPTY: Draft = {
  name: '',
  date: '',
  dateConfirmed: true,
  dateLabel: '',
  place: '',
  country: 'Belgique',
  url: '',
  terrain: 'trail',
  priority: 'C',
  options: [{ km: '', dPlus: '' }],
  chosen: 0,
  series: '',
  note: '',
};

const toDraft = (e: SeasonEvent): Draft => ({
  name: e.name,
  date: e.date,
  dateConfirmed: e.dateConfirmed,
  dateLabel: e.dateLabel ?? '',
  place: e.place,
  country: e.country,
  url: e.url ?? '',
  terrain: e.terrain,
  priority: e.priority,
  options: e.options.map((o) => ({ km: String(o.km), dPlus: o.dPlus === undefined ? '' : String(o.dPlus) })),
  chosen: e.chosen ?? null,
  series: e.series ?? '',
  note: e.note ?? '',
});

const num = (s: string) => Number(s.replace(',', '.'));

/** Corps envoyé à l'API : champs facultatifs vides omis, distances sans ligne vide. */
function payload(d: Draft): Record<string, unknown> {
  const options = d.options
    .filter((o) => o.km.trim())
    .map((o) => ({ km: num(o.km), ...(o.dPlus.trim() && { dPlus: num(o.dPlus) }) }));
  const kept = d.options.map((o, i) => (o.km.trim() ? i : -1)).filter((i) => i >= 0);
  const chosen = d.chosen === null ? -1 : kept.indexOf(d.chosen);
  const text = (k: 'dateLabel' | 'url' | 'series' | 'note') => (d[k].trim() ? { [k]: d[k].trim() } : {});
  return {
    name: d.name.trim(),
    date: d.date,
    dateConfirmed: d.dateConfirmed,
    ...(!d.dateConfirmed && text('dateLabel')),
    place: d.place.trim(),
    country: d.country.trim(),
    ...text('url'),
    terrain: d.terrain,
    priority: d.priority,
    options,
    ...(chosen >= 0 && { chosen }),
    ...text('series'),
    ...text('note'),
  };
}

/**
 * Ajouter, modifier ou supprimer une course de la saison à la main (D165). Mêmes règles qu'un import :
 * un refus affiche la liste des problèmes et n'écrit rien. La suppression se confirme dans la carte.
 */
export function EventForm({
  event,
  onDone,
  onCancel,
}: {
  event?: SeasonEvent;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(event ? toDraft(event) : EMPTY);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v });
  const setOption = (i: number, k: 'km' | 'dPlus', v: string) =>
    set(
      'options',
      d.options.map((o, j) => (j === i ? { ...o, [k]: v } : o)),
    );
  const id = event?.id ?? 'new';

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setProblems([]);
    try {
      await fn();
      onDone();
    } catch (e) {
      const list =
        e instanceof ApiError && Array.isArray(e.body.problems) ? (e.body.problems as string[]) : [];
      setProblems(list.length ? list : [e instanceof Error ? e.message : String(e)]);
    } finally {
      setBusy(false);
    }
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    void run(() =>
      api(event ? `/season/events/${event.id}` : '/season/events', {
        method: event ? 'PUT' : 'POST',
        body: JSON.stringify(payload(d)),
      }),
    );
  };

  return (
    <form
      className="ev-form"
      onSubmit={save}
      aria-label={event ? `Modifier ${event.name}` : 'Nouvelle course'}
    >
      <div className="ev-grid">
        <label className="wide">
          <span className="label">Nom</span>
          <input id={`ev-${id}-name`} required value={d.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        <label>
          <span className="label">Date</span>
          <input
            id={`ev-${id}-date`}
            type="date"
            required
            value={d.date}
            onChange={(e) => set('date', e.target.value)}
          />
        </label>
        <label className="ev-check">
          <input
            id={`ev-${id}-confirmed`}
            type="checkbox"
            checked={d.dateConfirmed}
            onChange={(e) => set('dateConfirmed', e.target.checked)}
          />
          Date confirmée
        </label>
        {!d.dateConfirmed && (
          <label>
            <span className="label">Libellé de la date</span>
            <input
              id={`ev-${id}-datelabel`}
              placeholder="ex. mi-août"
              value={d.dateLabel}
              onChange={(e) => set('dateLabel', e.target.value)}
            />
          </label>
        )}
        <label>
          <span className="label">Lieu</span>
          <input id={`ev-${id}-place`} value={d.place} onChange={(e) => set('place', e.target.value)} />
        </label>
        <label>
          <span className="label">Pays</span>
          <input id={`ev-${id}-country`} value={d.country} onChange={(e) => set('country', e.target.value)} />
        </label>
        <label className="wide">
          <span className="label">Site</span>
          <input
            id={`ev-${id}-url`}
            type="url"
            placeholder="https://…"
            value={d.url}
            onChange={(e) => set('url', e.target.value)}
          />
        </label>
        <div className="ev-field">
          <span className="label">Terrain</span>
          <div className="theme" role="radiogroup" aria-label="Terrain">
            {(['trail', 'route'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={d.terrain === t}
                onClick={() => set('terrain', t)}
              >
                {t === 'trail' ? 'Trail' : 'Route'}
              </button>
            ))}
          </div>
        </div>
        <div className="ev-field">
          <span className="label">Priorité</span>
          <div className="theme" role="radiogroup" aria-label="Priorité">
            {(['A', 'B', 'C'] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={d.priority === p}
                onClick={() => set('priority', p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <label>
          <span className="label">Challenge</span>
          <input
            id={`ev-${id}-series`}
            placeholder="ex. Lupulus Trophy"
            value={d.series}
            onChange={(e) => set('series', e.target.value)}
          />
        </label>
      </div>

      <fieldset className="ev-opts">
        <legend className="label">Distances · coche celle prévue</legend>
        {d.options.map((o, i) => (
          <div key={i} className="ev-opt">
            <input
              type="radio"
              name={`ev-${id}-chosen`}
              aria-label={`Distance prévue ${i + 1}`}
              checked={d.chosen === i}
              onChange={() => set('chosen', i)}
            />
            <input
              id={`ev-${id}-km-${i}`}
              inputMode="decimal"
              aria-label={`Kilomètres ${i + 1}`}
              placeholder="km"
              value={o.km}
              onChange={(e) => setOption(i, 'km', e.target.value)}
            />
            <span className="muted">km · D+</span>
            <input
              id={`ev-${id}-dplus-${i}`}
              inputMode="numeric"
              aria-label={`Dénivelé ${i + 1}`}
              placeholder="m"
              value={o.dPlus}
              onChange={(e) => setOption(i, 'dPlus', e.target.value)}
            />
            {d.options.length > 1 && (
              <button
                className="linkbtn"
                type="button"
                onClick={() => {
                  const options = d.options.filter((_, j) => j !== i);
                  const chosen =
                    d.chosen === i ? null : d.chosen !== null && d.chosen > i ? d.chosen - 1 : d.chosen;
                  setD({ ...d, options, chosen });
                }}
              >
                Retirer
              </button>
            )}
          </div>
        ))}
        <button
          className="linkbtn"
          type="button"
          onClick={() => set('options', [...d.options, { km: '', dPlus: '' }])}
        >
          + Autre distance
        </button>
      </fieldset>

      <label className="ev-note">
        <span className="label">Note</span>
        <input id={`ev-${id}-note`} value={d.note} onChange={(e) => set('note', e.target.value)} />
      </label>

      {problems.length > 0 && (
        <ul className="text-alert ev-problems" role="alert">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <div className="nx-acts">
        <button className="btn primary small" type="submit" disabled={busy}>
          {event ? 'Enregistrer' : 'Ajouter la course'}
        </button>
        <button className="btn small" type="button" disabled={busy} onClick={onCancel}>
          Annuler
        </button>
        {event &&
          (confirmDelete ? (
            <button
              className="btn small danger"
              type="button"
              disabled={busy}
              onClick={() => void run(() => api(`/season/events/${event.id}`, { method: 'DELETE' }))}
            >
              Confirmer la suppression
            </button>
          ) : (
            <button className="linkbtn ev-del" type="button" onClick={() => setConfirmDelete(true)}>
              Supprimer cette course
            </button>
          ))}
      </div>
    </form>
  );
}
