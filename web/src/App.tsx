import { useState } from 'react';

export const TABS = ["Aujourd'hui", 'Calendrier', 'Mobilité', 'Données'] as const;
type Tab = (typeof TABS)[number];

export function App() {
  const [tab, setTab] = useState<Tab>("Aujourd'hui");

  return (
    <div className="grid min-h-screen md:grid-cols-[200px_1fr]">
      <aside className="flex flex-col gap-6 border-line px-3.5 py-5 md:border-r">
        <div className="font-display text-xl font-bold">CoachChris</div>
        <nav aria-label="Navigation principale" className="flex gap-1 md:flex-col">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              aria-current={t === tab ? 'page' : undefined}
              onClick={() => setTab(t)}
              className="rounded-md px-2.5 py-1.5 text-left text-sm text-muted aria-[current=page]:bg-surface-2 aria-[current=page]:font-medium aria-[current=page]:text-fg"
            >
              {t}
            </button>
          ))}
        </nav>
      </aside>
      <main className="px-6 py-5">
        <h1 className="font-display text-3xl font-semibold">{tab}</h1>
        <p className="mt-2 text-sm text-muted">Écran à venir (jalon M3).</p>
      </main>
    </div>
  );
}
