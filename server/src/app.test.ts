import { expect, it } from 'vitest';
import { buildApp } from './app.ts';

it('répond à la sonde de santé', async () => {
  const app = buildApp();
  const res = await app.inject({ method: 'GET', url: '/api/health' });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ status: 'ok' });
  await app.close();
});
