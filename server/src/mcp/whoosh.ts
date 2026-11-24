import { randomUUID } from 'node:crypto';
import { ToolError, type McpCaller } from './client.ts';

/**
 * Connexion MyWhoosh fiable (D172). Le serveur communautaire ne se connecte qu'une fois, à son démarrage,
 * et tait l'échec : chaque outil répond ensuite « Not authenticated » sans dire pourquoi. Ici, sur cette
 * réponse, on lance l'outil `login` avec les identifiants nettoyés (espaces et retours à la ligne collés
 * avec les secrets) et un identifiant d'appareil unique, puis on relance l'appel une fois. Si MyWhoosh
 * refuse la connexion, son message remonte tel quel.
 */
export class WhooshAuthError extends Error {}

const NOT_AUTHENTICATED = /not authenticated/i;

export function withWhooshLogin(
  mcp: McpCaller,
  credentials: { username?: string | undefined; password?: string | undefined },
): McpCaller {
  const username = credentials.username?.trim();
  const password = credentials.password?.trim();
  let deviceId = randomUUID();

  const login = async () => {
    if (!username || !password) throw new WhooshAuthError('Identifiants MyWhoosh absents du serveur');
    try {
      await mcp.call('login', { username, password, deviceId });
    } catch (e) {
      const why = e instanceof Error ? e.message.replace(/^mywhoosh\.login : /, '') : String(e);
      deviceId = randomUUID();
      throw new WhooshAuthError(`Connexion MyWhoosh refusée (${why}) : vérifie l’e-mail et le mot de passe`, {
        cause: e,
      });
    }
  };

  return {
    async call<T>(tool: string, args: Record<string, unknown> = {}, opts: { write?: boolean } = {}): Promise<T> {
      try {
        return await mcp.call<T>(tool, args, opts);
      } catch (e) {
        if (!(e instanceof ToolError) || !NOT_AUTHENTICATED.test(e.message)) throw e;
        await login();
        return mcp.call<T>(tool, args, opts);
      }
    },
    close: () => mcp.close(),
  };
}
