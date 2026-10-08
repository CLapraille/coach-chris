import type { WeekView } from '@coach-chris/domain';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TODAY } from '../today/fixture.ts';
import { Calendar } from './Calendar.tsx';

const calls: { url: string; init?: RequestInit }[] = [];
let week: WeekView;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
  week = structuredClone(TODAY.week);
  calls.length = 0;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init && { init }) });
    if (url.startsWith('/api/calendar/month')) return Response.json({ month: '2026-10', weeks: [week] });
    return Response.json(week);
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('semaine : séances placées, disponibilité du jour, routines cochables jusqu’à J-3', async () => {
  render(<Calendar />);
  await screen.findByRole('heading', { name: 'Semaine du 5 octobre' });
  expect(calls[0]!.url).toBe('/api/calendar/week?start=2026-10-05');
  expect(screen.getByText('Course S2-2')).toBeTruthy();
  expect(screen.getByTitle('Disponibilité du matin (Garmin)').textContent).toBe('76');
  // Lundi 5 est à J-3 : cochable ; aucune case pour les jours à venir.
  expect(screen.getAllByRole('checkbox', { name: 'matin' })).toHaveLength(4);
});

it('déplacer une séance par la liste des jours envoie le placement', async () => {
  render(<Calendar />);
  const select = await screen.findByRole('combobox', { name: 'Déplacer Renforcement S2-2' });
  fireEvent.change(select, { target: { value: '2026-10-11' } });
  await waitFor(() => expect(calls.some((c) => c.init?.method === 'PUT')).toBe(true));
  expect(calls.find((c) => c.init?.method === 'PUT')).toMatchObject({
    url: '/api/calendar/week/2026-10-05/placement',
    init: { body: JSON.stringify({ key: 'k3', day: '2026-10-11' }) },
  });
});

it('placement ajusté : bouton pour revenir à la proposition', async () => {
  week.manual = true;
  render(<Calendar />);
  fireEvent.click(await screen.findByRole('button', { name: 'Revenir à la proposition' }));
  await waitFor(() => expect(calls.some((c) => c.init?.method === 'DELETE')).toBe(true));
});

it('vue mois : total de semaine et ouverture de la semaine', async () => {
  render(<Calendar />);
  await screen.findByRole('heading', { name: 'Semaine du 5 octobre' });
  fireEvent.click(screen.getByRole('button', { name: 'Mois' }));
  await screen.findByRole('heading', { name: 'Octobre 2026' });
  const total = screen.getByTitle('Ouvrir la semaine du 05/10');
  expect(total.textContent).toContain('66 min');
  fireEvent.click(total);
  await screen.findByRole('heading', { name: 'Semaine du 5 octobre' });
});
