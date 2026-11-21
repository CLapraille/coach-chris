import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ImportCard } from './Import.tsx';

const PLAN = { format: 'coach-chris.plan/v1', block: { id: 'base-s1' } };
const RESULT = (active: 'claude' | 'campus') => ({
  block: 'base-s1',
  blockName: 'Base · bloc 1',
  start: '2026-11-23',
  end: '2026-12-20',
  weeks: [{ weekDate: '2026-11-23', changed: true, active, sessions: 5 }],
});

const calls: { url: string; body: Record<string, unknown> }[] = [];
let refuse = false;
beforeEach(() => {
  calls.length = 0;
  refuse = false;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url, body });
    if (refuse)
      return Response.json(
        { error: 'Fichier refusé', problems: ['weeks.0.start : pas un lundi'] },
        { status: 422 },
      );
    return Response.json(RESULT(body.activate === false ? 'campus' : 'claude'));
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pick = (content: unknown, name = 'plan.json') =>
  fireEvent.change(screen.getByLabelText('Fichier à importer'), {
    target: { files: [new File([JSON.stringify(content)], name, { type: 'application/json' })] },
  });

it('aperçu d’abord, puis import après confirmation', async () => {
  const onImported = vi.fn();
  render(<ImportCard onImported={onImported} />);
  pick(PLAN);
  await screen.findByRole('heading', { name: 'Base · bloc 1' });
  expect(calls).toEqual([{ url: '/api/plans/import', body: { file: PLAN, dryRun: true, activate: true } }]);
  expect(screen.getByText('5 séances')).toBeTruthy();
  expect(onImported).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('checkbox'));
  await waitFor(() => expect(screen.getByText('Campus', { selector: '.src' })).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Importer' }));
  await screen.findByRole('status');
  expect(calls.at(-1)).toEqual({
    url: '/api/plans/import',
    body: { file: PLAN, dryRun: false, activate: false },
  });
  expect(screen.getByRole('status').textContent).toMatch(/gardé à côté de Campus/);
  expect(onImported).toHaveBeenCalledOnce();
});

it('une saison part vers /season/import', async () => {
  render(<ImportCard onImported={() => {}} />);
  pick({ format: 'coach-chris.season/v1', season: '2027', events: [] }, 'saison.json');
  await waitFor(() => expect(calls).toHaveLength(1));
  expect(calls[0]!.url).toBe('/api/season/import');
  expect(calls[0]!.body.dryRun).toBe(true);
});

it('montre les problèmes d’un fichier refusé ou non reconnu', async () => {
  render(<ImportCard onImported={() => {}} />);
  pick({ format: 'autre' });
  expect((await screen.findByRole('alert')).textContent).toMatch(/Fichier non reconnu/);
  expect(calls).toHaveLength(0);

  fireEvent.click(screen.getByRole('button', { name: 'Choisir un autre fichier' }));
  refuse = true;
  pick(PLAN);
  expect((await screen.findByRole('alert')).textContent).toMatch(/pas un lundi/);
});
