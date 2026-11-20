import { describe, expect, it } from 'vitest';
import {
  CLAUDE_PLAN_FORMAT,
  fromClaudeWeek,
  planProblems,
  type ClaudePlanFile,
  type ClaudeWeek,
} from './claude.ts';

const WEEK: ClaudeWeek = {
  index: 1,
  start: '2026-11-23',
  focus: 'Chevilles et pieds',
  sessions: [
    {
      id: 's1-lun-course',
      date: '2026-11-23',
      sport: 'course',
      role: 'fixe',
      titre: 'Course facile',
      dureeMin: 30,
      echauffement: 'ech',
      corps: [{ bloc: '30 min', cible: 'FC ≤ 140' }],
    },
    {
      id: 's1-mar-renfo',
      date: '2026-11-24',
      sport: 'renfo',
      role: 'cle',
      titre: 'Séance clé',
      dureeMin: 40,
      corps: [{ exo: 'Fente statique haltères' }, { exo: 'Pied court' }],
    },
    {
      id: 's1-mer-flex',
      date: '2026-11-25',
      sport: 'velo',
      role: 'flexible',
      titre: 'Vélo endurance',
      dureeMin: 45,
      corps: [{ bloc: '45 min' }],
      alternatives: { course: { titre: 'Course facile', dureeMin: 35, corps: [{ bloc: '35 min' }] } },
    },
    {
      id: 's1-ven-option',
      date: '2026-11-27',
      sport: 'mobilite',
      role: 'optionnelle',
      titre: 'Mobilité',
      dureeMin: 20,
      corps: [{ exo: 'Chat-vache' }],
    },
  ],
};

describe('fromClaudeWeek', () => {
  it('garde l’ordre du plan, une clé stable et le jour prévu', () => {
    const s = fromClaudeWeek(WEEK);
    expect(s.map((x) => x.key)).toEqual([
      '2026-11-23#0#s1-lun-course',
      '2026-11-23#1#s1-mar-renfo',
      '2026-11-23#2#s1-mer-flex',
      '2026-11-23#3#s1-ven-option',
    ]);
    expect(s.map((x) => x.day)).toEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-27']);
    expect(s.every((x) => x.source === 'claude' && x.status === 'todo' && !x.intense)).toBe(true);
  });

  it('traduit sport et rôle ; le renfo jambes est reconnu par ses exercices', () => {
    const s = fromClaudeWeek(WEEK);
    expect(s.map((x) => [x.sport, x.trainingType])).toEqual([
      ['run', 'Fixe'],
      ['strength', 'Clé'],
      ['bike', 'Flexible'],
      ['other', 'Optionnelle'],
    ]);
    expect(s[1]).toMatchObject({ legs: true, legsFrom: 'exercises' });
  });

  it('la séance flexible suit le réglage quand le plan propose la variante', () => {
    const flex = fromClaudeWeek(WEEK, 'course')[2]!;
    expect(flex).toMatchObject({ sport: 'run', displayName: 'Course facile', durationMin: 35 });
    // La séance fixe ne change jamais de sport.
    expect(fromClaudeWeek(WEEK, 'course')[0]!.sport).toBe('run');
  });
});

describe('planProblems', () => {
  const plan = (weeks: ClaudeWeek[]): ClaudePlanFile => ({
    format: CLAUDE_PLAN_FORMAT,
    source: 'claude',
    generatedAt: '2026-11-20',
    block: { id: 'b', phase: 'Base', name: 'Base', start: '2026-11-23', end: '2026-11-29' },
    routines: { ech: { name: 'Échauffement', dureeMin: 8, steps: [] } },
    weeks,
  });

  it('accepte un plan cohérent', () => {
    expect(planProblems(plan([WEEK]))).toEqual([]);
  });

  it('signale lundi manquant, séance hors semaine, doublon et routine inconnue', () => {
    const bad: ClaudeWeek = {
      ...WEEK,
      start: '2026-11-24',
      sessions: [{ ...WEEK.sessions[0]!, date: '2026-12-10', retourAuCalme: 'inconnue' }, WEEK.sessions[0]!],
    };
    expect(planProblems(plan([bad]))).toEqual([
      "semaine 1 : 2026-11-24 n'est pas un lundi",
      'séance « s1-lun-course » hors de la semaine 1',
      's1-lun-course : routine inconnue « inconnue »',
      'séance « s1-lun-course » en double',
      'séance « s1-lun-course » hors de la semaine 1',
    ]);
  });
});
