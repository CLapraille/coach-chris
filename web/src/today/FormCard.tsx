import type { TodayView, WeighIn } from '@coach-chris/domain';
import { LEVEL_LABEL, READINESS_LABEL, decimal, hoursMinutes, shortDate, signed } from '../format.ts';

const NA = <span className="na">indisponible</span>;

/** Appréciation Garmin du score de sommeil. */
const SLEEP_LABEL: Record<string, string> = {
  EXCELLENT: 'Excellent sommeil',
  GOOD: 'Bon sommeil',
  FAIR: 'Sommeil moyen',
  POOR: 'Sommeil faible',
};

/** Couleur d'état (celle du reste de l'app) d'après le niveau donné par Garmin ; neutre sans niveau. */
function tone(level: string | undefined): string {
  if (!level) return 'var(--muted)';
  if (['PRIME', 'HIGH', 'EXCELLENT', 'GOOD'].includes(level)) return 'var(--good)';
  if (['MODERATE', 'FAIR'].includes(level)) return 'var(--warn)';
  return 'var(--alert)';
}

/**
 * Forme ce matin (visuel de l'utilisateur du 09/10) : Body Battery au réveil, score de sommeil et préparation
 * à l'entraînement en jauges ; VFC des 8 nuits ; poids et récupération. Une donnée absente reste « indisponible ».
 */
export function FormCard({ form }: { form: TodayView['form'] }) {
  const n = form.night;
  const bb = n?.bodyBattery;
  const sleep = n?.sleep;
  const ready = n?.readiness;
  const hrv = n?.hrv;
  const readyDelta =
    ready && form.readinessYesterday !== null ? ready.score - form.readinessYesterday : undefined;
  return (
    <article className="card s7 form-card">
      <header>
        <span className="label">Forme ce matin</span>
        <span className="src garmin">Garmin</span>
      </header>
      <div className="fm-tiles">
        <Tile
          icon={<BatteryIcon />}
          title="Body Battery"
          value={bb?.wake}
          color={tone(bb?.level)}
          aria="Body Battery au réveil"
          sub={bb?.sleepGain !== undefined ? `+${bb.sleepGain} cette nuit` : 'au réveil'}
          note={bb?.level ? `Niveau ${LEVEL_LABEL[bb.level] ?? bb.level}` : undefined}
        />
        <Tile
          icon={<MoonIcon />}
          title="Score de sommeil"
          value={sleep?.score}
          color={tone(sleep?.qualifier)}
          aria="Score de sommeil"
          sub={
            sleep
              ? hoursMinutes(sleep.seconds) +
                (sleep.awakeSeconds ? ` · ${Math.round(sleep.awakeSeconds / 60)} min éveillé` : '')
              : undefined
          }
          note={sleep?.qualifier ? (SLEEP_LABEL[sleep.qualifier] ?? sleep.qualifier) : undefined}
        />
        <Tile
          icon={<RunIcon />}
          title="Préparation à l’entraînement"
          value={ready?.score}
          color={tone(ready?.level)}
          aria="Préparation à l’entraînement"
          sub={
            readyDelta !== undefined ? `${readyDelta === 0 ? '=' : signed(readyDelta, 0)} vs hier` : undefined
          }
          note={ready?.level ? (READINESS_LABEL[ready.level] ?? ready.level) : undefined}
        />
      </div>
      <div className="fm-bottom">
        <section className="fm-box fm-hrv" aria-label="VFC des dernières nuits">
          <div className="fm-title">
            <HeartIcon />
            <span>
              VFC des {form.hrvHistory.length} dernières nuits <span className="muted">(ms)</span>
            </span>
            {hrv && (
              <span className="fm-legend">
                <i /> plage habituelle
              </span>
            )}
          </div>
          <HrvChart history={form.hrvHistory} low={hrv?.baselineLowMs} high={hrv?.baselineHighMs} />
          {hrv?.weeklyAvgMs !== undefined && (
            <span className="muted text-xs">
              Moyenne 7 nuits {hrv.weeklyAvgMs} ms · plage {hrv.baselineLowMs}–{hrv.baselineHighMs} ms
            </span>
          )}
        </section>
        <div className="fm-side">
          <Weight form={form} />
          <section className="fm-box" aria-label="Récupération">
            <div className="fm-title">
              <ClockIcon />
              <span>Récupération</span>
            </div>
            {ready?.recoveryHours !== undefined ? (
              <div className="fm-big">
                <b className="num">{decimal(ready.recoveryHours)} h</b>{' '}
                <span className="muted">restante</span>
              </div>
            ) : (
              NA
            )}
          </section>
        </div>
      </div>
    </article>
  );
}

