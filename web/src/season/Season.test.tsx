import type { SeasonView } from '@coach-chris/domain';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Season } from './Season.tsx';

const VIEW: SeasonView = {
  season: '2027',
  nextA: 'boucles',
  settings: { flexDefault: 'velo' },
  events: [
    {
      id: 'sylvester',
      name: 'Sylvesterlaf',
      date: '2026-12-31',
      dateConfirmed: true,
      place: 'Rambrouch',
      country: 'Luxembourg',
      terrain: 'route',
      priority: 'C',
      options: [{ km: 10 }],
      chosen: 0,
      daysUntil: 41,
      past: false,
      closeTo: [],
    },
    {
      id: 'aischdall',
      name: 'Aischdall Trail',
      date: '2027-08-15',
      dateConfirmed: false,
      dateLabel: 'Mi-août',
      place: 'Eischen',
      country: 'Luxembourg',
      terrain: 'trail',
      priority: 'C',
      options: [{ km: 11 }, { km: 21 }],
      chosen: 1,
      daysUntil: 268,
      past: false,
      closeTo: [],
    },
    {
      id: 'boucles',
      name: 'Les Boucles Ardennaises',
      date: '2027-06-05',
      dateConfirmed: true,
      place: 'La Roche-en-Ardenne',
      country: 'Belgique',
      terrain: 'trail',
      priority: 'A',
      options: [{ km: 21, dPlus: 600 }],
      chosen: 0,
      series: 'Lupulus Trophy',
      daysUntil: 197,
      past: false,
      closeTo: [],
    },
  ],
};

const calls: { url: string; init?: RequestInit }[] = [];
beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init && { init }) });
    return Response.json(init?.method === 'PUT' ? JSON.parse(String(init.body)) : VIEW);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('montre la prochaine course, l’objectif A et la distance choisie', async () => {
  render(<Season />);
  await screen.findByRole('heading', { level: 1, name: 'Saison 2027' });
  expect(screen.getByText('Prochaine course : Sylvesterlaf, dans 41 jours')).toBeTruthy();
  const goal = screen.getByLabelText('Objectif principal');
  expect(within(goal).getByRole('heading', { name: 'Les Boucles Ardennaises' })).toBeTruthy();
  expect(within(goal).getByText('197')).toBeTruthy();
  const list = screen.getByLabelText('Calendrier des courses');
  expect(within(list).getByText('21 km', { selector: '.sn-opt.on' })).toBeTruthy();
  expect(within(list).getByText('Mi-août')).toBeTruthy();
});

it('change le sport par défaut de la séance flexible', async () => {
  render(<Season />);
  const course = await screen.findByRole('radio', { name: 'Course' });
  fireEvent.click(course);
  await waitFor(() => expect(calls.some((c) => c.init?.method === 'PUT')).toBe(true));
  const put = calls.find((c) => c.init?.method === 'PUT')!;
  expect(put.url).toBe('/api/season/settings');
  expect(JSON.parse(String(put.init!.body))).toEqual({ flexDefault: 'course' });
  expect(course.getAttribute('aria-checked')).toBe('true');
});
