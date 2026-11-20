import type { ActionPreview, ActionRequest, ActionResult } from '@coach-chris/domain';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.ts';

type Phase =
  | { at: 'preview' }
  | { at: 'ready'; preview: ActionPreview }
  | { at: 'sending'; preview: ActionPreview }
  | { at: 'done'; result: ActionResult }
  | { at: 'refused'; message: string };

const post = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) });

/**
 * Écriture en deux temps (D123) : l'aperçu montre exactement ce qui partira, rien n'est envoyé
 * sans « Confirmer ». `onDone` est appelé après une écriture réussie, pour relire l'écran.
 */
export function ActionDialog({
  request,
  onClose,
  onDone,
}: {
  request: ActionRequest;
  onClose: () => void;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ at: 'preview' });
  const confirmBtn = useRef<HTMLButtonElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    post<ActionPreview>('/actions/preview', request).then(
      (preview) => live && setPhase({ at: 'ready', preview }),
      (e: unknown) =>
        live && setPhase({ at: 'refused', message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [request]);

  useEffect(() => {
    (phase.at === 'ready' ? confirmBtn : closeBtn).current?.focus();
  }, [phase.at]);

  const busy = phase.at === 'preview' || phase.at === 'sending';
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [busy, onClose]);

  const confirm = async (preview: ActionPreview) => {
    setPhase({ at: 'sending', preview });
    try {
      const result = await post<ActionResult>('/actions/confirm', { token: preview.token });
      setPhase({ at: 'done', result });
      if (result.ok) onDone();
    } catch (e) {
      setPhase({ at: 'refused', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const preview = phase.at === 'ready' || phase.at === 'sending' ? phase.preview : null;
  return (
    <div className="confirm-bg">
      <div className="confirm card" role="dialog" aria-modal="true" aria-label={preview?.title ?? 'Écriture'}>
        {phase.at === 'preview' && (
          <p className="muted">
            Lecture des sources pour l’aperçu… Après une pause, Garmin ou Campus peuvent mettre une trentaine
            de secondes à répondre.
          </p>
        )}
        {preview && (
          <>
            <header>
              <span className="label">{preview.title}</span>
              <span
                className={`src ${preview.target === 'Campus Coach' ? 'campus' : preview.target === 'MyWhoosh' ? 'claude' : 'garmin'}`}
              >
                {preview.target}
              </span>
            </header>
            <p className="muted">Voici exactement ce qui sera envoyé. Rien ne part avant « Confirmer ».</p>
            <dl className="cf-fields">
              {preview.fields.map((f) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
            {preview.warnings.map((w) => (
              <p key={w} className="cf-warn">
                {w}
              </p>
            ))}
            <div className="cf-bottom">
              <button className="btn" type="button" onClick={onClose} disabled={phase.at === 'sending'}>
                Annuler
              </button>
              <button
                ref={confirmBtn}
                className="btn primary"
                type="button"
                disabled={phase.at === 'sending'}
                onClick={() => void confirm(preview)}
              >
                {phase.at === 'sending' ? 'Envoi…' : 'Confirmer'}
              </button>
            </div>
          </>
        )}
        {(phase.at === 'done' || phase.at === 'refused') && (
          <>
            <p className={phase.at === 'done' && phase.result.ok ? 'cf-ok' : 'cf-err'} role="status">
              {phase.at === 'done' ? phase.result.message : phase.message}
            </p>
            <div className="cf-bottom">
              <button ref={closeBtn} className="btn" type="button" onClick={onClose}>
                Fermer
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