function Tile({
  icon,
  title,
  value,
  color,
  aria,
  sub,
  note,
}: {
  icon: React.ReactNode;
  title: string;
  value: number | undefined;
  color: string;
  aria: string;
  sub: string | undefined;
  note: string | undefined;
}) {
  return (
    <section className="fm-box fm-tile" aria-label={title}>
      <div className="fm-title">
        {icon}
        <span>{title}</span>
      </div>
      <Ring value={value} color={color} label={aria} />
      {/* Toujours rendus (vides au besoin) : les rangées restent alignées entre tuiles. */}
      <span className="fm-sub">{sub}</span>
      <span className="fm-note" style={{ color }}>
        {note}
      </span>
    </section>
  );
}

const R = 40;
const CIRC = 2 * Math.PI * R;

function Ring({ value, color, label }: { value: number | undefined; color: string; label: string }) {
  return (
    <div
      className="fm-ring"
      role="img"
      aria-label={value === undefined ? `${label} indisponible` : `${label} ${value} sur 100`}
    >
      <svg viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={R} fill="none" stroke="var(--line)" strokeWidth="8" />
        {value !== undefined && (
          <circle
            className="val"
            cx="48"
            cy="48"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - Math.min(100, Math.max(0, value)) / 100)}
          />
        )}
      </svg>
      <div className="v">
        <b className={value === undefined ? 'na' : 'num'}>{value ?? '—'}</b>
        <span>/100</span>
      </div>
    </div>
  );
}

function Weight({ form }: { form: TodayView['form'] }) {
  const w = form.weight;
  return (
    <section className="fm-box" aria-label="Poids">
      <div className="fm-title">
        <ScaleIcon />
        <span>Poids</span>
      </div>
      {w ? (
        <>
          <div className="fm-weight">
            <b className="num fm-big">{decimal(w.latest.kg)} kg</b>
            <WeightLine points={form.weightHistory} />
          </div>
          <span className="fm-sub">
            {w.deltaKg !== undefined && w.direction && w.direction !== 'flat' && (
              <span
                className={`wt ${w.direction}`}
                role="img"
                aria-label={w.direction === 'down' ? 'en baisse' : 'en hausse'}
              >
                <svg viewBox="0 0 10 10" aria-hidden="true">
                  <path d="M5 9 L1 3 H9 Z" />
                </svg>
                {signed(w.deltaKg)} kg
              </span>
            )}{' '}
            <span className="muted">
              pesée du {shortDate(w.latest.day)}
              {w.previous && `, vs ${shortDate(w.previous.day)}`}
            </span>
          </span>
        </>
      ) : (
        NA
      )}
    </section>
  );
}

/** Courbe des pesées (chaque point est une vraie pesée ; rien n'est interpolé entre deux jours sans pesée). */
function WeightLine({ points }: { points: WeighIn[] }) {
  if (points.length < 2) return null;
  const W = 110;
  const H = 30;
  const kgs = points.map((p) => p.kg);
  const lo = Math.min(...kgs);
  const hi = Math.max(...kgs);
  const t0 = Date.parse(points[0]!.day);
  const span = Math.max(1, Date.parse(points.at(-1)!.day) - t0);
  const x = (p: WeighIn) => 2 + ((Date.parse(p.day) - t0) / span) * (W - 4);
  const y = (kg: number) => (hi === lo ? H / 2 : 3 + ((hi - kg) / (hi - lo)) * (H - 6));
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(1)} ${y(p.kg).toFixed(1)}`).join(' ');
  const last = points.at(-1)!;
  return (
    <svg
      className="fm-spark"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${points.length} pesées du ${shortDate(points[0]!.day)} au ${shortDate(last.day)}`}
    >
      <path
        d={d}
        fill="none"
        stroke="var(--fg)"
        strokeWidth={1.4}
        opacity={0.6}
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={x(last)} cy={y(last.kg)} r={2.6} fill="var(--fg)" />
    </svg>
  );
}

