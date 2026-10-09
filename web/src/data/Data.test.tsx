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

it('jeton Campus expiré : reconnexion depuis le navigateur, jetons collés envoyés au serveur', async () => {
  const onChanged = vi.fn();
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init && { init }) });
    return Response.json({ ok: true, message: 'Campus reconnecté : synchro faite.' });
  });
  render(<Data status={STATUS} onChanged={onChanged} />);
  const campus = screen.getByRole('heading', { name: 'Campus Coach' }).closest('article')!;
  expect(within(campus).getByText('Jeton expiré')).toBeTruthy();
  expect(within(campus).getByText(/location\.replace\('about:blank'\)/)).toBeTruthy();
  // Téléphone : pas de console, un favori à copier ; le champ de collage reste le même.
  fireEvent.click(within(campus).getByRole('button', { name: 'Téléphone' }));
  expect(within(campus).getByRole('button', { name: 'Copier le code du favori' })).toBeTruthy();
  fireEvent.change(within(campus).getByLabelText('Jetons Campus copiés'), {
    target: { value: '{"atk":"a","rtk":"r"}' },
  });
  fireEvent.click(within(campus).getByRole('button', { name: 'Reconnecter' }));
  expect(await within(campus).findByText('Campus reconnecté : synchro faite.')).toBeTruthy();
  expect(calls[0]!.url).toMatch(/\/api\/sources\/campus\/session$/);
  expect(JSON.parse(String(calls[0]!.init!.body))).toEqual({ pasted: '{"atk":"a","rtk":"r"}' });
  expect(onChanged).toHaveBeenCalled();
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
