import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ExerciseDemo } from './ExerciseDemo.tsx';

afterEach(cleanup);

it('ouvre l’animation et le lien vidéo d’un exercice (D167)', () => {
  render(<ExerciseDemo name="Fente statique haltères" />);
  const btn = screen.getByRole('button', { name: 'Voir la démo : Fente statique haltères' });
  expect(btn.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(btn);
  expect(screen.getByRole('img', { name: 'Démonstration : Fente statique haltères' })).toBeTruthy();
  const link = screen.getByRole('link', { name: '▶ Voir en vidéo' });
  expect(link.getAttribute('href')).toContain('search_query=Fente%20statique%20halt%C3%A8res%20exercice');
  expect(link.getAttribute('target')).toBe('_blank');
});

it('sans animation : le dit, et garde la vidéo', () => {
  render(<ExerciseDemo name="Yoga des orteils" />);
  fireEvent.click(screen.getByRole('button', { name: 'Voir la démo : Yoga des orteils' }));
  expect(screen.getByText("Pas encore d'animation pour cet exercice.")).toBeTruthy();
  expect(screen.getByRole('link', { name: '▶ Voir en vidéo' })).toBeTruthy();
});

it('rien pour une étape cardio', () => {
  const { container } = render(<ExerciseDemo name="Marche rapide" />);
  expect(container.textContent).toBe('');
});
