import type { DataStatus, SourceName } from '@coach-chris/domain';
import { useState } from 'react';
import { api } from '../api.ts';
import { GOAL_LABEL, clock, decimal, longDate, parisDay, shortDate } from '../format.ts';

const NAME: Record<SourceName, string> = { garmin: 'Garmin Connect', campus: 'Campus Coach' };
// « job » couvre le job quotidien et la synchro en ligne de commande (npm run sync).
const ORIGIN = { job: 'job', open: 'ouverture', button: 'bouton', action: 'après écriture' } as const;

/** Date et heure de Paris : « 08/10 22:14 ». */
const stamp = (iso: string) => `${shortDate(parisDay(iso))} ${clock(iso)}`;
/** Heure locale Garmin « 2026-10-08 22:11:54 » → « 08/10 22:11 ». */
const localStamp = (s: string) => `${shortDate(s.slice(0, 10))} ${s.slice(11, 16)}`;

export function Data({ status, onChanged }: { status: DataStatus; onChanged: () => void }) {
  const [busy, setBusy] = useState<SourceName | 'all' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = parisDay(new Date().toISOString());

  const refresh = async (source?: SourceName) => {
    setBusy(source ?? 'all');
    setError(null);
    try {
      await api(`/sync${source ? `?source=${source}` : ''}`, { method: 'POST' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      onChanged();
    }
  };

  return (
    <section className="data-screen" aria-labelledby="data-title">
      <div className="head">
        <div>
          <h1 id="data-title">Données</h1>
          <div className="sub">{longDate(today)}</div>
        </div>
        <button className="btn" type="button" disabled={busy !== null} onClick={() => void refresh()}>
          {busy === 'all' ? 'Actualisation…' : 'Tout actualiser'}
        </button>
      </div>
      {error && (
        <p className="text-alert" role="alert">
          {error}
        </p>
      )}
      <div className="grid">
        {(['garmin', 'campus'] as const).map((s) => (
          <SourceCard
            key={s}
            source={s}
            status={status}
            busy={busy === s || busy === 'all'}
            onRefresh={() => void refresh(s)}
          />
        ))}
        <Freshness status={status} />
        <Journal log={status.log} />
      </div>
    </section>
  );
}

function SourceCard({
  source,
  status,
  busy,
  onRefresh,
}: {
  source: SourceName;
  status: DataStatus;
  busy: boolean;
  onRefresh: () => void;
}) {
  const { lastOkAt, last } = status.sources[source];
  const expired = last?.outcome === 'token-expired';
  const state = expired
    ? { cls: 'bad', label: 'Jeton expiré' }
    : last?.outcome === 'error'
      ? { cls: 'warn', label: 'Erreur à la dernière synchro' }
      : lastOkAt
        ? { cls: '', label: 'Connecté' }
        : { cls: 'off', label: 'Jamais synchronisé' };
  const plan = status.plan;
  return (
    <article className="card s6">
      <header>
        <span className="label">Source</span>
        <span className="src">MCP {source === 'garmin' ? 'garmin' : 'campus-coach'}</span>
      </header>
      <div className="src-head">
        <h2>{NAME[source]}</h2>
        <span className={`state ${state.cls}`}>
          <i />
          {state.label}
        </span>
      </div>
      <dl className="kv2">
        <dt>Dernière synchro</dt>
        <dd>
          {lastOkAt ? (
            <>
              <span className="mono">{stamp(lastOkAt)}</span> <small>· réussie</small>
            </>
          ) : (
            <small>aucune réussie</small>
          )}
        </dd>
        {source === 'garmin' ? (
          <>
            <dt>Montre</dt>
            <dd>
              {status.device ? (
                <>
                  {status.device.name}
                  {status.device.lastUpload && (
                    <small> · dernier envoi {localStamp(status.device.lastUpload)}</small>
                  )}
                </>
              ) : (
                <small>indisponible</small>
              )}
            </dd>
          </>
        ) : (
          <>
            <dt>Plan</dt>
            <dd>
              {plan ? (
                <>
                  {plan.goalType && `« ${GOAL_LABEL[plan.goalType] ?? plan.goalType} »`}
                  {plan.weekIndex && ` · semaine ${plan.weekIndex} sur ${plan.durationInWeeks}`}
                  <small>
                    {' '}
                    · {plan.done} séance{plan.done > 1 ? 's' : ''} sur {plan.total} faite
                    {plan.done > 1 ? 's' : ''}
                  </small>
                  {expired && <small> · affiché depuis le cache, peut ne plus être à jour</small>}
                </>
              ) : (
                <small>aucun plan en cache pour cette semaine</small>
              )}
            </dd>
          </>
        )}
        <dt>Jeton</dt>
        <dd>
          {expired ? (
            <span className="bad">refusé le {stamp(last!.at)}</span>
          ) : (
            <small>
              renouvelé automatiquement par le MCP
              {source === 'campus' && ', il change à chaque rafraîchissement'}
            </small>
          )}
        </dd>
        <dt>Dernière erreur</dt>
        <dd>{last && last.outcome !== 'ok' ? last.message : <small>aucune</small>}</dd>
      </dl>
      {expired && <Reauth source={source} />}
      <div className="actions">
        <button className="btn" type="button" disabled={busy} onClick={onRefresh}>
          {busy ? 'Actualisation…' : 'Actualiser maintenant'}
        </button>
      </div>
    </article>
  );
}

/** Le navigateur ne peut pas lancer de script local : on affiche la commande à copier (D82, D92). */
function Reauth({ source }: { source: SourceName }) {
  const cmd = `.\\reauth.ps1 -Source ${source}`;
  const [copied, setCopied] = useState(false);
  return (
    <div className="reauth">
      <span>
        <b>À faire sur ton PC</b> (le navigateur ne peut pas lancer de script) : ouvre PowerShell dans le
        dossier du projet et lance :
      </span>
      <div className="cmd">
        <code>{cmd}</code>
        <button
          className="btn small"
          type="button"
          onClick={() =>
            void navigator.clipboard.writeText(cmd).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }
        >
          {copied ? 'Copié' : 'Copier'}
        </button>
      </div>
      <small className="muted">
        Le script te fait te reconnecter puis enregistre le nouveau jeton. Reviens ensuite ici et clique «
        Actualiser maintenant ».
      </small>
    </div>
  );
}

const nights = (days: string[]) =>
  days.length === 1
    ? `nuit du ${shortDate(days[0]!)} absente`
    : `${days.length} nuits absentes (${days.map(shortDate).join(', ')})`;

function Freshness({ status }: { status: DataStatus }) {
  const f = status.freshness;
  const today = parisDay(new Date().toISOString());
  const weightAge = f.weight.last
    ? Math.round((Date.parse(today) - Date.parse(f.weight.last)) / 86_400_000)
    : null;
  const rows: [string, string, React.ReactNode, React.ReactNode][] = [
    [
      'Sommeil',
      'Garmin',
      f.sleep.last ? `nuit du ${shortDate(f.sleep.last)}` : '—',
      f.sleep.missing.length ? (
        <span className="gap">
          {nights(f.sleep.missing)}{' '}
          <span className="muted">
            ({f.sleep.present} nuits sur {f.sleep.days})
          </span>
        </span>
      ) : (
        <span className="okc">aucun</span>
      ),
    ],
    [
      'VFC nocturne',
      'Garmin',
      f.hrv.last
        ? `${shortDate(f.hrv.last)}${f.hrv.lastMs !== undefined ? ` · ${f.hrv.lastMs} ms` : ''}`
        : '—',
      f.hrv.missing.length ? (
        <span className="gap">{nights(f.hrv.missing)}</span>
      ) : (
        <span className="okc">aucun</span>
      ),
    ],
    [
      'Activités',
      'Garmin',
      f.activities.lastStart
        ? `${shortDate(f.activities.lastStart.slice(0, 10))} ${f.activities.lastStart.slice(11, 16)}`
        : '—',
      f.activities.lastRun ? (
        <span className="muted">dernière course {shortDate(f.activities.lastRun.slice(0, 10))}</span>
      ) : (
        <span className="muted">aucune course sur 90 jours</span>
      ),
    ],
    [
      'Poids',
      'Garmin',
      f.weight.last
        ? `${shortDate(f.weight.last)}${f.weight.kg !== undefined ? ` · ${decimal(f.weight.kg)} kg` : ''}`
        : '—',
      weightAge !== null && weightAge > 7 ? (
        <span className="gap">pas de pesée depuis {weightAge} jours</span>
      ) : (
        <span className="okc">aucun</span>
      ),
    ],
    [
      "Plan d'entraînement",
      'Campus',
      f.plan.week ? `semaine du ${shortDate(f.plan.week)}` : '—',
      f.plan.week ? <span className="okc">aucun</span> : <span className="gap">pas de plan en cache</span>,
    ],
  ];
  return (
    <article className="card s7">
      <header>
        <span className="label">Fraîcheur des données</span>
        <span className="muted text-xs">14 derniers jours</span>
      </header>
      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th>Donnée</th>
              <th>Source</th>
              <th>Dernière</th>
              <th>Manques</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, src, last, gap]) => (
              <tr key={name}>
                <td>{name}</td>
                <td className="muted">{src}</td>
                <td className="mono">{last}</td>
                <td>{gap}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <small className="muted">
        Une donnée absente s'affiche « indisponible » dans les autres écrans ; elle n'est jamais estimée.
      </small>
    </article>
  );
}

function Journal({ log }: { log: DataStatus['log'] }) {
  return (
    <article className="card s5">
      <header>
        <span className="label">Journal des synchros</span>
        <span className="muted text-xs">{log.length ? `${log.length} dernières` : ''}</span>
      </header>
      {log.length ? (
        <div className="tbl">
          <table className="log">
            <thead>
              <tr>
                <th>Date</th>
                <th>Origine</th>
                <th>Résultat</th>
                <th className="r">Durée</th>
              </tr>
            </thead>
            <tbody>
              {log.map((l) => (
                <tr key={`${l.at}${l.source}`}>
                  <td className="mono">
                    {shortDate(parisDay(l.at))}
                    <span className="muted"> {clock(l.at)}</span>
                  </td>
                  <td className="muted">{ORIGIN[l.origin]}</td>
                  <td title={l.message}>
                    <span
                      className={
                        l.outcome === 'ok' ? 'r-ok' : l.outcome === 'token-expired' ? 'r-bad' : 'r-part'
                      }
                    >
                      {l.source === 'garmin' ? 'Garmin' : 'Campus'}
                      {l.outcome === 'ok'
                        ? ' OK'
                        : l.outcome === 'token-expired'
                          ? ' : jeton refusé'
                          : ' : erreur'}
                    </span>
                  </td>
                  <td className="mono muted r">{Math.max(1, Math.round(l.durationMs / 1000))} s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">
          <b>Aucune synchro enregistrée.</b> Le job quotidien, l'ouverture de l'app et le bouton « Actualiser
          » rempliront ce journal.
        </p>
      )}
    </article>
  );
}
