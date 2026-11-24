import { describe, expect, it } from 'vitest';
import { ToolError, type McpCaller } from './client.ts';
import { WhooshAuthError, withWhooshLogin } from './whoosh.ts';

/** Faux serveur MyWhoosh : « Not authenticated » tant que `login` n'a pas réussi. */
function fakeServer(acceptLogin: (args: Record<string, unknown>) => boolean) {
  const calls: { tool: string; args: Record<string, unknown> }[] = [];
  let authenticated = false;
  const mcp: McpCaller = {
    call: async <T>(tool: string, args: Record<string, unknown> = {}) => {
      calls.push({ tool, args });
      if (tool === 'login') {
        if (!acceptLogin(args)) throw new ToolError('mywhoosh.login : MCP error -32602: Invalid credentials');
        authenticated = true;
        return { success: true } as T;
      }
      if (!authenticated) throw new ToolError(`mywhoosh.${tool} : MCP error -32600: Not authenticated`);
      return { ok: tool } as T;
    },
    close: async () => {},
  };
  return { mcp, calls };
}

describe('withWhooshLogin (D172)', () => {
  it('se reconnecte avec les identifiants nettoyés puis relance l’appel', async () => {
    const s = fakeServer((a) => a.username === 'moi@example.com' && a.password === 'secret');
    const mw = withWhooshLogin(s.mcp, { username: ' moi@example.com\n', password: 'secret\n' });
    expect(await mw.call('uploadCustomWorkout', { workouts: [] }, { write: true })).toEqual({
      ok: 'uploadCustomWorkout',
    });
    expect(s.calls.map((c) => c.tool)).toEqual(['uploadCustomWorkout', 'login', 'uploadCustomWorkout']);
    expect(s.calls[1]!.args).toMatchObject({ username: 'moi@example.com', password: 'secret' });
    expect(typeof s.calls[1]!.args.deviceId).toBe('string');
    // Déjà connecté : un seul appel.
    await mw.call('listActivities', {});
    expect(s.calls.at(-1)!.tool).toBe('listActivities');
    expect(s.calls).toHaveLength(4);
  });

  it('remonte le refus de MyWhoosh avec son message', async () => {
    const s = fakeServer(() => false);
    const mw = withWhooshLogin(s.mcp, { username: 'moi@example.com', password: 'faux' });
    await expect(mw.call('listActivities')).rejects.toThrow(WhooshAuthError);
    await expect(mw.call('listActivities')).rejects.toThrow(/Invalid credentials.*mot de passe/);
  });

  it('identifiants absents : message clair, sans appel de login', async () => {
    const s = fakeServer(() => true);
    const mw = withWhooshLogin(s.mcp, {});
    await expect(mw.call('listActivities')).rejects.toThrow('Identifiants MyWhoosh absents du serveur');
    expect(s.calls.map((c) => c.tool)).toEqual(['listActivities']);
  });

  it('laisse passer les autres erreurs', async () => {
    const mcp: McpCaller = {
      call: async () => {
        throw new ToolError('mywhoosh.uploadCustomWorkout : API request failed: 500');
      },
      close: async () => {},
    };
    await expect(withWhooshLogin(mcp, { username: 'a', password: 'b' }).call('x')).rejects.toThrow(/500/);
  });
});
