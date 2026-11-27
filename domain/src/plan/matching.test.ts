import { describe, expect, it } from 'vitest';
import { S2_ACTIVITIES, S2_DETAILS, S2_WEEK } from '../fixtures/campus-s2.ts';
import { fromCampusWeek } from './campus.ts';
import { activitySport, matchWeek, type Activity } from './matching.ts';

const sessions = fromCampusWeek(S2_WEEK, S2_DETAILS);
const [r1, c1, c2] = sessions;

describe('matchWeek (semaine S2 réelle, 07/10 au soir)', () => {
  const { matches, offPlan } = matchWeek(sessions, S2_ACTIVITIES);

  it('rattache la course S2-1 par le lien Campus', () => {
    expect(matches.find((m) => m.sessionKey === c1?.key)).toMatchObject({
      activityId: '24631672339',
      day: '2026-10-06',
      method: 'campus-link',
      confidence: 'sure',
    });
  });

  it('place le renforcement validé sans activité au jour de validation (heure de Paris)', () => {
    expect(matches.find((m) => m.sessionKey === r1?.key)).toEqual({
      sessionKey: r1?.key,
      day: '2026-10-07',
      method: 'campus-completion',
      confidence: 'sure',
      reason: 'Validée dans Campus, sans activité Garmin',
    });
  });

  it('ne rattache rien aux séances à faire et ignore les marches', () => {
    expect(matches).toHaveLength(2);
    expect(offPlan).toEqual([]);
  });
});

