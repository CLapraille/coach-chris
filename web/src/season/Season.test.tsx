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

it('ajoute une course à la main (D165)', async () => {
  render(<Season />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ajouter une course' }));
  const form = screen.getByRole('form', { name: 'Nouvelle course' });
  fireEvent.change(within(form).getByLabelText('Nom'), { target: { value: 'Trail des Cerfs' } });
  fireEvent.change(within(form).getByLabelText('Date'), { target: { value: '2027-09-19' } });
  fireEvent.change(within(form).getByLabelText('Lieu'), { target: { value: 'Saint-Hubert' } });
  fireEvent.change(within(form).getByLabelText('Kilomètres 1'), { target: { value: '21,5' } });
  fireEvent.change(within(form).getByLabelText('Dénivelé 1'), { target: { value: '500' } });
  fireEvent.click(within(form).getByRole('radio', { name: 'B' }));
  fireEvent.click(within(form).getByRole('button', { name: 'Ajouter la course' }));
  await waitFor(() => expect(calls.some((c) => c.init?.method === 'POST')).toBe(true));
  const post = calls.find((c) => c.init?.method === 'POST')!;
  expect(post.url).toBe('/api/season/events');
  expect(JSON.parse(String(post.init!.body))).toEqual({
    name: 'Trail des Cerfs',
    date: '2027-09-19',
    dateConfirmed: true,
    place: 'Saint-Hubert',
    country: 'Belgique',
    terrain: 'trail',
    priority: 'B',
    options: [{ km: 21.5, dPlus: 500 }],
    chosen: 0,
  });
});

it('modifie et supprime une course, suppression confirmée', async () => {
  render(<Season />);
  fireEvent.click(await screen.findByRole('button', { name: 'Modifier Sylvesterlaf' }));
  const form = screen.getByRole('form', { name: 'Modifier Sylvesterlaf' });
  expect((within(form).getByLabelText('Nom') as HTMLInputElement).value).toBe('Sylvesterlaf');
  fireEvent.click(within(form).getByRole('radio', { name: 'A' }));
  fireEvent.click(within(form).getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() => expect(calls.some((c) => c.url === '/api/season/events/sylvester')).toBe(true));
  expect(
    JSON.parse(String(calls.find((c) => c.url === '/api/season/events/sylvester')!.init!.body)).priority,
  ).toBe('A');

  fireEvent.click(await screen.findByRole('button', { name: 'Modifier Sylvesterlaf' }));
  const again = screen.getByRole('form', { name: 'Modifier Sylvesterlaf' });
  fireEvent.click(within(again).getByRole('button', { name: 'Supprimer cette course' }));
  expect(calls.some((c) => c.init?.method === 'DELETE')).toBe(false);
  fireEvent.click(within(again).getByRole('button', { name: 'Confirmer la suppression' }));
  await waitFor(() => expect(calls.some((c) => c.init?.method === 'DELETE')).toBe(true));
});
