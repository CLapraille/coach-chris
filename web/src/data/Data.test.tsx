import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { STATUS } from '../today/fixture.ts';
import { Data } from './Data.tsx';

const calls: { url: string; init?: RequestInit }[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
  calls.length = 0;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init && { init }) });
    return Response.json([]);
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('jeton Campus expiré : état, commande de reconnexion à copier', () => {
  render(<Data status={STATUS} onChanged={() => {}} />);
  const campus = screen.getByRole('heading', { name: 'Campus Coach' }).closest('article')!;
  expect(within(campus).getByText('Jeton expiré')).toBeTruthy();
  expect(within(campus).getByText(String.raw`.\reauth.ps1 -Source campus`)).toBeTruthy();
  const garmin = screen.getByRole('heading', { name: 'Garmin Connect' }).closest('article')!;
  expect(within(garmin).getByText('Connecté')).toBeTruthy();
  expect(within(garmin).queryByText(/reauth/)).toBeNull();
  expect(within(garmin).getByText(/fenix 7X Pro Sapphire Solar/)).toBeTruthy();
});

it('fraîcheur : manques nommés, pesée ancienne signalée', () => {
  render(<Data status={STATUS} onChanged={() => {}} />);
  expect(screen.getAllByText(/nuit du 05\/10 absente/)).toHaveLength(2);
  expect(screen.getByText('pas de pesée depuis 9 jours')).toBeTruthy();
  expect(screen.getByText('Campus : jeton refusé')).toBeTruthy();
});

it('« Actualiser maintenant » synchronise la source puis relit l’état', async () => {
  const onChanged = vi.fn();
  render(<Data status={STATUS} onChanged={onChanged} />);
  const garmin = screen.getByRole('heading', { name: 'Garmin Connect' }).closest('article')!;
  fireEvent.click(within(garmin).getByRole('button', { name: 'Actualiser maintenant' }));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(calls[0]).toMatchObject({ url: '/api/sync?source=garmin', init: { method: 'POST' } });
});
