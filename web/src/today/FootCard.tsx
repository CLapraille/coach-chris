import { painZone } from '@coach-chris/domain';
import { useState } from 'react';
import { api } from '../api.ts';

/**
 * Check-in du matin (D159) : douleur du pied gauche au premier pas, un clic. À 3/10 ou plus, la séance flexible
 * se fait de préférence en vélo ou au rameur ; l'échange reste un choix, fait dans le détail de la séance.
 */
export function FootCard({
  today,
  foot,
  onChanged,
}: {
  today: string;
  foot: number | null;
  onChanged: () => void;
}) {
  const [value, setValue] = useState(foot);
  const [error, setError] = useState<string | null>(null);
  const choose = async (n: number) => {
    const next = n === value ? null : n;
    const before = value;
    setValue(next);
    setError(null);
    try {
      await api(`/checkins/${today}`, { method: 'PUT', body: JSON.stringify({ foot: next }) });
      onChanged();
    } catch (e) {
      setValue(before);
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <article className="card s12 foot" aria-label="Pied au premier pas">
      <header>
        <span className="label">Pied au premier pas · /10</span>
        <span className="src calc">Check-in</span>
      </header>
      <div className="score" role="radiogroup" aria-label="Douleur du pied au premier pas, de 0 à 10">
        {Array.from({ length: 11 }, (_, n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            data-z={painZone(n)}
            onClick={() => void choose(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="empty">
        {value === null
          ? 'Note la douleur du pied gauche en te levant, avant la routine du matin.'
          : value >= 3
            ? 'À 3/10 ou plus : séance flexible plutôt en vélo ou au rameur aujourd’hui, et sortie raccourcie si la douleur monte.'
            : 'Dans le vert : le plan du jour reste tel quel.'}
      </p>
      {error && (
        <p className="text-alert" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
