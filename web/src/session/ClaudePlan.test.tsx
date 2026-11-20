import type { ClaudeContent } from '@coach-chris/domain';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ClaudePlan } from './ClaudePlan.tsx';

const calls: { url: string; init?: RequestInit }[] = [];
beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init && { init }) });
    return Response.json({});
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CONTENT: ClaudeContent = {
  id: 's1-mer-flex',
  date: '2026-11-25',
  role: 'flexible',
  pourquoi: 'Aérobie sans impact.',
  variants: [
    {
      sport: 'velo',
      titre: 'Vélo endurance',
      dureeMin: 45,
      warmup: {
        id: 'ech-velo',
        name: 'Échauffement vélo',
        dureeMin: 10,
        steps: [{ name: 'Pédalage souple', duree: '5 min' }],
      },
      corps: [{ bloc: '45 min stable', cible: '100–115 W', consigne: 'Cadence 85–95.' }],
    },
    {
      sport: 'course',
      titre: 'Course facile',
      dureeMin: 35,
      corps: [{ bloc: '35 min', cible: 'FC ≤ 140' }],
    },
  ],
};

const put = () => calls.find((c) => c.init?.method === 'PUT');

it('montre le pourquoi, l’échauffement et le corps de la variante du jour', () => {
  render(<ClaudePlan content={CONTENT} today="2026-11-24" onChanged={() => {}} />);
  const card = screen.getByLabelText('Contenu de la séance');
  expect(within(card).getByText('Aérobie sans impact.')).toBeTruthy();
  expect(within(card).getByText('Avant · Échauffement vélo · 10 min')).toBeTruthy();
  expect(within(card).getByText('100–115 W')).toBeTruthy();
  // Avant le jour de la séance : pas de scores à saisir.
  expect(within(card).queryByText('Effort ressenti /10')).toBeNull();
});

it('séance flexible : choisir un autre sport l’enregistre pour le jour (D159)', async () => {
  const onChanged = vi.fn();
  render(<ClaudePlan content={CONTENT} today="2026-11-24" onChanged={onChanged} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Course · 35 min' }));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(put()!.url).toBe('/api/checkins/2026-11-25/sessions/s1-mer-flex');
  expect(JSON.parse(String(put()!.init!.body))).toEqual({ swap: 'course' });
});

it('le jour venu : tibia pour une course, effort ressenti', async () => {
  const run = { ...CONTENT, variants: [CONTENT.variants[1]!, CONTENT.variants[0]!] };
  render(<ClaudePlan content={run} checkin={{ shin: 5 }} today="2026-11-25" onChanged={() => {}} />);
  expect(screen.getByText(/Tibia au-dessus de 3\/10/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Effort ressenti /10'), { target: { value: '6' } });
  await waitFor(() => expect(put()).toBeTruthy());
  expect(JSON.parse(String(put()!.init!.body))).toEqual({ rpe: 6 });
});
