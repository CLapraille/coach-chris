import { useRef, useState } from 'react';
import { api } from '../api.ts';

/**
 * Bilan pour Claude (D171) : le texte des dernières semaines (séances, douleurs, nuits, courses à venir),
 * à copier dans une session Claude pour rédiger le bloc suivant, puis importer le plan ci-dessous.
 */
export function BriefCard() {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  const load = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      setText((await api<{ text: string }>('/brief')).text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (text === null) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Presse-papiers refusé : on sélectionne le texte pour une copie à la main.
      area.current?.focus();
      area.current?.select();
    }
  };

  return (
    <article className="card s12" aria-label="Bilan pour Claude">
      <header>
        <span className="label">Bilan pour Claude</span>
        <span className="muted text-xs">4 dernières semaines</span>
      </header>
      <p className="empty">
        Séances faites ou manquées, durées réelles, douleurs, nuits, courses à venir et boîte à vidéos.
        Copie-le dans une session Claude pour écrire le bloc suivant, complète la fin avec ton ressenti, puis
        importe le plan reçu ci-dessous.
      </p>
      <div className="br-actions">
        <button className="btn" type="button" disabled={busy} onClick={() => void load()}>
          {busy ? 'Préparation…' : text === null ? 'Préparer le bilan' : 'Actualiser'}
        </button>
        {text !== null && (
          <button className="btn primary" type="button" onClick={() => void copy()}>
            {copied ? 'Copié' : 'Copier'}
          </button>
        )}
      </div>
      {error && (
        <p className="text-alert" role="alert">
          {error}
        </p>
      )}
      {text !== null && (
        <textarea
          ref={area}
          id="brief-text"
          className="br-text"
          readOnly
          value={text}
          aria-label="Texte du bilan"
          rows={14}
        />
      )}
    </article>
  );
}