/** VFC nocturne et plage habituelle ; une nuit absente reste un trou dans la courbe. */
function HrvChart({
  history,
  low,
  high,
}: {
  history: TodayView['form']['hrvHistory'];
  low: number | undefined;
  high: number | undefined;
}) {
  const values = history.flatMap((h) => (h.ms === null ? [] : [h.ms]));
  if (!values.length) return <p className="empty">Aucune VFC mesurée sur la période.</p>;
  const L = 30,
    Rx = 344,
    T = 18,
    B = 92;
  const min = Math.min(...values, low ?? Infinity) - 8;
  const max = Math.max(...values, high ?? -Infinity) + 8;
  const y = (v: number) => B - ((v - min) / (max - min)) * (B - T);
  const step = (Rx - L) / Math.max(1, history.length - 1);
  const x = (i: number) => L + i * step;
  let d = '';
  let pen = false;
  history.forEach((h, i) => {
    if (h.ms === null) return void (pen = false);
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(h.ms).toFixed(1)} `;
    pen = true;
  });
  const first = history[0]?.day;
  const lastDay = history.at(-1)?.day;
  const lastIndex = history.findLastIndex((h) => h.ms !== null);
  return (
    <svg
      className="fm-chart"
      viewBox="0 0 360 110"
      role="img"
      aria-label={
        first && lastDay ? `VFC nocturne du ${shortDate(first)} au ${shortDate(lastDay)}` : 'VFC nocturne'
      }
    >
      {low !== undefined && high !== undefined && (
        <>
          <rect
            x={L}
            y={y(high)}
            width={Rx - L}
            height={y(low) - y(high)}
            fill="var(--good)"
            opacity={0.12}
          />
          <text x={L - 5} y={y(high) + 3} textAnchor="end">
            {high}
          </text>
          <text x={L - 5} y={y(low) + 3} textAnchor="end">
            {low}
          </text>
        </>
      )}
      <path d={d} fill="none" stroke="var(--good)" strokeWidth={1.8} />
      {history.map((h, i) => {
        const lastPoint = i === lastIndex;
        return (
          <g key={h.day}>
            {h.ms === null ? (
              <text x={x(i)} y={(T + B) / 2} textAnchor="middle">
                —
              </text>
            ) : (
              <>
                <circle
                  cx={x(i)}
                  cy={y(h.ms)}
                  r={lastPoint ? 4.5 : 2.8}
                  fill={low !== undefined && h.ms < low ? 'var(--warn)' : 'var(--good)'}
                >
                  <title>
                    Nuit du {shortDate(h.day)} : {h.ms} ms
                  </title>
                </circle>
                {lastPoint && (
                  <g className="fm-tip">
                    <rect x={x(i) - 46} y={y(h.ms) - 24} width={38} height={16} rx={4} />
                    <text x={x(i) - 27} y={y(h.ms) - 13} textAnchor="middle">
                      {h.ms} ms
                    </text>
                  </g>
                )}
              </>
            )}
            <text x={x(i)} y={106} textAnchor="middle">
              {shortDate(h.day)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const icon = (path: React.ReactNode) => (
  <svg className="fm-icon" viewBox="0 0 24 24" aria-hidden="true">
    {path}
  </svg>
);
const BatteryIcon = () =>
  icon(
    <>
      <rect x="7" y="4" width="10" height="17" rx="2" />
      <path d="M10 2.5h4" />
      <path d="M9.5 15h5M9.5 18h5" />
    </>,
  );
const MoonIcon = () => icon(<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />);
const RunIcon = () =>
  icon(
    <>
      <circle cx="15" cy="4.5" r="1.8" />
      <path d="M8 21l3-6 3 2v5M6 11l4-3 4 1 2 4 3 1M11 15l-1-5" />
    </>,
  );
const HeartIcon = () =>
  icon(
    <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10zM5 12h4l1.5-3 2 6 1.5-3H19" />,
  );
const ScaleIcon = () =>
  icon(
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8.5 9a5 5 0 0 1 7 0L12 12z" />
    </>,
  );
const ClockIcon = () =>
  icon(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>,
  );
