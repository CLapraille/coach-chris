import {
  FEEL_LABEL,
  FEEL_VALUES,
  type ActionRequest,
  type ActivityDetail,
  type ClaudeContent,
  type Annotation,
  type LapView,
  type SessionView,
  type StepIssue,
  type StepResult,
} from '@coach-chris/domain';
import { useState } from 'react';
import { PlanSourceTag } from '../PlanSource.tsx';
import { ClaudePlan } from './ClaudePlan.tsx';
import { ActionDialog } from '../actions/ActionDialog.tsx';
import { useApi } from '../api.ts';
import {
  SPORT_COLOR,
  SPORT_LABEL,
  clock,
  decimal,
  longDate,
  parisDay,
  sessionShort,
  shortDate,
  stepDuration,
} from '../format.ts';
import { DoseText } from '../Dose.tsx';
import { Loading } from '../Loading.tsx';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const pace = (mps: number | undefined) => {
  if (!mps) return '—';
  const s = Math.round(1000 / mps);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const ISSUE: Record<StepIssue, string> = {
  'too-short': 'trop court',
  'too-long': 'trop long',
  'hr-too-high': 'FC au-dessus du plafond',
  walked: 'marché au lieu de courir',
  ran: 'couru au lieu de marcher',
  'mostly-stopped': "surtout à l'arrêt",
  missing: 'étape absente',
};
const TE_LABEL: Record<string, string> = {
  RECOVERY: 'récupération',
  AEROBIC_BASE: 'aérobie · fond',
  TEMPO: 'tempo',
  LACTATE_THRESHOLD: 'seuil',
  VO2MAX: 'VO2max',
  ANAEROBIC_CAPACITY: 'anaérobie',
  SPEED: 'vitesse',
};
/** Ressenti Garmin (0–100) en mots. */
const feelLabel = (v: number) =>
  v <= 12 ? 'très faible' : v <= 37 ? 'faible' : v <= 62 ? 'normal' : v <= 87 ? 'fort' : 'très fort';

export function SessionDetail({ sessionKey, onBack }: { sessionKey: string; onBack: () => void }) {
  const res = useApi<SessionView>(`/sessions/${encodeURIComponent(sessionKey)}`);
  if (res.state === 'loading') return <Loading />;
  if (res.state === 'error') {
    return (
      <div className="session-screen">
        <Crumb onBack={onBack} />
        <p className="empty" role="alert">
          {res.error.message}
        </p>
      </div>
    );
  }
  return <Detail view={res.data} onBack={onBack} reload={res.reload} />;
}

function Crumb({ onBack, weekStart, day }: { onBack: () => void; weekStart?: string; day?: string | null }) {
  return (
    <div className="crumb">
      <button type="button" onClick={onBack}>
        ‹ Retour
      </button>
      {weekStart && ` · Semaine du ${shortDate(weekStart)}`}
      {day && ` › ${longDate(day)}`}
    </div>
  );
}

function Detail({ view, onBack, reload }: { view: SessionView; onBack: () => void; reload: () => void }) {
  const { session: s, activity: a, deviation: d } = view;
  const [action, setAction] = useState<ActionRequest | null>(null);
  const short = sessionShort(s.name);
  const day = s.match?.day ?? s.day;
  const fromClaude = !!view.claude;
  const badge = fromClaude
    ? s.match
      ? { cls: 'ok', text: 'Faite · activité Garmin rattachée' }
      : { cls: '', text: 'À faire' }
    : s.status === 'done'
      ? { cls: 'ok', text: 'Faite · validée dans Campus' }
      : s.match
        ? { cls: 'warn', text: 'Rattachée à une activité · pas encore validée dans Campus' }
        : s.status === 'skipped'
          ? { cls: '', text: 'Sautée' }
          : { cls: '', text: 'À faire' };
  const blocksLabel = view.blocks
    .map((b) => {
      const steps = b.steps.map((st) => `${stepDuration(st.seconds)} ${st.name.toLowerCase()}`).join(' + ');
      return b.repeat > 1 ? `${b.repeat} × (${steps})` : steps;
    })
    .join(', ');

  return (
    <section className="session-screen" aria-labelledby="session-title">
      <Crumb onBack={onBack} weekStart={view.weekStart} day={day} />
      <div className="head" style={{ '--c': SPORT_COLOR[s.sport] } as React.CSSProperties}>
        <div>
          <h1 id="session-title">
            {s.displayName}
            {short && ` · ${short}`}
          </h1>
          <div className="sub">
            {[
              day && longDate(day),
              a && a.startLocal.slice(11, 16),
              a?.name,
              `${SPORT_LABEL[s.sport].toLowerCase()} · ${s.durationMin} min prévues`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        <div className="badges">
          <span className={`badge ${badge.cls}`}>{badge.text}</span>
          <PlanSourceTag source={fromClaude ? 'claude' : 'campus'} />
          {a && <span className="src garmin">Garmin</span>}
        </div>
      </div>

      {view.claude && (
        <ClaudePlan
          content={view.claude}
          checkin={view.checkin}
          today={parisDay(new Date().toISOString())}
          onChanged={reload}
        />
      )}

      <section className="card" aria-label="Prévu vs réalisé">
        <header>
          <span className="label">Prévu vs réalisé</span>
          {blocksLabel && (
            <span className="muted text-[12.5px]">
              <DoseText text={blocksLabel} />
            </span>
          )}
        </header>
        {a ? (
          <Summary view={view} activity={a} />
        ) : (
          <p className="empty">
            {view.activityError
              ? `Activité rattachée, mais son détail n'a pas pu être lu : ${view.activityError}`
              : s.status === 'done' && !fromClaude
                ? 'Séance validée dans Campus sans activité Garmin : pas de mesure à comparer.'
                : 'Pas encore faite.'}
            {view.description && ` ${view.description}`}
          </p>
        )}
      </section>

      {d && a && <Intervals view={view} activity={a} />}

      {a && (a.laps.length > 0 || a.zones.length > 0) && (
        <div className="two">
          {a.laps.length > 0 && (
            <section className="card" aria-label="Fréquence cardiaque par tour">
              <header>
                <span className="label">FC par tour (bpm)</span>
                <span className="src garmin">Garmin</span>
              </header>
              <HrChart laps={a.laps} steps={d?.steps} cap={view.rules.runMaxHr} />
              <span className="muted text-xs">Moyennes par tour.</span>
            </section>
          )}
          {a.zones.length > 0 && <Zones zones={a.zones} />}
        </div>
      )}

      {view.coachAdvice && (
        <section className="card">
          <details className="coach">
            <summary>
              <span className="label">Conseil du coach</span>
            </summary>
            <p className="advice">« {view.coachAdvice} »</p>
          </details>
        </section>
      )}

      <section className="card" aria-label="Actions">
        <header>
          <span className="label">Actions</span>
        </header>
        <div className="acts">
          {view.claude ? (
            <ClaudeAct view={view} content={view.claude} onAct={setAction} />
          ) : (
            <>
              <CampusAct view={view} onAct={setAction} />
              {view.garminLog && <GarminLog status={view.garminLog} />}
              {s.sport === 'run' && s.status === 'todo' && !s.match && (
                <WatchAct view={view} onAct={setAction} />
              )}
            </>
          )}
          {a && <AnnotateAct activity={a} onAct={setAction} />}
        </div>
      </section>
      {action && <ActionDialog request={action} onClose={() => setAction(null)} onDone={reload} />}
    </section>
  );
}

function Summary({ view, activity: a }: { view: SessionView; activity: ActivityDetail }) {
  const d = view.deviation;
  const inWorkout = d ? d.steps.flatMap((st) => (st.lap ? [st.lap as LapView] : [])) : a.laps;
  const doneS = d ? inWorkout.reduce((n, l) => n + l.durationS, 0) : a.durationS;
  const planned = view.session.durationMin * 60;
  const gap = planned ? doneS / planned - 1 : 0;
  const dist = d ? inWorkout.reduce((n, l) => n + (l.distanceM ?? 0), 0) : (a.distanceM ?? 0);
  const afterLaps = d ? a.laps.slice(a.laps.findLastIndex((l) => l.workoutStepIndex !== undefined) + 1) : [];
  return (
    <>
      <div className="pva">
        <div className="pv">
          <span className="label">Séance</span>
          <b>{mmss(doneS)}</b>
          <small className={Math.abs(gap) <= view.rules.durationTolerance ? 'ok' : 'w'}>
            prévu {mmss(planned)} ·{' '}
            {Math.abs(gap) < 0.01 ? 'exact' : `${gap > 0 ? '+' : '−'}${Math.round(Math.abs(gap) * 100)} %`}
          </small>
        </div>
        {d && (
          <div className="pv">
            <span className="label">Étapes</span>
            <b>
              {d.compliantCount}/{d.steps.length}
            </b>
            <small>conformes</small>
          </div>
        )}
        {dist > 0 && (
          <div className="pv">
            <span className="label">Distance</span>
            <b>{decimal(dist / 1000, 2)} km</b>
            <small>{d ? 'pendant la séance' : 'activité entière'}</small>
          </div>
        )}
        {a.avgHr !== undefined && (
          <div className="pv">
            <span className="label">FC moyenne</span>
            <b>{a.avgHr}</b>
            <small>
              {a.maxHr !== undefined && `max ${a.maxHr} · `}plafond course {view.rules.runMaxHr}
            </small>
          </div>
        )}
        {a.trainingEffect !== undefined && (
          <div className="pv">
            <span className="label">Training Effect</span>
            <b>{decimal(a.trainingEffect)}</b>
            <small>
              {a.trainingEffectLabel ? (TE_LABEL[a.trainingEffectLabel] ?? a.trainingEffectLabel) : 'aérobie'}
            </small>
          </div>
        )}
        {a.trainingLoad !== undefined && (
          <div className="pv">
            <span className="label">Charge</span>
            <b>{a.trainingLoad}</b>
            <small>Garmin{a.avgPowerW !== undefined && ` · puissance moy. ${a.avgPowerW} W`}</small>
          </div>
        )}
      </div>
      {afterLaps.length > 0 && (
        <div className="after">
          Après la séance : <b>{mmss(afterLaps.reduce((n, l) => n + l.durationS, 0))}</b>
          {afterLaps.some((l) => l.distanceM) &&
            ` (${decimal(afterLaps.reduce((n, l) => n + (l.distanceM ?? 0), 0) / 1000, 2)} km)`}
          . Non compté comme écart. Total enregistré {mmss(a.durationS)}
          {a.distanceM !== undefined && `, ${decimal(a.distanceM / 1000, 2)} km`}.
        </div>
      )}
    </>
  );
}

const stepLabel = (st: StepResult, steps: StepResult[]) => {
  const kind = st.planned.kind;
  const nth = steps.slice(0, st.n).filter((x) => x.planned.kind === kind).length;
  return `${kind === 'run' ? 'Course' : kind === 'walk' ? 'Marche' : 'Étape'} ${nth}`;
};

/** La mesure qui justifie l'écart : cadence pour marche / course, FC pour le plafond, durée sinon. */
function evidence(st: StepResult): string {
  const l = st.lap;
  if (!l) return '';
  const parts = [
    (st.issues.includes('ran') || st.issues.includes('walked')) &&
      l.avgCadence !== undefined &&
      `cadence ${l.avgCadence}`,
    st.issues.includes('hr-too-high') && l.avgHr !== undefined && `FC ${l.avgHr}`,
    (st.issues.includes('too-short') || st.issues.includes('too-long')) &&
      `${mmss(l.durationS)} pour ${mmss(st.planned.durationS)}`,
  ].filter(Boolean);
  return parts.length ? ` (${parts.join(', ')})` : '';
}

function Intervals({ view, activity: a }: { view: SessionView; activity: ActivityDetail }) {
  const d = view.deviation!;
  const total = a.laps.reduce((n, l) => n + l.durationS, 0) || 1;
  const plannedTotal = d.steps.reduce((n, st) => n + st.planned.durationS, 0);
  const afterLaps = a.laps.slice(a.laps.findLastIndex((l) => l.workoutStepIndex !== undefined) + 1);
  const runs = d.steps.filter((st) => st.planned.kind === 'run');
  const walks = d.steps.filter((st) => st.planned.kind === 'walk');
  const bad = d.steps.filter((st) => !st.compliant);
  const stopped = d.steps.filter((st) => st.issues.includes('mostly-stopped'));
  const cls = (st: StepResult) =>
    `${st.planned.kind}${st.compliant ? '' : ' bad'}${st.issues.includes('mostly-stopped') ? ' paused' : ''}`;
  return (
    <section className="card" aria-label="Respect des intervalles">
      <header>
        <span className="label">Respect des intervalles</span>
        <span className="src calc">Calculé</span>
      </header>
      <div className="tl">
        <span className="k">Prévu</span>
        <div
          className="bar"
          role="img"
          aria-label={`Prévu : ${d.steps.length} étapes, ${mmss(plannedTotal)}`}
        >
          {d.steps.map((st) => (
            <i key={st.n} className={st.planned.kind} style={{ flex: st.planned.durationS / total }} />
          ))}
          {total > plannedTotal && <i className="empty" style={{ flex: (total - plannedTotal) / total }} />}
        </div>
        <span className="k">Réalisé</span>
        <div
          className="bar"
          role="img"
          aria-label={`Réalisé : ${d.compliantCount} étapes conformes sur ${d.steps.length}`}
        >
          {d.steps.map((st) =>
            st.lap ? (
              <i
                key={st.n}
                className={cls(st)}
                style={{ flex: st.lap.durationS / total }}
                title={`${stepLabel(st, d.steps)} · ${mmss(st.lap.durationS)}${st.lap.avgHr ? ` · FC ${st.lap.avgHr}` : ''}`}
              />
            ) : null,
          )}
          {afterLaps.map((l) => (
            <i
              key={`a${l.n}`}
              className="after"
              style={{ flex: l.durationS / total }}
              title={`Après la séance · ${mmss(l.durationS)}`}
            />
          ))}
        </div>
        <span />
        <div className="axis">
          <span>0′</span>
          <span>{mmss(total)}</span>
        </div>
      </div>
      <div className="verdict">
        {runs.length > 0 && (
          <span>
            <span className="sw" style={{ background: 'var(--p-run)' }} />
            Course :{' '}
            <b>
              {runs.filter((st) => st.compliant).length}/{runs.length}
            </b>{' '}
            dans le temps et sous {view.rules.runMaxHr} bpm
          </span>
        )}
        {walks.length > 0 && (
          <span>
            <span className="sw" style={{ background: 'var(--p-walk)' }} />
            Marche :{' '}
            <b>
              {walks.filter((st) => st.compliant).length}/{walks.length}
            </b>
          </span>
        )}
        {bad.map((st) => (
          <span key={st.n} className="w">
            {stepLabel(st, d.steps)} :{' '}
            {st.issues
              .filter((i) => i !== 'mostly-stopped')
              .map((i) => ISSUE[i])
              .join(', ')}
            {evidence(st)}
          </span>
        ))}
        {stopped.map((st) => (
          <span key={`s${st.n}`} className="muted">
            {stepLabel(st, d.steps)} : surtout à l'arrêt ({st.lap?.movingS} s en mouvement)
          </span>
        ))}
      </div>
      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th>Étape</th>
              <th className="r">Prévu</th>
              <th className="r">Réalisé</th>
              <th className="r">Allure</th>
              <th className="r">FC moy / max</th>
              <th className="r">Cadence</th>
              <th className="r">Puissance</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {d.steps.map((st) => {
              const l = st.lap as LapView | undefined;
              return (
                <tr
                  key={st.n}
                  className={!st.compliant ? 'flag' : st.planned.kind !== 'run' ? 'walkrow' : ''}
                >
                  <td>
                    <span
                      className="sw"
                      style={{ background: st.planned.kind === 'run' ? 'var(--p-run)' : 'var(--p-walk)' }}
                    />
                    {stepLabel(st, d.steps)}
                  </td>
                  <td className="r">{mmss(st.planned.durationS)}</td>
                  <td className="r">{l ? mmss(l.durationS) : '—'}</td>
                  <td className="r">{pace(l?.speedMps)}</td>
                  <td className="r">{l?.avgHr !== undefined ? `${l.avgHr} / ${l.maxHr ?? '—'}` : '—'}</td>
                  <td className="r">{l?.avgCadence ?? '—'}</td>
                  <td className="r">{l?.powerW !== undefined ? `${l.powerW} W` : '—'}</td>
                  <td>
                    {st.compliant
                      ? st.issues.includes('mostly-stopped')
                        ? "conforme · surtout à l'arrêt"
                        : 'conforme'
                      : st.issues.map((i) => ISSUE[i]).join(', ')}
                  </td>
                </tr>
              );
            })}
            {afterLaps.map((l) => (
              <tr key={`a${l.n}`} className="walkrow">
                <td>
                  <span className="sw" style={{ background: 'var(--p-after)' }} />
                  Après
                </td>
                <td className="r">—</td>
                <td className="r">{mmss(l.durationS)}</td>
                <td className="r">{pace(l.speedMps)}</td>
                <td className="r">{l.avgHr !== undefined ? `${l.avgHr} / ${l.maxHr ?? '—'}` : '—'}</td>
                <td className="r">{l.avgCadence ?? '—'}</td>
                <td className="r">{l.powerW !== undefined ? `${l.powerW} W` : '—'}</td>
                <td>après la séance</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="rule">
        <summary>Règles</summary>
        Course : durée ±{Math.round(view.rules.durationTolerance * 100)} %, FC moyenne ≤ {view.rules.runMaxHr}{' '}
        bpm (haut de ta zone 2 Garmin course), cadence de course. Marche : durée ±
        {Math.round(view.rules.durationTolerance * 100)} %, cadence &lt; {view.rules.cadenceRunMin} pas/min.
        Les tours enregistrés après la dernière étape du programme sont « après la séance ».
      </details>
    </section>
  );
}

function HrChart({ laps, steps, cap }: { laps: LapView[]; steps: StepResult[] | undefined; cap: number }) {
  const L = 34,
    R = 510,
    T = 10,
    B = 140;
  const hrs = laps.flatMap((l) => (l.avgHr === undefined ? [] : [l.avgHr]));
  if (!hrs.length) return <p className="empty">Pas de FC par tour.</p>;
  const lo = Math.floor((Math.min(...hrs) - 10) / 10) * 10;
  const hi = Math.ceil((Math.max(...hrs, cap) + 5) / 10) * 10;
  const y = (v: number) => B - ((v - lo) / (hi - lo)) * (B - T);
  const total = laps.reduce((n, l) => n + l.durationS, 0) || 1;
  const kindOf = (l: LapView) => {
    if (l.workoutStepIndex === undefined) return 'after';
    const st = steps?.find((s) => (s.lap as LapView | undefined)?.n === l.n);
    return st ? { kind: st.planned.kind, ok: st.compliant } : { kind: 'run', ok: true };
  };
  const ticks = Array.from({ length: Math.floor((hi - lo) / 20) + 1 }, (_, i) => lo + i * 20);
  let t0 = 0;
  return (
    <svg
      viewBox="0 0 520 170"
      role="img"
      aria-label={`FC moyenne de chaque tour, avec le plafond de ${cap} bpm`}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={R} y1={y(t)} y2={y(t)} stroke="var(--line)" />
          <text x={L - 6} y={y(t) + 3} textAnchor="end">
            {t}
          </text>
        </g>
      ))}
      <line x1={L} x2={R} y1={y(cap)} y2={y(cap)} stroke="var(--warn)" strokeDasharray="4 3" opacity={0.8} />
      <text x={R} y={y(cap) - 4} textAnchor="end">
        plafond course {cap}
      </text>
      {laps.map((l) => {
        const x1 = L + (t0 / total) * (R - L);
        t0 += l.durationS;
        const x2 = L + (t0 / total) * (R - L);
        if (l.avgHr === undefined) return null;
        const k = kindOf(l);
        const kind = typeof k === 'string' ? k : k.kind;
        const fill = kind === 'run' ? 'var(--p-run)' : kind === 'walk' ? 'var(--p-walk)' : 'var(--p-after)';
        return (
          <rect
            key={l.n}
            x={x1 + 0.5}
            y={y(l.avgHr)}
            width={Math.max(1, x2 - x1 - 1)}
            height={B - y(l.avgHr)}
            fill={fill}
            rx={1}
            {...(typeof k !== 'string' && !k.ok && { stroke: 'var(--warn)' })}
          >
            <title>
              Tour {l.n} : {l.avgHr} bpm
            </title>
          </rect>
        );
      })}
      <text x={L} y={B + 14} textAnchor="start">
        0′
      </text>
      <text x={R} y={B + 14} textAnchor="end">
        {mmss(total)}
      </text>
    </svg>
  );
}

function Zones({ zones }: { zones: ActivityDetail['zones'] }) {
  const sorted = [...zones].sort((a, b) => a.zone - b.zone);
  const range = (i: number) => {
    const next = sorted[i + 1];
    return next ? `${sorted[i]!.lowBpm}–${next.lowBpm - 1}` : `≥ ${sorted[i]!.lowBpm}`;
  };
  return (
    <section className="card" aria-label="Zones de fréquence cardiaque">
      <header>
        <span className="label">Zones FC</span>
        <span className="src garmin">Garmin</span>
      </header>
      <div className="zbar" role="img" aria-label="Temps passé dans chaque zone">
        {sorted.map((z) =>
          z.seconds ? (
            <i
              key={z.zone}
              style={{ flex: z.seconds, background: `var(--z${z.zone})` }}
              title={`Z${z.zone} : ${mmss(z.seconds)}`}
            />
          ) : null,
        )}
      </div>
      <div className="zl">
        {sorted.map((z, i) => (
          <div key={z.zone}>
            <span className="sw" style={{ background: `var(--z${z.zone})` }} />
            <span>Z{z.zone}</span>
            <span>{range(i)} bpm</span>
            <span className="num">{z.seconds ? mmss(z.seconds) : '—'}</span>
          </div>
        ))}
      </div>
      <span className="muted text-xs">Temps sous la zone 1 non fourni par Garmin.</span>
    </section>
  );
}

type OnAct = (r: ActionRequest) => void;

/** Valider dans Campus (D125) : une course rattachée à une activité Garmin, pas encore validée. */
function CampusAct({ view, onAct }: { view: SessionView; onAct: OnAct }) {
  const s = view.session;
  const activityId = s.match?.activityId;
  const can = s.status === 'todo' && s.sport === 'run' && !!activityId;
  const text =
    s.status === 'done'
      ? `Séance déjà validée${s.match ? ` le ${shortDate(s.match.day)}` : ''}.`
      : s.sport !== 'run'
        ? 'Depuis l’app, seules les courses se valident : valide cette séance dans Campus.'
        : activityId
          ? `La course du ${shortDate(s.match!.day)} est rattachée à cette séance. Ses chiffres (distance, durée, FC…) partiront vers Campus après aperçu.`
          : 'Possible une fois la séance faite et son activité Garmin rattachée.';
  return (
    <div className="act">
      <h3>Campus Coach</h3>
      <p>{text}</p>
      <button
        className="btn"
        type="button"
        disabled={!can}
        onClick={() => onAct({ type: 'campus.complete', sessionKey: s.key })}
      >
        Valider dans Campus
      </button>
    </div>
  );
}

/** Renforcement → activité « Musculation » dans Garmin (D148) : où en est la création automatique (D152). */
function GarminLog({ status }: { status: NonNullable<SessionView['garminLog']> }) {
  const text =
    status.state === 'planned'
      ? 'Une fois la séance validée dans Campus, une activité « Musculation » est créée dans Garmin (1 h après, si la montre n’en a pas enregistré).'
      : status.state === 'waiting'
        ? `Activité « Musculation » créée dans Garmin à la première ouverture de l’app après ${clock(status.after)} (délai laissé à une activité de la montre).`
        : status.state === 'created'
          ? `Activité « ${status.name} » créée dans Garmin.`
          : status.state === 'linked'
            ? 'Activité de renforcement présente dans Garmin et rattachée à la séance.'
            : status.state === 'failed'
              ? `Création dans Garmin abandonnée après 3 essais : ${status.message}`
              : 'Validée avant la mise en service de la création automatique : rien n’est créé dans Garmin.';
  return (
    <div className="act">
      <h3>Garmin</h3>
      <p className={status.state === 'failed' ? 'text-alert' : undefined}>{text}</p>
    </div>
  );
}

/** Envoyer sur la montre (D126) : workout « CC · » planifié au jour placé de la séance. */
function WatchAct({ view, onAct }: { view: SessionView; onAct: OnAct }) {
  const s = view.session;
  const text = s.pushed
    ? `Envoyée le ${shortDate(s.pushed.at.slice(0, 10))} pour le ${shortDate(s.pushed.date)}. Un nouvel envoi remplace l’ancien.`
    : s.day
      ? `Sera planifiée dans le calendrier Garmin pour ${longDate(s.day).toLowerCase()}, sans cible d’allure.`
      : 'Aucun jour à venir pour cette séance dans le calendrier.';
  return (
    <div className="act">
      <h3>Montre</h3>
      <p>{text}</p>
      <button
        className="btn"
        type="button"
        disabled={!s.day}
        onClick={() => onAct({ type: 'garmin.push', sessionKey: s.key })}
      >
        {s.pushed ? 'Renvoyer sur la montre' : 'Envoyer sur la montre'}
      </button>
    </div>
  );
}

/** Annoter dans Garmin (D127) : seuls les champs modifiés partent, après aperçu. */
function AnnotateAct({ activity: a, onAct }: { activity: ActivityDetail; onAct: OnAct }) {
  const [rpe, setRpe] = useState(a.rpe !== undefined ? String(a.rpe / 10) : '');
  const [feel, setFeel] = useState(a.feel !== undefined ? String(a.feel) : '');
  const [description, setDescription] = useState(a.description ?? '');
  const submit = () => {
    const changes: Annotation = {};
    if (rpe) changes.rpe = Number(rpe);
    if (feel) changes.feel = Number(feel) as NonNullable<Annotation['feel']>;
    if (description !== (a.description ?? '')) changes.description = description;
    onAct({ type: 'garmin.annotate', activityId: a.id, changes });
  };
  return (
    <div className="act">
      <h3>Annotation Garmin</h3>
      <div className="kvs">
        <span>
          Effort perçu <b>{a.rpe !== undefined ? `${a.rpe / 10}/10` : '—'}</b>
        </span>
        <span>
          Ressenti <b>{a.feel !== undefined ? feelLabel(a.feel) : '—'}</b>
        </span>
      </div>
      <div className="annot">
        <label>
          Effort perçu
          <select value={rpe} onChange={(e) => setRpe(e.target.value)}>
            <option value="">—</option>
            {Array.from({ length: 10 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}/10
              </option>
            ))}
          </select>
        </label>
        <label>
          Ressenti
          <select value={feel} onChange={(e) => setFeel(e.target.value)}>
            <option value="">—</option>
            {FEEL_VALUES.map((v) => (
              <option key={v} value={v}>
                {FEEL_LABEL[v]}
              </option>
            ))}
          </select>
        </label>
        <label className="wide">
          Notes
          <textarea
            rows={2}
            value={description}
            maxLength={2000}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>
      <button className="btn" type="button" onClick={submit}>
        Annoter dans Garmin
      </button>
    </div>
  );
}

/**
 * Séance du plan Claude (D160) : course et renforcement partent sur la montre, le vélo dans MyWhoosh,
 * toujours dans le sport choisi pour le jour ; la mobilité reste dans l’app. Le rameur ne s’envoie pas
 * (D163) : Garmin n’a pas d’entraînement rameur, l’activité serait enregistrée en cardio.
 */
function ClaudeAct({ view, content, onAct }: { view: SessionView; content: ClaudeContent; onAct: OnAct }) {
  const s = view.session;
  const sport = content.variants[0]!.sport;
  const done = !!s.match;
  if (sport === 'rameur')
    return (
      <div className="act">
        <h3>Montre</h3>
        <p>
          Rien à envoyer : lance l’activité « Rameur d’intérieur » sur la montre et suis la séance
          {content.variants[0]!.kinomap ? ' Kinomap indiquée plus haut' : ' décrite plus haut'}.
        </p>
      </div>
    );
  if (sport === 'mobilite')
    return (
      <div className="act">
        <h3>Montre</h3>
        <p>Séance de mobilité : elle se suit dans l’app, rien à envoyer.</p>
      </div>
    );
  if (sport === 'velo')
    return (
      <div className="act">
        <h3>MyWhoosh</h3>
        <p>
          {done
            ? 'Séance déjà faite.'
            : 'Met la séance dans tes workouts personnalisés MyWhoosh (préfixe « CC · »), puissances en % de ta FTP. Elle remplace la séance CoachChris précédente : un seul emplacement, un seul slot credit. Une fois roulée, importe la sortie dans Garmin.'}
        </p>
        <div className="act-row">
          <button
            className="btn"
            type="button"
            disabled={done}
            onClick={() => onAct({ type: 'mywhoosh.upload', sessionKey: s.key })}
          >
            Envoyer dans MyWhoosh
          </button>
          {!done && (
            <button className="btn" type="button" onClick={() => onAct({ type: 'mywhoosh.import' })}>
              Importer la sortie dans Garmin
            </button>
          )}
        </div>
      </div>
    );
  const text = done
    ? 'Séance déjà faite.'
    : s.pushed
      ? `Envoyée le ${shortDate(s.pushed.at.slice(0, 10))} pour le ${shortDate(s.pushed.date)}. Un nouvel envoi remplace l’ancien.`
      : s.day
        ? `Sera planifiée dans le calendrier Garmin pour ${longDate(s.day).toLowerCase()}, échauffement terminé par Tour.`
        : 'Aucun jour à venir pour cette séance dans le calendrier.';
  return (
    <div className="act">
      <h3>Montre</h3>
      <p>{text}</p>
      <button
        className="btn"
        type="button"
        disabled={done || !s.day}
        onClick={() => onAct({ type: 'garmin.push', sessionKey: s.key })}
      >
        {s.pushed ? 'Renvoyer sur la montre' : 'Envoyer sur la montre'}
      </button>
    </div>
  );
}
