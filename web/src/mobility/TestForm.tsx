import type { MobilityView } from '@coach-chris/domain';
import { useState } from 'react';
import { api } from '../api.ts';
import { TESTS } from './tests.ts';

type Draft = Record<string, { left: string; right: string }>;

/**
 * Saisie des auto-tests (D74). Chaque test est facultatif : seuls les tests remplis des deux côtés sont envoyés,
 * et un test refait ne remplace que son propre résultat.
 */
export function TestForm({
  tests,
  onSaved,
  onCancel,
}: {
  tests: MobilityView['tests'];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>({});
  const [error, setError] = useState<string | null>(null);
  const set = (key: string, side: 'left' | 'right', v: string) =>
    setDraft((d) => ({ ...d, [key]: { left: '', right: '', ...d[key], [side]: v } }));

  const payload = Object.fromEntries(
    TESTS.flatMap((t) => {
      const d = draft[t.key];
      if (!d?.left || !d.right) return [];
      const conv = (v: string) => (t.input.kind === 'number' ? Number(v.replace(',', '.')) : v);
      return [[t.key, { left: conv(d.left), right: conv(d.right) }]];
    }),
  );
  const incomplete = TESTS.filter((t) => {
    const d = draft[t.key];
    return d && Boolean(d.left) !== Boolean(d.right);
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('/mobility/tests', { method: 'POST', body: JSON.stringify(payload) });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form className="testform" onSubmit={submit} aria-label="Saisie des auto-tests">
      {TESTS.map((t) => (
        <fieldset key={t.key}>
          <legend>
            {t.code} · {t.name}
          </legend>
          <small>
            {t.how} Repère : {t.benchmark}.{tests[t.key] && ' Dernier résultat enregistré.'}
          </small>
          {(['left', 'right'] as const).map((side) => (
            <label key={side}>
              {side === 'left' ? 'Gauche' : 'Droite'}
              {t.input.kind === 'number' ? (
                <input
                  inputMode="decimal"
                  aria-label={`${t.name}, ${side === 'left' ? 'gauche' : 'droite'} (${t.input.unit})`}
                  value={draft[t.key]?.[side] ?? ''}
                  onChange={(e) => set(t.key, side, e.target.value)}
                  pattern="[0-9]+([.,][0-9])?"
                />
              ) : (
                <select
                  aria-label={`${t.name}, ${side === 'left' ? 'gauche' : 'droite'}`}
                  value={draft[t.key]?.[side] ?? ''}
                  onChange={(e) => set(t.key, side, e.target.value)}
                >
                  <option value="">—</option>
                  {t.input.options.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              )}
            </label>
          ))}
        </fieldset>
      ))}
      {incomplete.length > 0 && (
        <p className="empty">Remplis les deux côtés pour : {incomplete.map((t) => t.name).join(', ')}.</p>
      )}
      {error && (
        <p className="text-alert" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button
          className="btn primary"
          type="submit"
          disabled={!Object.keys(payload).length || incomplete.length > 0}
        >
          Enregistrer {Object.keys(payload).length || ''} test{Object.keys(payload).length > 1 ? 's' : ''}
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  );
}