describe('matchWeek, règles', () => {
  const run = (id: string, startLocal: string, min: number, type = 'running'): Activity => ({
    id,
    startLocal,
    type,
    durationS: min * 60,
  });

  it('rattache une course non validée si elle est la seule plausible', () => {
    const { matches } = matchWeek([c2!], [run('a', '2026-10-08 19:00:00', 38)]); // 36 min prévues
    expect(matches[0]).toMatchObject({
      activityId: 'a',
      day: '2026-10-08',
      method: 'rule',
      confidence: 'probable',
    });
  });

  it('marque incertain quand plusieurs activités conviennent', () => {
    const { matches } = matchWeek(
      [c2!],
      [run('a', '2026-10-08 19:00:00', 30), run('b', '2026-10-09 19:00:00', 37)],
    );
    expect(matches[0]).toMatchObject({ activityId: 'b', confidence: 'uncertain' });
  });

  it('refuse une durée trop éloignée et range l’activité hors plan', () => {
    const { matches, offPlan } = matchWeek([c2!], [run('a', '2026-10-08 19:00:00', 70)]);
    expect(matches).toEqual([]);
    expect(offPlan.map((a) => a.id)).toEqual(['a']);
  });

  it('plan Claude : seule activité du même sport le jour prévu, même si la durée s’écarte (D168)', () => {
    const renfo = { ...c2!, key: 'k-renfo', sport: 'strength' as const, durationMin: 40, day: '2026-11-23' };
    const gym = (id: string, startLocal: string, min: number) =>
      run(id, startLocal, min, 'strength_training');
    const { matches, offPlan } = matchWeek([renfo], [gym('g', '2026-11-23 19:30:00', 72)]);
    expect(matches[0]).toMatchObject({ activityId: 'g', day: '2026-11-23', confidence: 'probable' });
    expect(offPlan).toEqual([]);
    // Deux activités ce jour-là, ou la plus proche à deux jours : rien n'est deviné.
    expect(
      matchWeek([renfo], [gym('g', '2026-11-23 07:00:00', 72), gym('h', '2026-11-23 19:30:00', 10)]).matches,
    ).toEqual([]);
    expect(matchWeek([renfo], [gym('g', '2026-11-25 19:30:00', 72)]).matches).toEqual([]);
  });

  it('plan Claude : séance faite la veille ou le lendemain, et jamais au-delà d’un jour (D170)', () => {
    const renfo = (key: string, day: string) => ({
      ...c2!,
      key,
      sport: 'strength' as const,
      durationMin: 40,
      day,
    });
    const gym = (id: string, startLocal: string, min: number) =>
      run(id, startLocal, min, 'strength_training');
    // Prévue mardi, faite lundi (durée hors tolérance) : rattachée, au jour réel.
    const early = matchWeek([renfo('cle', '2026-11-24')], [gym('g', '2026-11-23 19:30:00', 75)]);
    expect(early.matches[0]).toMatchObject({ activityId: 'g', day: '2026-11-23', confidence: 'probable' });
    expect(early.matches[0]!.reason).toMatch(/la veille/);
    // Une autre séance de renfo jeudi, même durée : elle ne vole pas l'activité de lundi.
    const steal = matchWeek(
      [renfo('jeudi', '2026-11-26'), renfo('lundi', '2026-11-23')],
      [gym('g', '2026-11-23 19:30:00', 40)],
    );
    expect(steal.matches).toEqual([expect.objectContaining({ sessionKey: 'lundi', activityId: 'g' })]);
    // Séance du jour même servie avant la séance décalée.
    const both = matchWeek(
      [renfo('mardi', '2026-11-24'), renfo('lundi', '2026-11-23')],
      [gym('g', '2026-11-23 19:30:00', 75)],
    );
    expect(both.matches).toEqual([expect.objectContaining({ sessionKey: 'lundi', activityId: 'g' })]);
    // Deux jours d'écart : rien.
    expect(matchWeek([renfo('cle', '2026-11-25')], [gym('g', '2026-11-23 19:30:00', 40)]).matches).toEqual(
      [],
    );
  });

  it('rattachement à la main : prioritaire, au jour de l’activité, et l’activité n’est plus libre (D177)', () => {
    const renfo = (key: string, day: string) => ({
      ...c2!,
      key,
      sport: 'run' as const,
      durationMin: 30,
      day,
    });
    const acts = [run('t', '2026-11-26 18:00:00', 31, 'virtual_run')];
    // Sans lien, la règle donnerait l'activité à la séance de jeudi ; le lien la donne à celle de mercredi.
    const auto = matchWeek([renfo('jeu', '2026-11-26'), renfo('mer', '2026-11-25')], acts);
    expect(auto.matches.map((m) => m.sessionKey)).toEqual(['jeu']);
    const manual = matchWeek([renfo('jeu', '2026-11-26'), renfo('mer', '2026-11-25')], acts, { mer: 't' });
    expect(manual.matches).toEqual([
      expect.objectContaining({
        sessionKey: 'mer',
        activityId: 't',
        day: '2026-11-26',
        method: 'manual',
        confidence: 'sure',
      }),
    ]);
    expect(manual.offPlan).toEqual([]);
    // Lien vers une activité inconnue : ignoré.
    expect(matchWeek([renfo('mer', '2026-11-25')], [], { mer: 'x' }).matches).toEqual([]);
  });

  it('la durée prévue inclut l’échauffement et le retour au calme (D178)', () => {
    const course = { ...c2!, key: 'facile', durationMin: 30, extraMin: 17, day: '2026-11-26' };
    // 47 min faites pour 30 + 17 prévues : rattachée par la règle de durée, pas seulement par le jour.
    const { matches } = matchWeek([course], [run('t', '2026-11-26 18:00:00', 47)]);
    expect(matches[0]!.reason).toMatch(/±35 % de la durée prévue/);
  });

  it('ne réutilise pas une activité déjà liée par Campus', () => {
    const { matches } = matchWeek([c1!, c2!], [run('24631672339', '2026-10-06 20:58:51', 30)]);
    expect(matches.map((m) => m.sessionKey)).toEqual([c1?.key]);
  });

  it('classe les types Garmin', () => {
    expect(
      [
        'treadmill_running',
        'virtual_run',
        'indoor_running',
        'virtual_ride',
        'e_bike_fitness',
        'strength_training',
        'hiking',
        'indoor_rowing',
      ].map(activitySport),
    ).toEqual(['run', 'run', 'run', 'bike', 'bike', 'strength', 'walk', 'other']);
  });
});
