import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FootCard } from './FootCard.tsx';

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

it('note le pied du matin et conseille vélo ou rameur à 3/10 ou plus (D159)', async () => {
  const onChanged = vi.fn();
  render(<FootCard today="2026-11-25" foot={null} onChanged={onChanged} />);
  fireEvent.click(screen.getByRole('radio', { name: '4' }));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(calls[0]!.url).toBe('/api/checkins/2026-11-25');
  expect(JSON.parse(String(calls[0]!.init!.body))).toEqual({ foot: 4 });
  expect(screen.getByText(/plutôt en vélo ou au rameur/)).toBeTruthy();
  // Un second clic sur la même valeur l'efface.
  fireEvent.click(screen.getByRole('radio', { name: '4' }));
  await waitFor(() => expect(JSON.parse(String(calls[1]!.init!.body))).toEqual({ foot: null }));
});
