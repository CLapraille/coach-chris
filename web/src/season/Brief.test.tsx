import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BriefCard } from './Brief.tsx';

const TEXT = '# Bilan CoachChris pour Claude, 26/11/2026\n\n## Semaine du 23/11\n';
const written: string[] = [];

beforeEach(() => {
  written.length = 0;
  vi.stubGlobal('fetch', async () => Response.json({ text: TEXT, generatedAt: '2026-11-26T18:00:00Z' }));
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (t: string) => void written.push(t) },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('prépare le bilan puis le copie (D171)', async () => {
  render(<BriefCard />);
  fireEvent.click(screen.getByRole('button', { name: 'Préparer le bilan' }));
  const area = (await screen.findByLabelText('Texte du bilan')) as HTMLTextAreaElement;
  expect(area.value).toBe(TEXT);
  fireEvent.click(screen.getByRole('button', { name: 'Copier' }));
  await waitFor(() => expect(written).toEqual([TEXT]));
  expect(screen.getByRole('button', { name: 'Copié' })).toBeTruthy();
});
