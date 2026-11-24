import { buildApp } from './app.ts';
import { mcpFromEnv, optionalMcpFromEnv } from './mcp/client.ts';
import { withWhooshLogin } from './mcp/whoosh.ts';
import { CosmosStore } from './store/store.ts';
import { Sync } from './sync/sync.ts';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';

const store = new CosmosStore(process.env.COSMOS_ENDPOINT!);
const mcp = { garmin: mcpFromEnv('garmin'), campus: mcpFromEnv('campus') };
// MyWhoosh (D160) : facultatif, lancé en stdio dans l'image du BFF quand MYWHOOSH_MCP_CMD est défini.
// Reconnexion au besoin, avec les identifiants nettoyés (D172).
const whooshMcp = optionalMcpFromEnv('mywhoosh');
const mywhoosh =
  whooshMcp &&
  withWhooshLogin(whooshMcp, {
    username: process.env.MYWHOOSH_USERNAME,
    password: process.env.MYWHOOSH_PASSWORD,
  });
const sync = new Sync(store, mcp);

const allowedOid = process.env.ALLOWED_OID;
// En production, jamais de BFF ouvert : sans compte autorisé configuré, on refuse de démarrer.
if (process.env.NODE_ENV === 'production' && !allowedOid)
  throw new Error('ALLOWED_OID manquant en production');

await buildApp({
  store,
  sync,
  garmin: mcp.garmin,
  campus: mcp.campus,
  ...(mywhoosh && { mywhoosh }),
  ...(allowedOid && { allowedOid }),
}).listen({ port, host });
