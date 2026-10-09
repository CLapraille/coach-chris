import type { CapView, VolumeView } from '@coach-chris/domain';
import { decimal, shortDate } from '../format.ts';

const PARTS = [
  ['run', 'var(--p-run)', 'Course'],
  ['bike', 'var(--p-bike)', 'Vélo'],
  ['strength', 'var(--p-str)', 'Renforcement'],
] as const;

export function VolumeCard({ volume }: { volume: VolumeView }) {
  const { run, total } = volume.cap;
  return (
    <article className="card s5">
      <header>
        <span className="label">Volume par semaine (minutes)</span>
        <span>
          <span className="src garmin">Garmin</span> <span className="src campus">Campus</span>
        </span>
      </header>
      <Chart volume={volume} />
      <div className="legend">
        {PARTS.map(([, color, label]) => (
          <span key={label}>
            <i style={{ background: color }} />
            {label}
          </span>
        ))}
        <span className="muted">Marches exclues</span>
      </div>
      <div className="cap">
        <span className="label">Repère pour cette semaine</span>
        {run || total ? (
          <>
            {run && <CapRow label="Course" cap={run} color="var(--p-run)" />}
            {total && <CapRow label="Total" cap={total} color="var(--p-str)" />}
            <details>
              <summary>Règle</summary>
              Le plan Campus prime. Un dépassement est un point d'attention, pas une interdiction. Repère =
              1,3 × moyenne des 4 semaines complètes précédentes (ratio charge aiguë / chronique)
              {run && `. Course : 1,3 × ${decimal(run.mean)} min`}
              {total && `. Total course + vélo + renforcement : 1,3 × ${decimal(total.mean)} min`}. Marches
              exclues. Une séance validée dans Campus sans montre compte pour sa durée prévue. Repère courant
              en préparation physique, pas une prescription médicale.
            </details>
          </>
        ) : (
          <p className="empty">Pas encore 4 semaines d'historique : pas de repère.</p>
        )}
      </div>
    </article>
  );
}

function CapRow({ label, cap, color }: { label: string; cap: CapView; color: string }) {
  const scale = Math.max(cap.planned, cap.cap) * 1.1 || 1;
  const capMin = Math.round(cap.cap);
  return (
    <div className="cap-row">
      <span>{label}</span>
      <span
        className="cap-bar"
        role="img"
        aria-label={`${label} : prévu ${cap.planned} minutes, repère ${capMin} minutes`}
      >
        <i style={{ width: `${(100 * cap.planned) / scale}%`, background: color }} />
        <em style={{ left: `${(100 * cap.cap) / scale}%` }} />
      </span>
      <span className="cap-v">
        <b className="num">≤ {capMin} min</b> · prévu {cap.planned}{' '}
        {cap.status === 'over' ? (
          <span className="w">au-dessus</span>
        ) : (
          <span className="ok">sous le repère</span>
        )}
      </span>
    </div>
  );
}

function Chart({ volume }: { volume: VolumeView }) {
  const L = 34,
    R = 410,
    T = 12,
    B = 160;
  const totals = volume.weeks.map((w) => w.run + w.bike + w.strength);
  const cap = volume.cap.total?.cap;
  const max = Math.max(60, Math.ceil(Math.max(...totals, cap ?? 0) / 60) * 60);
  const y = (v: number) => B - (v / max) * (B - T);
  const ticks = Array.from({ length: max / 60 + 1 }, (_, i) => i * 60);
  const slot = (R - L) / volume.weeks.length;
  const bw = slot * 0.56;
  const first = volume.weeks[0]?.start;
  return (
    <svg
      className="load"
      viewBox="0 0 420 190"
      role="img"
      aria-label={
        first ? `Minutes d'entraînement par semaine et par sport depuis le ${shortDate(first)}` : ''
      }
    >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={R} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
          <text x={L - 6} y={y(t) + 3} textAnchor="end">
            {t}
          </text>
        </g>
      ))}
      {volume.weeks.map((w, i) => {
        const x = L + i * slot + (slot - bw) / 2;
        const current = i === volume.weeks.length - 1;
        let base = 0;
        return (
          <g key={w.start}>
            {PARTS.map(([key, color, label]) => {
              const v = w[key];
              if (!v) return null;
              const rect = (
                <rect
                  key={key}
                  x={x}
                  y={y(base + v)}
                  width={bw}
                  height={y(base) - y(base + v)}
                  fill={color}
                  rx={1.5}
                >
                  <title>
                    Semaine du {shortDate(w.start)} · {label} : {Math.round(v)} min
                  </title>
                </rect>
              );
              base += v;
              return rect;
            })}
            {current && <rect x={x} y={B - 1} width={bw} height={1} fill="var(--faint)" />}
            <text x={x + bw / 2} y={B + 14} textAnchor="middle">
              {shortDate(w.start)}
            </text>
            {current && (
              <>
                <text x={x + bw / 2} y={B + 26} textAnchor="middle">
                  en cours
                </text>
                {cap !== undefined && (
                  <>
                    <line
                      x1={x - 4}
                      x2={x + bw + 4}
                      y1={y(cap)}
                      y2={y(cap)}
                      stroke="var(--fg)"
                      strokeWidth={1.5}
                      strokeDasharray="3 2"
                    />
                    <text x={x + bw / 2} y={y(cap) - 4} textAnchor="middle">
                      max
                    </text>
                  </>
                )}
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
