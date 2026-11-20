import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App.tsx';
import { STATUS, TODAY } from './today/fixture.ts';

let today = structuredClone(TODAY);
const calls: { url: string; init?: RequestInit }[] = [];

beforeEach(() => {
  today = structuredClone(TODAY);
  calls.length = 0;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init && { init }) });
    if (init?.method === 'PUT') {
      today.mobility.checked.morning = (JSON.parse(String(init.body)) as { done: boolean }).done;
      return Response.json({});
    }
    return Response.json(url === '/api/data/status' ? STATUS : today);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('affiche les 5 onglets et change d’onglet', async () => {
  render(<App />);
  const nav = screen.getByRole('navigation', { name: 'Onglets' });
  expect([...nav.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
    "Aujourd'hui",
    'Calendrier',
    'Saison',
    'Mobilité',
    'Données',
  ]);
  await screen.findByRole('heading', { level: 1, name: 'Jeudi 8 octobre' });
  fireEvent.click(within(nav).getByRole('button', { name: 'Données' }));
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Données');
});

it('Aujourd’hui : séance, forme et poids sur les données de l’API, absences signalées', async () => {
  render(<App />);
  await screen.findByRole('heading', { name: 'Jeudi 8 octobre' });
  // Prochaine séance dépliée dans « Cette semaine » : étapes et accès au détail.
  const next = screen.getByLabelText('Prochaine séance : Course S2-2');
  expect(within(next).getByRole('img', { name: /Lent 2′, Marche 1′\. À répéter 12 fois/ })).toBeTruthy();
  expect(within(next).getByRole('button', { name: 'Détail' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Renforcement S2-2' })).toBeTruthy();
  expect(screen.getByText('83,4 kg')).toBeTruthy();
  expect(screen.getByRole('img', { name: 'en baisse' }).textContent).toBe('−0,7 kg');
  // Forme ce matin : Body Battery au réveil, sommeil, préparation (écart avec la veille), récupération.
  expect(screen.getByRole('img', { name: 'Body Battery au réveil 78 sur 100' })).toBeTruthy();
  expect(screen.getByText('+59 cette nuit')).toBeTruthy();
  expect(screen.getByText('Bon sommeil')).toBeTruthy();
  expect(screen.getByText('+3 vs hier')).toBeTruthy();
  expect(screen.getByText('11,1 h')).toBeTruthy();
  expect(screen.queryAllByText('indisponible')).toHaveLength(0);
  expect(screen.getByText("Pas encore 4 semaines d'historique : pas de repère.")).toBeTruthy();
  // Mobilité : la semaine lun → dim (D150), jours à venir à part (jeudi 08/10 : ven., sam., dim.).
  const week = screen.getByRole('img', { name: /cette semaine avec au moins une routine/ });
  expect(week.querySelectorAll('i')).toHaveLength(7);
  expect(week.querySelectorAll('i.future')).toHaveLength(3);
  // Signaux : points surveillés, une absence de repère reste dite.
  const watched = screen.getByLabelText('Points surveillés');
  expect(within(watched).getByText('sous la plage')).toBeTruthy();
  expect(within(watched).getByText('pas encore de repère')).toBeTruthy();
  expect(within(watched).getByText('règles respectées')).toBeTruthy();
});

it('barre latérale : jeton Campus expiré et nuit manquante', async () => {
  render(<App />);
  await screen.findByText('Campus · jeton expiré');
  expect(screen.getByText('Nuit du 05/10 manquante')).toBeTruthy();
});

it('cocher la routine du matin écrit dans l’API puis relit l’écran', async () => {
  render(<App />);
  const box = (await screen.findAllByRole('checkbox'))[0]!;
  fireEvent.click(box);
  await waitFor(() => expect((box as HTMLInputElement).checked).toBe(true));
  expect(calls.find((c) => c.init?.method === 'PUT')).toMatchObject({
    url: '/api/mobility/log/2026-10-08/morning',
    init: { body: JSON.stringify({ done: true }) },
  });
});
