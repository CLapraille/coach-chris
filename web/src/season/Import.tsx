import type { PlanImportResult, SeasonImportResult } from '@coach-chris/domain';
import { useRef, useState } from 'react';
import { api, ApiError } from '../api.ts';

/**
 * Import d'un plan Claude ou d'une saison depuis l'app (D164), sans PC ni ligne de commande. Le type se lit
 * dans le champ `format` du fichier. Toujours en deux temps : aperçu (`dryRun`, rien n'est écrit), puis
 * confirmation. Le serveur applique les mêmes validations que `npm run plan` ; un fichier refusé n'écrit rien.
 */

const PLAN_FORMAT = 'coach-chris.plan/v1';
const SEASON_FORMAT = 'coach-chris.season/v1';

type Kind = 'plan' | 'season';
type Preview = { kind: 'plan'; result: PlanImportResult } | { kind: 'season'; result: SeasonImportResult };

type State =
  | { step: 'idle' }
  | { step: 'busy' }
  | { step: 'preview'; name: string; file: unknown; preview: Preview }
  | { step: 'refused'; name: string; message: string; problems: string[] }
  | { step: 'done'; message: string };

const civil = (day: string) => new Date(`${day}T12:00:00Z`);
const short = (day: string) =>
  civil(day).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function kindOf(file: unknown): Kind | null {
  const format = (file as { format?: unknown } | null)?.format;
  if (format === PLAN_FORMAT) return 'plan';
  if (format === SEASON_FORMAT) return 'season';
  return null;
}

async function send<T>(kind: Kind, file: unknown, opts: { dryRun: boolean; activate?: boolean }): Promise<T> {
  const url = kind === 'plan' ? '/plans/import' : '/season/import';
  const body = kind === 'plan' ? { file, ...opts } : { file, dryRun: opts.dryRun };
  return api<T>(url, { method: 'POST', body: JSON.stringify(body) });
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

export function ImportCard({ onImported }: { onImported: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ step: 'idle' });
  const [shadow, setShadow] = useState(false);

  const fail = (name: string, e: unknown) => {
    const problems =
      e instanceof ApiError && Array.isArray(e.body.problems) ? e.body.problems.map(String) : [];
    setState({ step: 'refused', name, message: e instanceof Error ? e.message : String(e), problems });
  };

  const preview = async (name: string, file: unknown, keepAside: boolean) => {
    const kind = kindOf(file);
    if (!kind) {
      setState({
        step: 'refused',
        name,
        message: 'Fichier non reconnu',
        problems: [`format attendu : ${PLAN_FORMAT} ou ${SEASON_FORMAT}`],
      });
      return;
    }
    setState({ step: 'busy' });
    try {
      const result = await send<PlanImportResult & SeasonImportResult>(kind, file, {
        dryRun: true,
        activate: !keepAside,
      });
      setState({ step: 'preview', name, file, preview: { kind, result } as Preview });
    } catch (e) {
      fail(name, e);
    }
  };

  const choose = async (f: File | undefined) => {
    if (!f) return;
    let file: unknown;
    try {
      file = JSON.parse(await f.text());
    } catch {
      setState({ step: 'refused', name: f.name, message: 'Fichier illisible', problems: ['JSON invalide'] });
      return;
    }
    await preview(f.name, file, shadow);
  };

  const toggleShadow = (on: boolean) => {
    setShadow(on);
    if (state.step === 'preview' && state.preview.kind === 'plan') void preview(state.name, state.file, on);
  };

  const confirm = async () => {
    if (state.step !== 'preview') return;
    const { name, file, preview: p } = state;
    setState({ step: 'busy' });
    try {
      if (p.kind === 'plan') {
        const r = await send<PlanImportResult>('plan', file, { dryRun: false, activate: !shadow });
        setState({
          step: 'done',
          message: `${r.blockName} importé : ${plural(r.weeks.length, 'semaine')}${shadow ? ', gardé à côté de Campus' : ''}.`,
        });
      } else {
        const r = await send<SeasonImportResult>('season', file, { dryRun: false });
        setState({ step: 'done', message: `Saison ${r.season} importée : ${plural(r.events, 'course')}.` });
      }
      onImported();
    } catch (e) {
      fail(name, e);
    }
  };

  const reset = () => {
    setState({ step: 'idle' });
    if (input.current) input.current.value = '';
  };

  return (
    <article className="card s12" aria-label="Importer un fichier">
      <header>
        <span className="label">Importer</span>
        <span className="muted text-xs">Plan Claude ou saison (.json)</span>
      </header>

      {(state.step === 'idle' || state.step === 'done') && (
        <div className="im-pick">
          {state.step === 'done' && (
            <p className="im-ok" role="status">
              {state.message}
            </p>
          )}
          <label className="btn">
            Choisir un fichier
            <input
              ref={input}
              type="file"
              className="im-file"
              aria-label="Fichier à importer"
              onChange={(e) => void choose(e.target.files?.[0])}
            />
          </label>
          <p className="empty">
            Rien n'est écrit avant « Importer » : un aperçu s'affiche d'abord. Le fichier reste sur ton
            téléphone, seul son contenu est enregistré.
          </p>
        </div>
      )}

      {state.step === 'busy' && <p className="muted">Vérification…</p>}

      {state.step === 'preview' && (
        <div className="im-preview">
          <div className="faint">{state.name}</div>
          {state.preview.kind === 'plan' ? (
            <PlanPreview result={state.preview.result} />
          ) : (
            <SeasonPreview result={state.preview.result} />
          )}
          {state.preview.kind === 'plan' && (
            <label className="im-shadow">
              <input type="checkbox" checked={shadow} onChange={(e) => toggleShadow(e.target.checked)} />
              Garder à côté du plan Campus, sans l'activer (pour comparer)
            </label>
          )}
          <div className="im-actions">
            <button className="btn primary" type="button" onClick={() => void confirm()}>
              Importer
            </button>
            <button className="btn" type="button" onClick={reset}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {state.step === 'refused' && (
        <div className="im-refused" role="alert">
          <p className="text-alert">
            {state.message} · {state.name}
          </p>
          {state.problems.length > 0 && (
            <ul>
              {state.problems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
          <p className="empty">Rien n'a été écrit.</p>
          <button className="btn" type="button" onClick={reset}>
            Choisir un autre fichier
          </button>
        </div>
      )}
    </article>
  );
}

function PlanPreview({ result }: { result: PlanImportResult }) {
  return (
    <div>
      <h3>{result.blockName}</h3>
      <div className="muted">
        Du {short(result.start)} au {short(result.end)} · {plural(result.weeks.length, 'semaine')}
      </div>
      <ul className="im-weeks">
        {result.weeks.map((w) => (
          <li key={w.weekDate}>
            <span className="num">Semaine du {short(w.weekDate)}</span>
            <span>{plural(w.sessions, 'séance')}</span>
            <span className="faint">{w.changed ? 'nouvelle version' : 'inchangée'}</span>
            <span className={`src ${w.active}`}>{w.active === 'claude' ? 'Plan Claude' : 'Campus'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SeasonPreview({ result }: { result: SeasonImportResult }) {
  return (
    <div>
      <h3>Saison {result.season}</h3>
      <div className="muted">
        {plural(result.events, 'course')}
        {result.replaces > 0 && ` · remplace la saison enregistrée (${plural(result.replaces, 'course')})`}
      </div>
    </div>
  );
}
