// Synchro en ligne de commande : le job quotidien (ARCHITECTURE §5) et le rattrapage manuel en local.
import { mcpFromEnv } from './mcp/client.ts';
import { CosmosStore } from './store/store.ts';
import { Sync } from './sync/sync.ts';

const mcp = { garmin: mcpFromEnv('garmin'), campus: mcpFromEnv('campus') };
const sync = new Sync(new CosmosStore(process.env.COSMOS_ENDPOINT!), mcp);
const sources = process.argv.slice(2).filter((s) => s === 'garmin' || s === 'campus');
try {
  for (const source of sources.length ? sources : (['garmin', 'campus'] as const)) {
    console.log(await sync.run(source, 'job'));
  }
} finally {
  await Promise.all([mcp.garmin.close(), mcp.campus.close()]);
}
