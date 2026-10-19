import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { expect, it } from 'vitest';
import { McpSource } from './client.ts';

/** MCP en mémoire avec un outil de lecture ; compte les connexions ouvertes et fermées. */
function fakeServer() {
  const stats = { opened: 0, closed: 0 };
  const transport = () => {
    const [client, server] = InMemoryTransport.createLinkedPair();
    const mcp = new McpServer({ name: 'faux', version: '0' });
    mcp.registerTool('get_weigh_ins', {}, async () => ({ content: [{ type: 'text', text: '{"ok":true}' }] }));
    server.onclose = () => stats.closed++;
    stats.opened++;
    void mcp.connect(server);
    return client;
  };
  return { stats, transport };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

it('ferme la connexion après inactivité, la rouvre au prochain appel (D151)', async () => {
  const { stats, transport } = fakeServer();
  const src = new McpSource('garmin', transport, 30);
  expect(await src.call('get_weigh_ins')).toEqual({ ok: true });
  await src.call('get_weigh_ins');
  expect(stats).toEqual({ opened: 1, closed: 0 }); // appels rapprochés : une seule connexion
  await wait(80);
  expect(stats.closed).toBe(1); // le MCP peut redescendre à zéro
  await src.call('get_weigh_ins');
  expect(stats.opened).toBe(2);
  await src.close();
});
