import { buildApp } from './app.ts';
import { mcpFromEnv } from './mcp/client.ts';
import { CosmosStore } from './store/store.ts';
import { Sync } from './sync/sync.ts';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';

const store = new CosmosStore(process.env.COSMOS_ENDPOINT!);
const mcp = { garmin: mcpFromEnv('garmin'), campus: mcpFromEnv('campus') };
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
  ...(allowedOid && { allowedOid }),
}).listen({ port, host });
