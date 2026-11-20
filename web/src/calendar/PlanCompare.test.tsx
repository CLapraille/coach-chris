import type { PlanComparison } from '@coach-chris/domain';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PlanCompare } from './PlanCompare.tsx';

const summary = (source: 'campus' | 'claude', runCount: number, runMinutes: number) => ({
  source,
  sessions: [
    {
      name: `Course ${source}`,
      sport: 'run' as const,
      durationMin: runMinutes,
      intense: source === 'campus',
    },
  ],
  runCount,
  runMinutes,
  longRunMin: runMinutes,
  bikeMinutes: 0,
  strengthCount: 1,
  intenseCount: source === 'campus' ? 1 : 0,
  totalMinutes: runMinutes,
});

let view: PlanComparison;
const calls: { url: string; init?: RequestInit }[] = [];
beforeEach(() => {
  view = {
    week: '2026-11-30',
    active: 'claude',
    campus: summary('campus', 3, 145),
    claude: summary('claude', 2, 85),
    differences: ['Courses : -1 séance(s) avec Claude (3 → 2)'],
  };
  calls.length = 0;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init && { init }) });
    return Response.json(init?.method ? { week: '2026-11-30', active: 'campus' } : view);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('montre les deux plans, le plan actif et les écarts (D162)', async () => {
  render(<PlanCompare week="2026-11-30" onChanged={() => {}} />);
  const card = await screen.findByLabelText('Plans Campus et Claude');
  expect(within(card).getByText('Actif')).toBeTruthy();
  expect(within(card).getByText('Courses : -1 séance(s) avec Claude (3 → 2)')).toBeTruthy();
  expect(within(card).getByText('3 · 145 min')).toBeTruthy();
});

it('« Utiliser ce plan » bascule la semaine', async () => {
  const onChanged = vi.fn();
  render(<PlanCompare week="2026-11-30" onChanged={onChanged} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Utiliser ce plan' }));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  const put = calls.find((c) => c.init?.method === 'PUT')!;
  expect(put.url).toBe('/api/plans/2026-11-30/source');
  expect(JSON.parse(String(put.init!.body))).toEqual({ active: 'campus' });
});

it('un seul plan : rien à comparer', async () => {
  view.claude = null;
  const { container } = render(<PlanCompare week="2026-11-30" onChanged={() => {}} />);
  await waitFor(() => expect(calls.length).toBe(1));
  expect(container.textContent).toBe('');
});
