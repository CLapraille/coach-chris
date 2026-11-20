import type { ReviewView } from '@coach-chris/domain';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewCard } from './ReviewCard.tsx';

const VIEW: ReviewView = {
  week: '2026-11-23',
  nextWeek: '2026-11-30',
  accepted: null,
  proposal: {
    week: '2026-11-23',
    verdict: 'hold',
    reasons: [
      {
        rule: 'pain',
        level: 'warn',
        text: 'Douleur ponctuelle à 4/10 : on tient le volume une semaine de plus.',
      },
    ],
    pain: { footMax: 4, footDaysOver: 1, footDays: 6, shinMax: 2, shinOver: 0 },
    completion: { fixedDone: 2, fixedTotal: 2, done: 4, total: 4 },
    volume: { actual: 77, chronic: 68, plannedNext: 85, proposedNext: 75, acwrNext: 1.1 },
    adjustments: { 's2-dim': { from: 50, to: 40 } },
    flex: 'velo',
  },
};

let view: ReviewView;
const calls: { url: string; init?: RequestInit }[] = [];
beforeEach(() => {
  view = structuredClone(VIEW);
  calls.length = 0;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init && { init }) });
    return Response.json(init?.method ? {} : view);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('montre le verdict, les raisons et les durées proposées (D161)', async () => {
  render(<ReviewCard today="2026-11-29" onChanged={() => {}} />);
  const card = await screen.findByLabelText('Revue de la semaine');
  expect(within(card).getByText('Tenir')).toBeTruthy();
  expect(within(card).getByText(/Douleur ponctuelle à 4\/10/)).toBeTruthy();
  expect((within(card).getByRole('spinbutton') as HTMLInputElement).value).toBe('40');
});

it('accepte avec les retouches de l’utilisateur', async () => {
  const onChanged = vi.fn();
  render(<ReviewCard today="2026-11-29" onChanged={onChanged} />);
  const card = await screen.findByLabelText('Revue de la semaine');
  fireEvent.change(within(card).getByRole('spinbutton'), { target: { value: '45' } });
  fireEvent.click(within(card).getByRole('radio', { name: 'Course' }));
  fireEvent.click(within(card).getByRole('button', { name: /Accepter pour la semaine du 30\/11/ }));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  const post = calls.find((c) => c.init?.method === 'POST')!;
  expect(post.url).toBe('/api/review/2026-11-23/accept');
  expect(JSON.parse(String(post.init!.body))).toEqual({ durations: { 's2-dim': 45 }, flex: 'course' });
});

it('revue acceptée : cachée en milieu de semaine', async () => {
  view.accepted = {
    week: '2026-11-23',
    verdict: 'hold',
    durations: {},
    flex: 'velo',
    acceptedAt: '2026-11-29T20:00:00Z',
  };
  const { container } = render(<ReviewCard today="2026-12-02" onChanged={() => {}} />);
  await waitFor(() => expect(calls.length).toBe(1));
  expect(container.textContent).toBe('');
});
