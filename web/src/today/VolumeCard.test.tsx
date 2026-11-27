import type { VolumeView } from '@coach-chris/domain';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { VolumeCard } from './VolumeCard.tsx';

afterEach(cleanup);

const days = [
  '2026-11-23',
  '2026-11-24',
  '2026-11-25',
  '2026-11-26',
  '2026-11-27',
  '2026-11-28',
  '2026-11-29',
];
const routines = Object.fromEntries(days.map((d, i) => [d, { morning: i < 3, evening: i === 0 }]));
const VOLUME: VolumeView = {
  weeks: [{ start: '2026-11-23', run: 47, bike: 0, strength: 72 }],
  cap: { run: null, total: null },
  planned: { run: 139, bike: 55, strength: 57, total: 251 },
  remaining: { run: 62, bike: 55, strength: 0 },
};

it('semaine du plan Claude : vélo prévu, reste à faire, mobilité du matin seulement (D179)', () => {
  render(<VolumeCard volume={VOLUME} routines={routines} source="claude" />);
  expect(screen.getByText('Plan Claude')).toBeTruthy();
  expect(screen.queryByText('Campus')).toBeNull();
  expect(
    screen.getByRole('img', { name: 'Vélo : 0 minutes faites, 55 prévues, pas de repère' }),
  ).toBeTruthy();
  expect(screen.getByText('prévu 55 · pas de repère')).toBeTruthy();
  // 3 matins cochés sur 7 ; la routine du soir cochée lundi ne compte pas (remplacée, D157).
  expect(screen.getByText('3 / 7 routines')).toBeTruthy();
  expect(screen.getByText('matin')).toBeTruthy();
});

it('semaine Campus : matin et soir', () => {
  render(<VolumeCard volume={VOLUME} routines={routines} source="campus" />);
  expect(screen.getByText('4 / 14 routines')).toBeTruthy();
  expect(screen.getByText('Campus')).toBeTruthy();
});
