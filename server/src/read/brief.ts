import {
  activitySport,
  addDays,
  claudeBrief,
  mondayOf,
  seasonView,
  type BriefActivity,
  type BriefInput,
  type BriefSession,
  type BriefWeek,
  type CachedActivity,
  type PlannedSession,
  type WeekSession,
} from '@coach-chris/domain';
import { readSeason, readSettings } from '../plan/claude.ts';
import type { Store } from '../store/store.ts';
import { activities, night, planWeek } from './cache.ts';
import { readCheckins } from './checkin.ts';
import { listInbox } from './inbox.ts';
import { readAccepted } from './review.ts';
import { weekData } from './week.ts';

/** Semaines revues par défaut : un bloc de 4 semaines, semaine en cours comprise. */
export const BRIEF_WEEKS = 4;
/** Semaines de tendance du volume de course. */
const TREND_WEEKS = 8;

const brief = (a: CachedActivity): BriefActivity => ({
  day: a.startLocal.slice(0, 10),
  type: a.type,
  durationS: a.durationS,
  ...(a.name !== undefined && { name: a.name }),
  ...(a.distanceM !== undefined && { distanceM: a.distanceM }),
  ...(a.avgHr !== undefined && { avgHr: a.avgHr }),
});

function session(
  s: WeekSession,
  planned: PlannedSession | undefined,
  byId: Map<string, CachedActivity>,
  checkins: BriefWeek['sessions'][number]['checkin'],
): BriefSession {
  const a = s.match?.activityId ? byId.get(s.match.activityId) : undefined;
  const day = planned?.day ?? s.day ?? undefined;
  return {
    title: s.displayName,
    sport: s.sport,
    role: s.trainingType || 'séance',
    plannedMin: s.durationMin,
    ...(day && { plannedDay: day }),
    ...(s.match && { done: { day: s.match.day, ...(a && { activity: brief(a) }) } }),
    ...(checkins && { checkin: checkins }),
  };
}

/** Bilan pour Claude (D171) : les `weeks` dernières semaines, semaine en cours comprise, et ce qui reste au plan. */
export async function claudeBriefText(store: Store, today: string, weeks = BRIEF_WEEKS): Promise<string> {
  const current = mondayOf(today);
  const mondays = Array.from({ length: weeks }, (_, i) => addDays(current, -7 * (weeks - 1 - i)));
  const from = mondays[0]!;
  const trendFrom = addDays(current, -7 * (TREND_WEEKS - 1));
  const [acts, checkins, seasonFile, settings, inbox] = await Promise.all([
    activities(store, trendFrom < from ? trendFrom : from, addDays(current, 6)),
    readCheckins(store, from, addDays(current, 6)),
    readSeason(store),
    readSettings(store),
    listInbox(store),
  ]);
  const byId = new Map(acts.map((a) => [a.id, a]));
  const checkinByDay = new Map(checkins.map((c) => [c.date, c]));

  let athlete: Record<string, unknown> | undefined;
  const weekBriefs: BriefWeek[] = [];
  for (const monday of mondays) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const [{ view, plan }, review, nights] = await Promise.all([
      weekData(store, monday, today),
      readAccepted(store, monday),
      Promise.all(days.filter((d) => d <= today).map((d) => night(store, d))),
    ]);
    if (plan?.claude?.athlete) athlete = plan.claude.athlete;
    const plannedByKey = new Map((plan?.sessions ?? []).map((p) => [p.key, p]));
    const sessions = view.sessions.map((s) => {
      const planned = plannedByKey.get(s.key);
      const id = planned?.source === 'claude' ? planned.name : undefined;
      const sc = id
        ? days.map((d) => checkinByDay.get(d)?.sessions?.[id]).find((c) => c !== undefined)
        : undefined;
      return session(s, planned, byId, sc);
    });
    const weekActs = acts
      .filter((a) => a.startLocal.slice(0, 10) >= monday && a.startLocal.slice(0, 10) <= days[6]!)
      .filter((a) => activitySport(a.type) !== 'walk');
    const foot = Object.fromEntries(
      days.flatMap((d) => {
        const n = checkinByDay.get(d)?.foot;
        return n === undefined ? [] : [[d, n] as const];
      }),
    );
    const block = plan?.claude?.block;
    weekBriefs.push({
      monday,
      source: plan?.source ?? null,
      ...(block && {
        block: {
          name: block.name,
          phase: block.phase,
          start: block.start,
          end: block.end,
          ...(block.objectif && { objectif: block.objectif }),
        },
      }),
      ...(plan?.claude?.week.focus && { focus: plan.claude.week.focus }),
      sessions,
      activities: weekActs.map(brief),
      offPlan: view.offPlan.filter((a) => activitySport(a.type) !== 'walk').map(brief),
      foot,
      review,
      nights: nights.flatMap((n) => (n ? [n] : [])),
    });
  }

  // Ce qui reste au plan après la semaine en cours (jusqu'à 4 semaines).
  const upcoming: BriefInput['upcoming'] = [];
  for (let i = 1; i <= 4; i++) {
    const monday = addDays(current, 7 * i);
    const plan = await planWeek(store, monday);
    if (!plan?.sessions.length) break;
    upcoming.push({
      monday,
      source: plan.source,
      sessions: plan.sessions.map((p) => ({
        title: p.displayName,
        sport: p.sport,
        role: p.trainingType,
        plannedMin: p.durationMin,
        ...(p.day && { plannedDay: p.day }),
      })),
    });
  }

  const runTrend = Array.from({ length: TREND_WEEKS }, (_, i) => {
    const monday = addDays(trendFrom, 7 * i);
    const end = addDays(monday, 6);
    const s = acts
      .filter((a) => activitySport(a.type) === 'run')
      .filter((a) => a.startLocal.slice(0, 10) >= monday && a.startLocal.slice(0, 10) <= end)
      .reduce((sum, a) => sum + a.durationS, 0);
    return { monday, minutes: Math.round(s / 60) };
  });

  const season = seasonView(seasonFile, settings, today);
  const races = season.events
    .filter((e) => !e.past)
    .slice(0, 8)
    .map((e) => {
      const opt = e.chosen !== undefined ? e.options[e.chosen] : undefined;
      return {
        name: e.name,
        date: e.date,
        dateConfirmed: e.dateConfirmed,
        ...(e.dateLabel && { dateLabel: e.dateLabel }),
        priority: e.priority,
        terrain: e.terrain,
        ...(opt && { distance: `${opt.km} km${opt.dPlus ? ` D+${opt.dPlus}` : ''}` }),
        daysUntil: e.daysUntil,
      };
    });

  return claudeBrief({
    today,
    ...(athlete && { athlete }),
    weeks: weekBriefs,
    upcoming,
    runTrend,
    races,
    inbox: inbox.map((v) => ({ url: v.url, note: v.note })),
  });
}
