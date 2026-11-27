import type { CapView, PlanSource, VolumeView, WeekView } from '@coach-chris/domain';
import { PlanSourceTag } from '../PlanSource.tsx';
import { decimal } from '../format.ts';

/**
 * Volume de la semaine (visuel utilisateur du 09/10) : par ligne, le réalisé (plein), le reste à faire du plan
 * actif (clair, D179) et le repère (trait « max », D90). Le vélo n'a pas de repère : rien n'est inventé pour lui.
 */
export function VolumeCard({
  volume,
  routines,
  source,
}: {
  volume: VolumeView;
  routines: WeekView['routines'];
  /** Plan actif de la semaine ; `null` sans plan. */
  source: PlanSource | null;
}) {
  const { run } = volume.cap;
  const week = volume.weeks.at(-1) ?? { run: 0, bike: 0, strength: 0 };
  // Mobilité : routines cochées sur les 7 jours ; leur durée n'est pas enregistrée. Semaine du plan Claude :
  // la routine du soir est remplacée (D157), seule celle du matin est prévue.
  const days = Object.values(routines);
  const eveningPlanned = source !== 'claude';
  const mobilityDone = days.reduce(
    (n, d) => n + Number(d.morning) + (eveningPlanned ? Number(d.evening) : 0),
    0,
  );
  return (
    <article className="card s7 vol-card">
      <header>
        <span className="label">
          <span className="wide-only">Volume de la semaine (minutes)</span>
          <span className="phone-only">Volume (min)</span>
        </span>
        <span>
          <span className="src garmin">Garmin</span> {source && <PlanSourceTag source={source} />}
        </span>
      </header>
      <div className="vol-rows">
        <Row
          icon={<RunIcon />}
          label="Course"
          parts={[{ minutes: week.run, color: 'var(--run)' }]}
          cap={run}
          remaining={volume.remaining.run}
          plannedColor="color-mix(in srgb, var(--run) 30%, transparent)"
        />
        <Row
          icon={<BikeIcon />}
          label="Vélo"
          parts={[{ minutes: week.bike, color: 'var(--bike)' }]}
          cap={null}
          {...(volume.planned.bike > 0 && { planned: volume.planned.bike })}
          remaining={volume.remaining.bike}
          plannedColor="color-mix(in srgb, var(--bike) 30%, transparent)"
        />
        <Row
          icon={<DumbbellIcon />}
          label="Renforcement"
          parts={[{ minutes: week.strength, color: 'var(--strength)' }]}
          cap={null}
          planned={volume.planned.strength}
          remaining={volume.remaining.strength}
          plannedColor="color-mix(in srgb, var(--strength) 30%, transparent)"
        />
        <Row
          icon={<StretchIcon />}
          label="Mobilité"
          parts={[{ minutes: mobilityDone, color: 'var(--mobility)' }]}
          cap={null}
          planned={days.length * (eveningPlanned ? 2 : 1)}
          plannedColor="color-mix(in srgb, var(--mobility) 25%, transparent)"
          unit="routines"
          note={eveningPlanned ? 'matin et soir' : 'matin'}
        />
      </div>
      <div className="vol-legend">
        <span>
          <i className="done" /> réalisé
        </span>
        <span>
          <i className="plan" /> reste à faire
        </span>
        <span>
          <i className="mark" /> repère
        </span>
        <span className="muted">Marches exclues</span>
      </div>
      {run ? (
        <details className="vol-rule">
          <summary>Règle</summary>
          Le plan prime. Un dépassement est un point d'attention, pas une interdiction. Repère = 1,3 × moyenne
          des 4 semaines complètes précédentes (ratio charge aiguë / chronique)
          {`. Course : 1,3 × ${decimal(run.mean)} min`}. « Sous le repère » ou « au-dessus » compare le prévu
          de la semaine au repère, échauffement et retour au calme compris. Une séance validée dans Campus
          sans montre compte pour sa durée prévue. Repère courant en préparation physique, pas une
          prescription médicale.
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
  remaining,
  plannedColor,
  unit,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  parts: { minutes: number; color: string }[];
  cap: CapView | null;
  /** Prévu sans repère (vélo, renforcement, mobilité). */
  planned?: number;
  /** Minutes des séances qui restent à faire (D179) ; sans elle, prévu − réalisé (mobilité). */
  remaining?: number;
  plannedColor?: string;
  /** Unité autre que les minutes : la ligne affiche « fait / prévu ». */
  unit?: string;
  note?: string;
}) {
  const done = parts.reduce((n, p) => n + p.minutes, 0);
  const plannedMin = cap?.planned ?? plannedOnly;
  // Fin de la barre claire : réalisé + reste à faire (D179), ou le prévu pour les lignes sans séances.
  const planned = remaining !== undefined ? done + remaining : Math.max(plannedMin ?? 0, done);
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
          {(plannedMin !== undefined || remaining) && planned > done && (
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
