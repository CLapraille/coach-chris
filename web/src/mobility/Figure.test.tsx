import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Figure } from './Figure.tsx';
import Mannequin from './mannequin.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const code = Mannequin.codes[0]!;

it('appareil sans préférence : animé directement, sans bouton', () => {
  vi.spyOn(Mannequin, 'reducedMotion').mockReturnValue(false);
  const mount = vi.spyOn(Mannequin, 'mount');
  render(<Figure code={code} label="Démo" />);
  expect(mount).toHaveBeenLastCalledWith(expect.anything(), code, 'play');
  expect(screen.queryByRole('button')).toBeNull();
});

it('appareil qui demande moins d’animations : pose fixe, puis « Animer » à la demande (D181)', () => {
  vi.spyOn(Mannequin, 'reducedMotion').mockReturnValue(true);
  const mount = vi.spyOn(Mannequin, 'mount');
  render(<Figure code={code} label="Démo" />);
  expect(mount).toHaveBeenLastCalledWith(expect.anything(), code, 'still');
  fireEvent.click(screen.getByRole('button', { name: '▶ Animer' }));
  expect(mount).toHaveBeenLastCalledWith(expect.anything(), code, 'play');
  expect(screen.getByRole('button', { name: '⏸ Pause' }).getAttribute('aria-pressed')).toBe('true');
});
