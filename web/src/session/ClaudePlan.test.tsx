import type { ClaudeContent } from '@coach-chris/domain';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ClaudePlan } from './ClaudePlan.tsx';

afterEach(cleanup);

const CONTENT: ClaudeContent = {
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
      sport: 'rameur',
      titre: 'Rameur endurance',
      dureeMin: 35,
      corps: [{ bloc: '3 × 8 min', cible: 'FC 125–135' }],
      kinomap: '6 min échauffement · 3 × (8 + 1) · 6 min calme',
    },
  ],
};

it('montre le pourquoi, l’échauffement et le corps de la variante du jour', () => {
  render(<ClaudePlan content={CONTENT} />);
  const card = screen.getByLabelText('Contenu de la séance');
  expect(within(card).getByText('Aérobie sans impact.')).toBeTruthy();
  expect(within(card).getByText('Avant · Échauffement vélo · 10 min')).toBeTruthy();
  expect(within(card).getByText('Pédalage souple')).toBeTruthy();
  expect(within(card).getByText('100–115 W')).toBeTruthy();
});

it('la séance flexible montre ses autres sports', () => {
  render(<ClaudePlan content={CONTENT} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Rameur · 35 min' }));
  expect(screen.getByText('FC 125–135')).toBeTruthy();
  expect(screen.getByText(/Kinomap · 6 min échauffement/)).toBeTruthy();
  expect(screen.queryByText('Pédalage souple')).toBeNull();
});
