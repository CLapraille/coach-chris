import type { MobilityView } from '@coach-chris/domain';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Mobility } from './Mobility.tsx';

const days = Array.from({ length: 28 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 8, 11 + i));
  return d.toISOString().slice(0, 10);
});

const BASE: MobilityView = {
  today: '2026-10-08',
  morning: [
    { code: 'M1', name: 'Claps devant / derrière', durationS: 60, perSide: false },
    { code: 'M2', name: 'Balancement des bras', durationS: 60, perSide: false },
  ],
  evening: [],
  checked: { morning: false, evening: false },
  zones: [
    {
      zone: 'hip-rotation',
      label: 'Hanche · rotation interne',
      status: 'declared',
      detail: 'Limitation déclarée, pas encore testée',
      declared: true,
    },
  ],
  tests: {},
  block: null,
  proposal: null,
  regularity: {
    morning: { d7: { done: 0, days: 7, streak: 0 }, d28: { done: 0, days: 28, streak: 0 } },
    evening: { d7: { done: 0, days: 7, streak: 0 }, d28: { done: 0, days: 28, streak: 0 } },
  },
  last28: days.map((day) => ({ day, morning: false, evening: false })),
};

let view: MobilityView;
const calls: { url: string; init?: RequestInit }[] = [];

beforeEach(() => {
  view = structuredClone(BASE);
  calls.length = 0;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init && { init }) });
    if (url === '/api/inbox') return Response.json(init?.method ? {} : []);
    return Response.json(init?.method ? {} : view);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sent = (method: string) => calls.find((c) => c.init?.method === method);

it('sans tests : invitation à faire les tests, zones déclarées, pas de régularité inventée', async () => {
  render(<Mobility />);
  await screen.findByText('Ta routine du soir démarre après les tests.');
  expect(screen.getByText('déclarée')).toBeTruthy();
  expect(screen.getByText('Pas encore de données.')).toBeTruthy();
  expect(screen.getAllByText('pas encore fait')).toHaveLength(6);
});

it('« Faire les tests » ouvre le formulaire et l’amène à l’écran ; ouvert d’emblée depuis Aujourd’hui', async () => {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  const { unmount } = render(<Mobility />);
  fireEvent.click(await screen.findByRole('button', { name: 'Faire les tests' }));
  expect(screen.getByRole('form', { name: 'Saisie des auto-tests' })).toBeTruthy();
  expect(scroll).toHaveBeenCalled();
  unmount();
  render(<Mobility startTesting />);
  expect(await screen.findByRole('form', { name: 'Saisie des auto-tests' })).toBeTruthy();
});

it('saisie des tests : seuls les tests remplis des deux côtés sont envoyés', async () => {
  render(<Mobility />);
  fireEvent.click(await screen.findByRole('button', { name: 'Faire les 6 tests · 10 min' }));
  const form = screen.getByRole('form', { name: 'Saisie des auto-tests' });
  fireEvent.change(within(form).getByLabelText('Genou au mur, gauche (cm)'), { target: { value: '11' } });
  fireEvent.change(within(form).getByLabelText('Genou au mur, droite (cm)'), { target: { value: '9,5' } });
  fireEvent.change(within(form).getByLabelText('Thomas modifié, gauche'), { target: { value: 'above' } });
  // Thomas incomplet : envoi bloqué.
  expect(within(form).getByText(/Remplis les deux côtés pour : Thomas modifié/)).toBeTruthy();
  fireEvent.change(within(form).getByLabelText('Thomas modifié, droite'), { target: { value: 'level' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Enregistrer 2 tests' }));
  await waitFor(() => expect(sent('POST')).toBeTruthy());
  expect(JSON.parse(String(sent('POST')!.init!.body))).toEqual({
    kneeToWallCm: { left: 11, right: 9.5 },
    thomas: { left: 'above', right: 'level' },
  });
});

it('bloc proposé : validation explicite avant de démarrer (D78)', async () => {
  view.proposal = [
    {
      code: 'H1',
      name: 'Hanche 90/90, transitions',
      durationS: 120,
      perSide: false,
      reason: 'test',
      slot: 'socle',
    },
    {
      code: 'P1',
      name: 'Extension du gros orteil',
      durationS: 60,
      perSide: true,
      reason: 'test',
      slot: 'socle',
    },
  ];
  render(<Mobility />);
  fireEvent.click(await screen.findByRole('button', { name: 'Valider et démarrer le bloc' }));
  await waitFor(() => expect(sent('POST')).toBeTruthy());
  expect(sent('POST')).toMatchObject({
    url: '/api/mobility/blocks/accept',
    init: { body: JSON.stringify({ codes: ['H1', 'P1'] }) },
  });
});

it('mode guidé : « Valider » à chaque exercice, la routine est cochée à la fin', async () => {
  render(<Mobility />);
  fireEvent.click((await screen.findAllByRole('button', { name: 'Démarrer' }))[0]!);
  const dialog = screen.getByRole('dialog', { name: 'Routine du matin' });
  expect(within(dialog).getByText('Exercice 1 / 2')).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Valider' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Valider et terminer' }));
  await waitFor(() => expect(sent('PUT')).toBeTruthy());
  expect(sent('PUT')).toMatchObject({
    url: '/api/mobility/log/2026-10-08/morning',
    init: { body: JSON.stringify({ done: true }) },
  });
});

it('démonstrations : la fiche suit l’exercice choisi', async () => {
  render(<Mobility />);
  fireEvent.click(await screen.findByRole('button', { name: /C3 Soléaire genou plié/ }));
  expect(screen.getByText('C3 · Soléaire genou plié')).toBeTruthy();
  expect(screen.getByText(/tendon d'Achille/)).toBeTruthy();
});

it('plan Claude : variante du matin, routine bureau, soir remplacé (D157)', async () => {
  view.planWeek = {
    focus: 'Chevilles et pieds',
    morning: [{ replaces: 'M2 Balancement des bras', by: 'Pompes de cheville au lit' }],
    morningWhy: 'Prépare le pied avant les premiers pas.',
    office: {
      name: 'Routine bureau',
      dureeMin: 10,
      steps: [{ name: 'Balle sous le pied', duree: '1 min / pied' }],
    },
  };
  render(<Mobility />);
  const card = await screen.findByLabelText('Routines du plan');
  expect(within(card).getByText('Cette semaine · Chevilles et pieds')).toBeTruthy();
  expect(within(card).getByText('Pompes de cheville au lit')).toBeTruthy();
  expect(within(card).getByText('Balle sous le pied')).toBeTruthy();
  expect(screen.getByText('remplacée par le plan Claude')).toBeTruthy();
  expect(screen.queryByText('Faire les tests', { selector: '.routine button' })).toBeNull();
});

it('boîte à vidéos : envoie le lien et la note (D158)', async () => {
  render(<Mobility />);
  const box = await screen.findByLabelText('Boîte à vidéos');
  fireEvent.change(within(box).getByLabelText('Lien'), {
    target: { value: 'https://youtube.com/shorts/abc' },
  });
  fireEvent.change(within(box).getByLabelText('Ce que ça travaille'), {
    target: { value: 'mollet sur marche' },
  });
  fireEvent.click(within(box).getByRole('button', { name: 'Ajouter' }));
  await waitFor(() =>
    expect(calls.some((c) => c.url === '/api/inbox' && c.init?.method === 'POST')).toBe(true),
  );
  const post = calls.find((c) => c.url === '/api/inbox' && c.init?.method === 'POST')!;
  expect(JSON.parse(String(post.init!.body))).toEqual({
    url: 'https://youtube.com/shorts/abc',
    note: 'mollet sur marche',
  });
});
