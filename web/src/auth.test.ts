import { BrowserAuthError, InteractionRequiredAuthError } from '@azure/msal-browser';
import { expect, it } from 'vitest';
import { ApiError } from './api.ts';
import { needsSignIn } from './auth.ts';

it('session expirée ou renouvellement caché bloqué : reconnexion ; panne réseau ou serveur : non', () => {
  // Cas du 11/10 : jeton de rafraîchissement expiré (24 h), iframe bloquée par Chrome → « timed_out ».
  expect(needsSignIn(new BrowserAuthError('timed_out', ''))).toBe(true);
  expect(needsSignIn(new InteractionRequiredAuthError('interaction_required', ''))).toBe(true);
  expect(needsSignIn(new BrowserAuthError('no_network_connectivity', ''))).toBe(false);
  expect(needsSignIn(new ApiError(502, 'Erreur 502'))).toBe(false);
  expect(needsSignIn(new TypeError('Failed to fetch'))).toBe(false);
});
