import type { DataStatus, TodayView } from '@coach-chris/domain';
import { useApi } from '../api.ts';
import { needsSignIn, signIn } from '../auth.ts';
import { clock, longDate } from '../format.ts';
import { FootCard } from './FootCard.tsx';
import { ReviewCard } from './ReviewCard.tsx';
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
  onOpenTests,
  onOpenSession,
}: {
  status: DataStatus | null;
  onNavigate: (tab: 'Calendrier' | 'Mobilité') => void;
  /** Onglet Mobilité, formulaire des auto-tests ouvert. */
  onOpenTests: () => void;
  onOpenSession: (key: string) => void;
}) {
  const res = useApi<TodayView>('/today');
  if (res.state === 'loading') return <Loading />;
  if (res.state === 'error') {
    const auth = needsSignIn(res.error);
    return (
      <div className="card" role="alert">
        <h2 className="text-lg">{auth ? 'Connexion à renouveler' : 'Le serveur ne répond pas'}</h2>
        <p className="empty">
          {auth ? 'Ta session Microsoft a expiré (elle dure 24 h).' : res.error.message}
        </p>
        <div>
          <button
            className="btn primary"
            type="button"
            onClick={() => void (auth ? signIn() : location.reload())}
          >
            {auth ? 'Se reconnecter' : 'Réessayer'}
          </button>
        </div>
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
        {/* Check-in du matin d'abord (D159), puis l'ordre choisi par l'utilisateur (D138). */}
        <FootCard key={t.today} today={t.today} foot={t.checkin.foot} onChanged={res.reload} />
        <ReviewCard today={t.today} onChanged={res.reload} />
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
        <VolumeCard volume={t.volume} routines={t.week.routines} source={t.week.plan?.source ?? null} />
        <MobilityCard
          mobility={t.mobility}
          today={t.today}
          onChanged={res.reload}
          onOpenTests={onOpenTests}
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
