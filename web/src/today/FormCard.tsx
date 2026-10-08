import type { RangePosition, TodayView } from '@coach-chris/domain';
import { LEVEL_LABEL, READINESS_LABEL, decimal, hoursMinutes, shortDate, signed } from '../format.ts';

const NA = <span className="na">indisponible</span>;

const range = (p: RangePosition) =>
  p === 'below' ? 'sous ta plage' : p === 'above' ? 'au-dessus de ta plage' : 'dans ta plage';

export function FormCard({ form }: { form: TodayView['form'] }) {
  const n = form.night;
  const hrv = n?.hrv;
  const w = form.weight;
  return (
    <article className="card s7">
      <header>
        <span className="label">Forme ce matin</span>
        <span className="src">Garmin</span>
      </header>
      <div className="ready">
        <Gauge score={n?.readiness?.score} level={n?.readiness?.level} />
        <dl className="kv">
          <Row k="Sommeil">
            {n?.sleep ? (
              <>
                {n.sleep.score !== undefined && <b className="num">{n.sleep.score}</b>}
                {n.sleep.score !== undefined && ' · '}
                {hoursMinutes(n.sleep.seconds)}
                {n.sleep.awakeSeconds !== undefined &&
                  ` · ${Math.round(n.sleep.awakeSeconds / 60)} min éveillé`}
              </>
            ) : (
              NA
            )}
          </Row>
          <Row k="VFC nuit">
            {hrv?.lastNightMs !== undefined && n?.hrvPosition ? (
              <>
                <b className="num">{hrv.lastNightMs} ms</b> ·{' '}
                <span className={n.hrvPosition.lastNight === 'within' ? '' : 'note'}>
                  {range(n.hrvPosition.lastNight)}
                </span>
              </>
            ) : (
              NA
            )}
          </Row>
          <Row k="VFC 7 j">
            {hrv?.weeklyAvgMs !== undefined && n?.hrvPosition ? (
              <>
                <b className="num">{hrv.weeklyAvgMs} ms</b>{' '}
                <span className={n.hrvPosition.weekly === 'within' ? 'muted' : 'note'}>
                  {range(n.hrvPosition.weekly)} ({hrv.baselineLowMs}–{hrv.baselineHighMs})
                </span>
              </>
            ) : (
              NA
            )}
          </Row>
          <Row k="Body Battery">
            {n?.bodyBattery
              ? [
                  n.bodyBattery.sleepGain !== undefined && `+${n.bodyBattery.sleepGain} cette nuit`,
                  n.bodyBattery.level && `niveau ${LEVEL_LABEL[n.bodyBattery.level] ?? n.bodyBattery.level}`,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : NA}
          </Row>
          <Row k="Stress hier">
            {form.stressYesterday ? (
              <>
                <b className="num">{form.stressYesterday.avg}</b> en moyenne
                {form.stressYesterday.restPercent !== undefined &&
                  ` · ${form.stressYesterday.restPercent} % au repos`}
              </>
            ) : (
              NA
            )}
          </Row>
          <Row k="Récupération">
            {n?.readiness?.recoveryHours !== undefined ? `${n.readiness.recoveryHours} h restante` : NA}
          </Row>
          <Row k="Poids">
            {w ? (
              <>
                <b className="num">{decimal(w.latest.kg)} kg</b>{' '}
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
              </>
            ) : (
              NA
            )}
          </Row>
        </dl>
      </div>
      <div className="hrv">
        <span className="label">VFC des {form.hrvHistory.length} dernières nuits (ms)</span>
        <HrvChart history={form.hrvHistory} low={hrv?.baselineLowMs} high={hrv?.baselineHighMs} />
      </div>
    </article>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const CIRC = 2 * Math.PI * 48;

function Gauge({ score, level }: { score: number | undefined; level: string | undefined }) {
  const color =
    score === undefined
      ? 'var(--faint)'
      : score >= 70
        ? 'var(--good)'
        : score >= 40
          ? 'var(--warn)'
          : 'var(--alert)';
  const label = level ? (READINESS_LABEL[level] ?? level) : '';
  return (
    <div
      className="gauge"
      role="img"
      aria-label={
        score === undefined ? 'Disponibilité indisponible' : `Disponibilité ${score} sur 100, ${label}`
      }
    >
      <svg viewBox="0 0 112 112">
        <circle cx="56" cy="56" r="48" fill="none" stroke="var(--line)" strokeWidth="9" />
        {score !== undefined && (
          <circle
            className="val"
            cx="56"
            cy="56"
            r="48"
            fill="none"
            stroke={color}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - score / 100)}
          />
        )}
      </svg>
      <div className="v">
        <b className={score === undefined ? 'na' : ''}>{score ?? '—'}</b>
        <span style={{ color }}>{score === undefined ? 'Disponibilité' : label}</span>
      </div>
    </div>
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
    R = 336,
    T = 6,
    B = 56;
  const min = Math.min(...values, low ?? Infinity) - 10;
  const max = Math.max(...values, high ?? -Infinity) + 10;
  const y = (v: number) => B - ((v - min) / (max - min)) * (B - T);
  const step = (R - L) / Math.max(1, history.length - 1);
  const x = (i: number) => L + i * step;
  let d = '';
  let pen = false;
  history.forEach((h, i) => {
    if (h.ms === null) return void (pen = false);
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(h.ms).toFixed(1)} `;
    pen = true;
  });
  const first = history[0]?.day;
  const last = history.at(-1)?.day;
  return (
    <svg
      viewBox="0 0 360 74"
      role="img"
      aria-label={
        first && last ? `VFC nocturne du ${shortDate(first)} au ${shortDate(last)}` : 'VFC nocturne'
      }
    >
      {values.length > 0 && low !== undefined && high !== undefined && (
        <>
          <rect x={L} y={y(high)} width={R - L} height={y(low) - y(high)} fill="var(--good)" opacity={0.13} />
          <text x={L - 5} y={y(high) + 3} textAnchor="end">
            {high}
          </text>
          <text x={L - 5} y={y(low) + 3} textAnchor="end">
            {low}
          </text>
        </>
      )}
      <path d={d} fill="none" stroke="var(--fg)" strokeWidth={1.5} opacity={0.7} />
      {history.map((h, i) => {
        const lastPoint = i === history.length - 1;
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
                  r={lastPoint ? 4 : 2.6}
                  fill={low !== undefined && h.ms < low ? 'var(--warn)' : 'var(--good)'}
                >
                  <title>
                    Nuit du {shortDate(h.day)} : {h.ms} ms
                  </title>
                </circle>
                {lastPoint && (
                  <text x={x(i) - 8} y={y(h.ms) - 7} textAnchor="end">
                    {h.ms} ms
                  </text>
                )}
              </>
            )}
            {(i % 2 === 0 || lastPoint) && (
              <text x={x(i)} y={71} textAnchor="middle">
                {shortDate(h.day)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
