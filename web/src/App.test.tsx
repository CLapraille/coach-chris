import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { App } from './App.tsx';

it('affiche les 4 onglets de la V1 et change d’onglet', () => {
  render(<App />);
  const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
  expect([...nav.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
    "Aujourd'hui",
    'Calendrier',
    'Mobilité',
    'Données',
  ]);
  fireEvent.click(screen.getByRole('button', { name: 'Données' }));
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Données');
});
