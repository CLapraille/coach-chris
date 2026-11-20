import type { InboxItem } from '@coach-chris/domain';
import { useState } from 'react';
import { api, useApi } from '../api.ts';
import { shortDate } from '../format.ts';

/**
 * Boîte à vidéos (D158) : un exercice repéré (YouTube Short…) et ce qu'il travaille. Claude les intègre à la
 * bibliothèque à la préparation du bloc suivant ; il ne regarde pas la vidéo, la note dit quoi en faire.
 */
export function Inbox() {
  const inbox = useApi<InboxItem[]>('/inbox');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (inbox.state === 'ready') inbox.reload();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(() => api('/inbox', { method: 'POST', body: JSON.stringify({ url, note }) }));
    if (ok) {
      setUrl('');
      setNote('');
    }
  };

  const items = inbox.state === 'ready' ? inbox.data : [];
  return (
    <article className="card s12" aria-label="Boîte à vidéos">
      <header>
        <span className="label">Boîte à vidéos{items.length ? ` · ${items.length}` : ''}</span>
        <span className="muted text-xs">intégrées à la bibliothèque au prochain bloc</span>
      </header>
      <form className="ib-form" onSubmit={(e) => void add(e)}>
        <label>
          <span className="label">Lien</span>
          <input
            id="inbox-url"
            type="url"
            required
            placeholder="https://youtube.com/shorts/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <label>
          <span className="label">Ce que ça travaille</span>
          <input
            id="inbox-note"
            required
            maxLength={500}
            placeholder="ex. mollet sur une marche, pour les tibias"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button className="btn" type="submit" disabled={busy}>
          Ajouter
        </button>
      </form>
      {error && (
        <p className="text-alert" role="alert">
          {error}
        </p>
      )}
      {inbox.state === 'error' && <p className="empty">{inbox.error.message}</p>}
      {inbox.state === 'ready' && items.length === 0 && (
        <p className="empty">Aucune vidéo en attente. Colle ici le lien d'un exercice repéré et une note.</p>
      )}
      {items.length > 0 && (
        <ul className="ib-list">
          {items.map((i) => (
            <li key={i.id}>
              <div className="ib-main">
                <a href={i.url} target="_blank" rel="noreferrer">
                  {i.note}
                </a>
                <span className="faint">
                  ajouté le {shortDate(i.addedAt.slice(0, 10))} ·{' '}
                  {new URL(i.url).hostname.replace(/^www\./, '')}
                </span>
              </div>
              <button
                className="linkbtn"
                type="button"
                disabled={busy}
                onClick={() => void run(() => api(`/inbox/${i.id}`, { method: 'DELETE' }))}
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
