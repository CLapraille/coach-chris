import type { Signal } from '@coach-chris/domain';

export function SignalsCard({ signals }: { signals: Signal[] }) {
  return (
    <article className="card s12">
      <header>
        <span className="label">Signaux</span>
        <span className="src calc">Calculé</span>
      </header>
      {signals.length ? (
        <div className="insights">
          {signals.map((s) => (
            <div key={s.id} className={`ins ${s.level}`}>
              <div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                <details>
                  <summary>Règle</summary>
                  {s.rule}
                </details>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty">Rien à signaler.</p>
      )}
    </article>
  );
}
