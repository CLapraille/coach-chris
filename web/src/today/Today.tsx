import type { DataStatus, TodayView } from '@coach-chris/domain';
import { useApi } from '../api.ts';
import { clock, longDate } from '../format.ts';
import { FormCard } from './FormCard.tsx';
import { GoalCard } from './GoalCard.tsx';
import { MobilityCard } from './MobilityCard.tsx';
import { SignalsCard } from './SignalsCard.tsx';
import { VolumeCard } from './VolumeCard.tsx';
import { WeekCard } from './WeekCard.tsx';
import { Loading } from '../Loading.tsx';

export function Today({
  status,
  onNavigate,
  onOpenSession,
}: {
  status: DataStatus | null;
  onNavigate: (tab: 'Calendrier' | 'Mobilité') => void;
  onOpenSession: (key: string) => void;
}) {
  const res = useApi<TodayView>('/today');
  if (res.state === 'loading') return <Loading />;
  if (res.state === 'error') {
    return (
      <div className="card" role="alert">
        <h2 className="text-lg">Le serveur ne répond pas</h2>
        <p className="empty">{res.error.message}</p>
      </div>
    );
  }
  const t = res.data;
  return (
    <section aria-labelledby="today-title">
      <div className="a-head">
        <h1 id="today-title">{longDate(t.today)}</h1>
        {status && <Freshness status={status} />}
      </div>
      <div className="grid">
        {/* Ordre choisi par l'utilisateur (D138) : forme, semaine, objectif, volume, mobilité, signaux. */}
        <FormCard form={t.form} />
        <WeekCard
          week={t.week}
          next={t.nextSession}
          evenings={t.evenings}
          today={t.today}
          onOpen={onOpenSession}
          onOpenCalendar={() => onNavigate('Calendrier')}
          onChanged={res.reload}
        />
        <GoalCard goal={t.goal} today={t.today} />
        <VolumeCard volume={t.volume} routines={t.week.routines} />
        <MobilityCard
          mobility={t.mobility}
          today={t.today}
          onChanged={res.reload}
          onOpenMobility={() => onNavigate('Mobilité')}
        />
        <SignalsCard signals={t.signals} today={t} />
      </div>
      <footer className="note">
        Sources : Garmin Connect (disponibilité, VFC, sommeil, Body Battery, stress, activités, poids) et
        Campus Coach (plan, séances, statuts) via les serveurs MCP. « Calculé » : règle ou table propre à
        CoachChris, détaillée dans chaque signal. Valeurs absentes affichées comme indisponibles, jamais
        estimées.
      </footer>
    </section>
  );
}

function Freshness({ status }: { status: DataStatus }) {
  const { garmin, campus } = status.sources;
  const ok = garmin.last?.outcome === 'ok' && campus.last?.outcome === 'ok';
  return (
    <span className="muted text-[12.5px]">
      <span className={`dot ${ok ? '' : 'warn'}`} />
      {ok ? 'Données à jour' : 'Synchro incomplète'}
      {garmin.lastOkAt && ` · Garmin ${clock(garmin.lastOkAt)}`}
      {campus.lastOkAt && ` · Campus ${clock(campus.lastOkAt)}`}
    </span>
  );
}
