import type { CapView, VolumeView, WeekView } from '@coach-chris/domain';
import { decimal } from '../format.ts';

/**
 * Volume de la semaine (visuel utilisateur du 09/10) : par ligne, le réalisé (plein), le reste prévu par Campus
 * (clair) et le repère (trait « max », D90). Le vélo n'a ni plan ni repère : rien n'est inventé pour lui.
 */
export function VolumeCard({ volume, routines }: { volume: VolumeView; routines: WeekView['routines'] }) {
  const { run } = volume.cap;
  const week = volume.weeks.at(-1) ?? { run: 0, bike: 0, strength: 0 };
  // Mobilité : routines cochées (matin et soir) sur les 7 jours de la semaine ; leur durée n'est pas enregistrée.
  const days = Object.values(routines);
  const mobilityDone = days.reduce((n, d) => n + Number(d.morning) + Number(d.evening), 0);
  return (
    <article className="card s7 vol-card">
      <header>
        <span className="label">Volume de la semaine (minutes)</span>
        <span>
          <span className="src garmin">Garmin</span> <span className="src campus">Campus</span>
        </span>
      </header>
      <div className="vol-rows">
        <Row
          icon={<RunIcon />}
          label="Course"
          parts={[{ minutes: week.run, color: 'var(--run)' }]}
          cap={run}
          plannedColor="color-mix(in srgb, var(--run) 30%, transparent)"
        />
        <Row
          icon={<BikeIcon />}
          label="Vélo"
          parts={[{ minutes: week.bike, color: 'var(--bike)' }]}
          cap={null}
        />
        <Row
          icon={<DumbbellIcon />}
          label="Renforcement"
          parts={[{ minutes: week.strength, color: 'var(--strength)' }]}
          cap={null}
          planned={volume.planned.strength}
          plannedColor="color-mix(in srgb, var(--strength) 30%, transparent)"
        />
        <Row
          icon={<StretchIcon />}
          label="Mobilité"
          parts={[{ minutes: mobilityDone, color: 'var(--mobility)' }]}
          cap={null}
          planned={days.length * 2}
          plannedColor="color-mix(in srgb, var(--mobility) 25%, transparent)"
          unit="routines"
          note="matin et soir"
        />
      </div>
      <div className="vol-legend">
        <span>
          <i className="done" /> réalisé
        </span>
        <span>
          <i className="plan" /> reste prévu
        </span>
        <span>
          <i className="mark" /> repère
        </span>
        <span className="muted">Marches exclues</span>
      </div>
      {run ? (
        <details className="vol-rule">
          <summary>Règle</summary>
          Le plan Campus prime. Un dépassement est un point d'attention, pas une interdiction. Repère = 1,3 ×
          moyenne des 4 semaines complètes précédentes (ratio charge aiguë / chronique)
          {`. Course : 1,3 × ${decimal(run.mean)} min`}. « Sous le repère » ou « au-dessus » compare le prévu
          de la semaine au repère. Une séance validée dans Campus sans montre compte pour sa durée prévue.
          Repère courant en préparation physique, pas une prescription médicale.
        </details>
      ) : (
        <p className="empty">Pas encore 4 semaines d'historique : pas de repère.</p>
      )}
    </article>
  );
}

function Row({
  icon,
  label,
  parts,
  cap,
  planned: plannedOnly,
  plannedColor,
  unit,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  parts: { minutes: number; color: string }[];
  cap: CapView | null;
  /** Prévu sans repère (renforcement, mobilité). */
  planned?: number;
  plannedColor?: string;
  /** Unité autre que les minutes : la ligne affiche « fait / prévu ». */
  unit?: string;
  note?: string;
}) {
  const done = parts.reduce((n, p) => n + p.minutes, 0);
  const plannedMin = cap?.planned ?? plannedOnly;
  const planned = Math.max(plannedMin ?? 0, done);
  const scale = Math.max(planned, cap?.cap ?? 0, 1) * 1.08;
  const pct = (m: number) => `${(100 * m) / scale}%`;
  const doneMin = Math.round(done);
  return (
    <div className="vol-row">
      <span className="vol-icon">{icon}</span>
      <div className="vol-main">
        <span className="vol-label">{label}</span>
        <span
          className="vol-bar"
          role="img"
          aria-label={
            unit
              ? `${label} : ${doneMin} ${unit} faites sur ${plannedMin}`
              : `${label} : ${doneMin} minutes faites` +
                (plannedMin !== undefined ? `, ${plannedMin} prévues` : '') +
                (cap ? `, repère ${Math.round(cap.cap)} minutes` : ', pas de repère')
          }
        >
          {plannedMin !== undefined && planned > done && (
            <i
              className="plan"
              style={{ left: pct(done), width: pct(planned - done), background: plannedColor }}
            />
          )}
          {
            parts.reduce<{ left: number; el: React.ReactNode[] }>(
              (acc, p, i) => {
                if (p.minutes > 0) {
                  acc.el.push(
                    <i key={i} style={{ left: pct(acc.left), width: pct(p.minutes), background: p.color }} />,
                  );
                }
                acc.left += p.minutes;
                return acc;
              },
              { left: 0, el: [] },
            ).el
          }
          {done > 0 && <em className="now" style={{ left: pct(done) }} />}
          {cap && (
            <em className="max" style={{ left: pct(cap.cap) }}>
              <small>max</small>
            </em>
          )}
        </span>
      </div>
      <span className="vol-v">
        <b className="num">{unit ? `${doneMin} / ${plannedMin} ${unit}` : `${doneMin} min`}</b>
        <small>
          {note ? (
            note
          ) : cap ? (
            <>
              prévu {cap.planned} ·{' '}
              {cap.status === 'over' ? (
                <span className="w">au-dessus</span>
              ) : (
                <span className="ok">sous le repère</span>
              )}
            </>
          ) : plannedMin ? (
            `prévu ${plannedMin} · pas de repère`
          ) : (
            'hors plan · pas de repère'
          )}
        </small>
      </span>
    </div>
  );
}

const icon = (path: React.ReactNode) => (
  <svg className="vol-svg" viewBox="0 0 24 24" aria-hidden="true">
    {path}
  </svg>
);
const RunIcon = () =>
  icon(
    <>
      <circle cx="15" cy="4.5" r="1.8" />
      <path d="M8 21l3-6 3 2v5M6 11l4-3 4 1 2 4 3 1M11 15l-1-5" />
    </>,
  );
const BikeIcon = () =>
  icon(
    <>
      <circle cx="6" cy="16" r="3.5" />
      <circle cx="18" cy="16" r="3.5" />
      <path d="M6 16l4-7h5l3 7M10 9l2 7h-6M14 5h2l1 4" />
    </>,
  );
const DumbbellIcon = () =>
  icon(
    <>
      <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />
    </>,
  );
const StretchIcon = () =>
  icon(
    <>
      <circle cx="12" cy="4.5" r="1.8" />
      <path d="M4 9l8 1 8-1M12 10v5l-4 6M12 15l4 6" />
    </>,
  );
