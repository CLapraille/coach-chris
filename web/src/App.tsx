import type { DataStatus, SourceName } from '@coach-chris/domain';
import { useState } from 'react';
import { useApi } from './api.ts';
import { clock, parisDay, shortDate } from './format.ts';
import { Calendar } from './calendar/Calendar.tsx';
import { Data } from './data/Data.tsx';
import { Mobility } from './mobility/Mobility.tsx';
import { Today } from './today/Today.tsx';

export const TABS = ["Aujourd'hui", 'Calendrier', 'Mobilité', 'Données'] as const;
type Tab = (typeof TABS)[number];

export function App() {
  const [tab, setTab] = useState<Tab>("Aujourd'hui");
  const status = useApi<DataStatus>('/data/status');
  const st = status.state === 'ready' ? status.data : null;

  return (
    <>
      <div className="app">
        <aside className="side" aria-label="Navigation principale">
          <div className="brand">
            <i />
            CoachChris
          </div>
          <Nav tab={tab} onSelect={setTab} className="nav" />
          {st && <SyncState status={st} />}
        </aside>
        <main>
          {tab === "Aujourd'hui" ? (
            <Today status={st} onNavigate={setTab} />
          ) : tab === 'Calendrier' ? (
            <Calendar />
          ) : tab === 'Mobilité' ? (
            <Mobility />
          ) : st && status.state === 'ready' ? (
            <Data status={st} onChanged={status.reload} />
          ) : status.state === 'error' ? (
            <p className="empty" role="alert">
              {status.error.message}
            </p>
          ) : (
            <p className="muted">Chargement…</p>
          )}
        </main>
      </div>
      <Nav tab={tab} onSelect={setTab} className="tabbar" label="Navigation mobile" bar />
    </>
  );
}

function Nav({
  tab,
  onSelect,
  className,
  label = 'Onglets',
  bar = false,
}: {
  tab: Tab;
  onSelect: (t: Tab) => void;
  className: string;
  label?: string;
  bar?: boolean;
}) {
  return (
    <nav className={className} aria-label={label}>
      {TABS.map((t) => (
        <button
          key={t}
          type="button"
          aria-current={t === tab ? 'page' : undefined}
          onClick={() => onSelect(t)}
        >
          {bar && <i />}
          {t}
        </button>
      ))}
    </nav>
  );
}

const NAME: Record<SourceName, string> = { garmin: 'Garmin', campus: 'Campus' };

function SyncState({ status }: { status: DataStatus }) {
  return (
    <div className="sync">
      {(['garmin', 'campus'] as const).map((s) => {
        const { lastOkAt, last } = status.sources[s];
        const cls =
          last?.outcome === 'token-expired'
            ? 'alert'
            : last?.outcome === 'error'
              ? 'warn'
              : lastOkAt
                ? ''
                : 'off';
        const text =
          last?.outcome === 'token-expired'
            ? 'jeton expiré'
            : lastOkAt
              ? `${shortDate(parisDay(lastOkAt))} ${clock(lastOkAt)}`
              : 'jamais synchronisé';
        return (
          <div key={s}>
            <span className={`dot ${cls}`} />
            {NAME[s]} · {text}
          </div>
        );
      })}
      {status.missingNights.map((d) => (
        <div key={d}>
          <span className="dot warn" />
          Nuit du {shortDate(d)} manquante
        </div>
      ))}
    </div>
  );
}
