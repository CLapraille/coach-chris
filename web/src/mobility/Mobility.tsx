import {
  addDays,
  EXERCISES,
  exercise,
  type MobilityView,
  type PlanWeekRoutines,
  type RoutineItemView,
  type Side,
  type Slot,
} from '@coach-chris/domain';
import { useEffect, useRef, useState } from 'react';
import { api, useApi } from '../api.ts';
import { Inbox } from './Inbox.tsx';
import { longDate, mmss, shortDate } from '../format.ts';
import { Figure } from './Figure.tsx';
import { Guide } from './Guide.tsx';
import { TestForm } from './TestForm.tsx';
import { formatResult, TESTS } from './tests.ts';
import { Loading } from '../Loading.tsx';

const total = (items: RoutineItemView[]) => items.reduce((s, i) => s + i.durationS * (i.perSide ? 2 : 1), 0);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const firstSentence = (s: string) => s.split(/(?<=\.)\s/)[0] ?? s;

const STATUS_LABEL: Record<string, string> = {
  priority: 'priorité',
  weak: 'faible',
  watch: 'à surveiller',
  good: 'bon',
  declared: 'déclarée',
  untested: 'non testé',
};

/** `startTesting` : ouvert depuis le lien « Faire les tests » d'Aujourd'hui, le formulaire est déjà affiché. */
export function Mobility({ startTesting = false }: { startTesting?: boolean }) {
  const res = useApi<MobilityView>('/mobility');
  if (res.state === 'loading') return <Loading />;
  if (res.state === 'error') {
    return (
      <p className="empty" role="alert">
        {res.error.message}
      </p>
    );
  }
  return <Screen view={res.data} reload={res.reload} startTesting={startTesting} />;
}

