import { InteractionRequiredAuthError, PublicClientApplication } from '@azure/msal-browser';

/**
 * Connexion Entra (D30) : en ligne, le front obtient un jeton pour l'API du BFF (portée access_as_user).
 * En local, sans VITE_ENTRA_CLIENT_ID, aucune authentification (D17) et l'API est servie par le proxy de Vite.
 */
const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID as string | undefined;
const tenantId = import.meta.env.VITE_ENTRA_TENANT_ID as string | undefined;

/** Adresse du BFF ; vide en local (même origine, proxy Vite). */
export const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');

const scopes = clientId ? [`api://${clientId}/access_as_user`] : [];

const msal =
  clientId && tenantId
    ? new PublicClientApplication({
        auth: {
          clientId,
          authority: `https://login.microsoftonline.com/${tenantId}`,
          redirectUri: window.location.origin,
        },
        cache: { cacheLocation: 'localStorage' },
      })
    : null;

/** À appeler avant le premier rendu : termine un retour de connexion ou lance la connexion. */
export async function initAuth(): Promise<void> {
  if (!msal) return;
  await msal.initialize();
  const result = await msal.handleRedirectPromise();
  const account = result?.account ?? msal.getActiveAccount() ?? msal.getAllAccounts()[0];
  if (account) msal.setActiveAccount(account);
  else await msal.loginRedirect({ scopes });
}

/** En-tête d'autorisation pour l'API ; vide en local. Redirige vers la connexion si la session a expiré. */
export async function authHeader(): Promise<Record<string, string>> {
  if (!msal) return {};
  try {
    const { accessToken } = await msal.acquireTokenSilent({ scopes });
    return { authorization: `Bearer ${accessToken}` };
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) await msal.acquireTokenRedirect({ scopes });
    throw e;
  }
}
