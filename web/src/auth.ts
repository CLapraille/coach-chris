import { BrowserAuthError, InteractionRequiredAuthError, PublicClientApplication } from '@azure/msal-browser';

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
        // Renouvellement caché (iframe) : souvent bloqué par le navigateur, inutile d'attendre 10 s pour le savoir.
        system: { iframeBridgeTimeout: 6000 },
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
    // 24 h après la connexion, Entra exige de se reconnecter (jeton de rafraîchissement des SPA). MSAL tente
    // d'abord un renouvellement caché dans une iframe ; quand le navigateur la bloque (Chrome, app installée),
    // l'échec arrive en « timed_out » et non en « interaction required » : dans les deux cas, page de connexion.
    if (needsSignIn(e)) await msal.acquireTokenRedirect({ scopes });
    throw e;
  }
}

/** Erreur de connexion (session expirée ou renouvellement bloqué), et non panne du serveur. */
export function needsSignIn(e: unknown): boolean {
  if (e instanceof BrowserAuthError) return e.errorCode !== 'no_network_connectivity';
  return e instanceof InteractionRequiredAuthError;
}

/** Relance la connexion Microsoft à la demande (bouton de l'écran d'erreur). */
export async function signIn(): Promise<void> {
  if (msal) await msal.acquireTokenRedirect({ scopes });
}