function Screen({
  view,
  reload,
  startTesting,
}: {
  view: MobilityView;
  reload: () => void;
  startTesting: boolean;
}) {
  const [guide, setGuide] = useState<Slot | null>(null);
  const [testing, setTesting] = useState(startTesting);
  // Le formulaire s'ouvre dans la carte Auto-tests, plus bas dans la page : on l'amène à l'écran,
  // sinon le bouton semble ne rien faire (retour du 12/10).
  const testsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (testing) testsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [testing]);
  const [error, setError] = useState<string | null>(null);
  const b = view.block;

  const call = async (path: string, init: RequestInit) => {
    setError(null);
    try {
      await api(path, init);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const check = (slot: Slot, done: boolean) =>
    call(`/mobility/log/${view.today}/${slot}`, { method: 'PUT', body: JSON.stringify({ done }) });
  const accept = () =>
    call('/mobility/blocks/accept', {
      method: 'POST',
      body: JSON.stringify({ codes: view.proposal!.map((p) => p.code) }),
    });

  return (
    <section className="mob-screen" aria-labelledby="mob-title">
      <div className="head">
        <div>
          <h1 id="mob-title">Mobilité</h1>
          <div className="sub">
            {longDate(view.today)} ·{' '}
            {b
              ? `bloc en cours, jour ${daysBetween(b.start, view.today) + 1} sur ${daysBetween(b.start, b.end) + 1}`
              : 'aucun bloc en cours'}
          </div>
        </div>
      </div>
      {error && (
        <p className="text-alert" role="alert">
          {error}
        </p>
      )}
      <div className="grid">
        <article className="card s7">
          <header>
            <span className="label">Aujourd'hui</span>
            <span className="src calc">CoachChris</span>
          </header>
          <Routine
            title="Matin"
            meta={`${mmss(total(view.morning))} · routine fixe`}
            items={view.morning}
            checked={view.checked.morning}
            onStart={() => setGuide('morning')}
            onCheck={(v) => check('morning', v)}
          />
          {view.planWeek ? (
            <div className="routine">
              <div className="rt-head">
                <div>
                  <h2>Soir</h2>
                  <span className="meta">remplacée par le plan Claude</span>
                </div>
              </div>
              <p className="empty">
                Le soir est déjà pris par tes séances : la routine bureau et la séance optionnelle de la
                semaine couvrent la mobilité.
              </p>
            </div>
          ) : view.evening.length ? (
            <Routine
              title="Soir"
              meta={`${mmss(total(view.evening))} · bloc jusqu'au ${shortDate(b!.end)}`}
              items={view.evening}
              checked={view.checked.evening}
              onStart={() => setGuide('evening')}
              onCheck={(v) => check('evening', v)}
            />
          ) : view.proposal ? (
            <div className="routine">
              <div className="rt-head">
                <div>
                  <h2>Soir</h2>
                  <span className="meta">bloc proposé · 2 semaines</span>
                </div>
              </div>
              <div className="empty">
                <b>Bloc proposé d'après tes tests.</b>
                Ces 3 exercices forment le socle de tes soirées pendant 2 semaines ; un exercice variable s'y
                ajoute chaque soir selon ta journée. Valide-le pour démarrer.
              </div>
              <Exercises items={view.proposal} />
              <div>
                <button className="btn primary small" type="button" onClick={accept}>
                  Valider et démarrer le bloc
                </button>
              </div>
            </div>
          ) : (
            <div className="routine">
              <div className="rt-head">
                <div>
                  <h2>Soir</h2>
                  <span className="meta">8 min max · par blocs de 2 semaines</span>
                </div>
              </div>
              <div className="empty">
                <b>Ta routine du soir démarre après les tests.</b>
                Les 6 auto-tests prennent environ 10 min. Ils servent à choisir les 3 exercices de ton premier
                bloc, que tu valideras avant de commencer.
                <div>
                  <button className="btn primary small" type="button" onClick={() => setTesting(true)}>
                    Faire les tests
                  </button>
                </div>
              </div>
            </div>
          )}
        </article>
        {view.planWeek && <PlanWeekCard plan={view.planWeek} />}

        <article className="card s5">
          <header>
            <span className="label">Mes priorités</span>
            <span className="src">{Object.keys(view.tests).length ? 'Tests + déclaré' : 'Déclaré'}</span>
          </header>
          <ul className="prio">
            {view.zones.map((z) => (
              <li key={z.zone}>
                <span className="z">{z.label}</span>
                <span className={`status ${z.status}`}>{STATUS_LABEL[z.status]}</span>
                <span className="det">
                  {z.detail}
                  {z.declared && z.status !== 'declared' && ' · zone déclarée'}
                </span>
              </li>
            ))}
          </ul>
        </article>

        <article className="card s6" ref={testsRef}>
          <header>
            <span className="label">Auto-tests</span>
            <span className="muted text-xs">
              {b
                ? `Prochains tests : ${shortDate(addDays(b.end, 1))}`
                : Object.keys(view.tests).length
                  ? ''
                  : 'Aucun test fait'}
            </span>
          </header>
          {b && <BlockBar start={b.start} end={b.end} today={view.today} />}
          {testing ? (
            <TestForm
              tests={view.tests}
              onCancel={() => setTesting(false)}
              onSaved={() => {
                setTesting(false);
                reload();
              }}
            />
          ) : (
            <>
              <div className="tbl stack">
                <table className="tests">
                  <thead>
                    <tr>
                      <th>Test</th>
                      <th className="r">Dernier résultat</th>
                      <th className="r">Repère</th>
                      <th>Zone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TESTS.map((t) => {
                      const r = view.tests[t.key];
                      return (
                        <tr key={t.key}>
                          <td>{t.name}</td>
                          <td className={`r ${r ? '' : 'faint'}`} data-label="Dernier résultat">
                            {r ? (
                              <>
                                {formatResult(t, r.value as Side<number | string>)}{' '}
                                <span className="faint">{shortDate(r.day)}</span>
                              </>
                            ) : (
                              'pas encore fait'
                            )}
                          </td>
                          <td className="r muted" data-label="Repère">
                            {t.benchmark}
                          </td>
                          <td className="muted" data-label="Zone">
                            {t.zone}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div>
                <button className="btn" type="button" onClick={() => setTesting(true)}>
                  {Object.keys(view.tests).length ? 'Refaire des tests' : 'Faire les 6 tests · 10 min'}
                </button>
              </div>
            </>
          )}
        </article>

        <article className="card s6">
          <header>
            <span className="label">Régularité</span>
            <span className="src calc">CoachChris</span>
          </header>
          <Regularity view={view} />
        </article>

        <article className="card s12">
          <header>
            <span className="label">Démonstrations</span>
            <span className="muted text-xs">
              {EXERCISES.length} exercices de la bibliothèque · zone travaillée en violet
            </span>
          </header>
          <Demos />
        </article>
        <Inbox />
      </div>
      {guide && (
        <Guide
          title={guide === 'morning' ? 'Routine du matin' : 'Routine du soir'}
          items={guide === 'morning' ? view.morning : view.evening}
          onClose={() => setGuide(null)}
          onDone={() => {
            setGuide(null);
            void check(guide, true);
          }}
        />
      )}
    </section>
  );
}

function Routine({
  title,
  meta,
  items,
  checked,
  onStart,
  onCheck,
}: {
  title: string;
  meta: string;
  items: RoutineItemView[];
  checked: boolean;
  onStart: () => void;
  onCheck: (done: boolean) => void;
}) {
  return (
    <div className={`routine${checked ? ' done' : ''}`}>
      <div className="rt-head">
        <div>
          <h2 className="inline">{title}</h2>
          <span className="meta">{meta}</span>
        </div>
        <div className="rt-actions">
          <button className="btn primary small" type="button" onClick={onStart}>
            Démarrer
          </button>
          <label className="check">
            <input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)} />
            Fait
          </label>
        </div>
      </div>
      <Exercises items={items} />
    </div>
  );
}

function Exercises({ items }: { items: RoutineItemView[] }) {
  return (
    <ul className="exs">
      {items.map((e) => (
        <li key={e.code}>
          <span className="code">{e.code}</span>
          <span>
            <b>{e.name}</b>
            <small>
              {e.perSide ? `${mmss(e.durationS)} par côté` : firstSentence(exercise(e.code).instruction)}
            </small>
            {e.reason && (
              <span className="why">
                {e.slot === 'day' ? 'Créneau du jour · ' : 'Socle · '}
                {e.reason}
              </span>
            )}
          </span>
          <span className="d">
            {e.slot && <span className="slot">{e.slot === 'day' ? 'du jour' : 'socle'}</span>}
            {mmss(e.durationS * (e.perSide ? 2 : 1))}
          </span>
        </li>
      ))}
    </ul>
  );
}

function BlockBar({ start, end, today }: { start: string; end: string; today: string }) {
  const n = daysBetween(start, end) + 1;
  return (
    <div>
      <div className="label mb-1.5">
        Bloc · {shortDate(start)} → {shortDate(end)}
      </div>
      <div className="blockbar" role="img" aria-label={`Jour ${daysBetween(start, today) + 1} sur ${n}`}>
        {Array.from({ length: n }, (_, i) => {
          const d = addDays(start, i);
          return <i key={d} className={`${d < today ? 'ok' : ''}${d === today ? ' today' : ''}`} />;
        })}
      </div>
      <div className="bb-legend">
        <span>{shortDate(start)}</span>
        <span>
          {shortDate(end)} · tests le {shortDate(addDays(end, 1))}
        </span>
      </div>
    </div>
  );
}

function Regularity({ view }: { view: MobilityView }) {
  const any = view.last28.some((d) => d.morning || d.evening);
  if (!any) {
    return (
      <div className="empty">
        <b>Pas encore de données.</b>
        La régularité s'affichera dès que tu coches ta première routine (ou que tu la termines en mode guidé).
        Les jours sans réponse sont « non renseignés », pas « manqués ».
      </div>
    );
  }
  const row = (slot: Slot) => (
    <>
      <span>{slot === 'morning' ? 'Matin' : 'Soir'}</span>
      <span>
        <b>{view.regularity[slot].d7.done}</b>
        <small>/ 7</small>
      </span>
      <span>
        <b>{view.regularity[slot].d28.done}</b>
        <small>/ 28</small>
      </span>
      <span>
        <b>{view.regularity[slot].d7.streak}</b>
        <small>jours</small>
      </span>
    </>
  );
  return (
    <>
      <div className="reg">
        <span />
        <span className="h">7 j</span>
        <span className="h">28 j</span>
        <span className="h">Série</span>
        {row('morning')}
        {row('evening')}
      </div>
      <div className="heat" role="img" aria-label="Routines cochées sur les 28 derniers jours">
        {(['morning', 'evening'] as const).map((slot) => [
          <span key={slot}>{slot === 'morning' ? 'Matin' : 'Soir'}</span>,
          ...view.last28.map((d, i) => (
            <i
              key={`${slot}${d.day}`}
              className={`${d[slot] ? 'y' : ''}${i < 14 ? ' old' : ''}`}
              title={`${shortDate(d.day)} : ${d[slot] ? 'fait' : 'non renseigné'}`}
            />
          )),
        ])}
      </div>
      <div className="muted text-xs">Case vide = non renseigné, pas « manqué ».</div>
    </>
  );
}

const GROUPS: [string, RegExp][] = [
  ['Hanche', /^H/],
  ['Pied et orteils', /^P/],
  ['Cheville, mollet', /^C/],
  ['Genou, cuisse', /^G/],
  ['Tronc, récupération', /^[TR]/],
];
const CATEGORY: Record<string, string> = {
  mobility: 'Mobilité',
  activation: 'Activation',
  recovery: 'Récupération',
  strength: 'Renforcement',
};
const TYPE: Record<string, string> = { static: 'statique', dynamic: 'dynamique', control: 'contrôle' };

function Demos() {
  const [code, setCode] = useState('H1');
  const e = exercise(code);
  return (
    <div className="demo-lib">
      <nav className="demo-list" aria-label="Exercices">
        {GROUPS.map(([label, re]) => (
          <div key={label} className="demo-grp">
            <span>{label}</span>
            {EXERCISES.filter((x) => re.test(x.code)).map((x) => (
              <button
                key={x.code}
                type="button"
                aria-pressed={x.code === code}
                onClick={() => setCode(x.code)}
              >
                <b>{x.code}</b> {x.name}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <figure className="demo-view">
        <Figure code={code} label={`Mannequin : ${e.name}`} />
        <figcaption>
          <b>
            {code} · {e.name}
          </b>
          <span className="demo-meta">
            {e.categories.map((c) => CATEGORY[c]).join(' / ')} · {TYPE[e.type]} · niveau {e.level} ·{' '}
            {mmss(e.durationS)}
            {e.perSide && ' par côté'}
          </span>
          <span>{e.instruction}</span>
          {e.precautions && (
            <span className="demo-warn">
              <b>Précaution : </b>
              {e.precautions}
            </span>
          )}
        </figcaption>
      </figure>
    </div>
  );
}

/** Routines de la semaine du plan Claude (D157) : variante du matin et routine bureau. */
function PlanWeekCard({ plan }: { plan: PlanWeekRoutines }) {
  return (
    <article className="card s5" aria-label="Routines du plan">
      <header>
        <span className="label">Cette semaine{plan.focus ? ` · ${plan.focus}` : ''}</span>
        <span className="src claude">Plan Claude</span>
      </header>
      {plan.morning.length > 0 && (
        <div className="cl-phase">
          <h4 className="label">Matin : changements de la semaine</h4>
          <ul className="cl-items">
            {plan.morning.map((m) => (
              <li key={m.replaces}>
                <span className="cl-name">{m.by}</span>
                <span className="cl-hint">remplace {m.replaces}</span>
              </li>
            ))}
          </ul>
          {plan.morningWhy && <p className="cl-hint">{plan.morningWhy}</p>}
        </div>
      )}
      {plan.office && (
        <details className="cl-phase">
          <summary>
            <span className="label">
              {plan.office.name} · {plan.office.dureeMin} min · lundi → vendredi
            </span>
          </summary>
          {plan.office.quand && <p className="cl-hint">{plan.office.quand}</p>}
          <ol className="cl-items">
            {(plan.office.steps ?? []).map((st, i) => (
              <li key={i}>
                <span className="cl-name">{st.name}</span>
                {(st.duree || st.reps) && <span className="cl-q">{st.duree ?? st.reps}</span>}
                {st.consigne && <span className="cl-hint">{st.consigne}</span>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}
