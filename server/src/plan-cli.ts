// Import d'un plan Claude ou de la saison (D153, D154), lancé depuis une session Claude Code ou à la main.
//   npm run plan -w server -- import <plan.json> [--shadow]   plan Claude ; --shadow : gardé à côté de Campus
//   npm run plan -w server -- season <saison.json>            saison de courses (écran Saison)
//   npm run plan -w server -- source <lundi> campus|claude     source active d'une semaine
// Les fichiers restent hors du dépôt (public) : ce sont des données personnelles.
import { mondayOf } from '@coach-chris/domain';
import { readFile } from 'node:fs/promises';
import { ImportError, importPlan, importSeason, setWeekSource } from './plan/claude.ts';
import { CosmosStore } from './store/store.ts';

const [command, arg, ...rest] = process.argv.slice(2);
const store = new CosmosStore(process.env.COSMOS_ENDPOINT!);
const now = new Date().toISOString();
const json = async (path: string) => JSON.parse(await readFile(path, 'utf8')) as unknown;

try {
  if (command === 'import' && arg) {
    const r = await importPlan(store, await json(arg), { now, activate: !rest.includes('--shadow') });
    for (const w of r.weeks)
      console.log(`${w.weekDate} · ${w.changed ? 'nouvelle version' : 'inchangée'} · source ${w.active}`);
  } else if (command === 'season' && arg) {
    console.log(`${(await importSeason(store, await json(arg), now)).events} événements importés`);
  } else if (command === 'source' && arg && (rest[0] === 'campus' || rest[0] === 'claude')) {
    await setWeekSource(store, mondayOf(arg), rest[0], now);
    console.log(`Semaine du ${mondayOf(arg)} : source ${rest[0]}`);
  } else {
    console.error(
      'Usage : plan import <plan.json> [--shadow] | plan season <saison.json> | plan source <lundi> campus|claude',
    );
    process.exitCode = 2;
  }
} catch (e) {
  if (!(e instanceof ImportError)) throw e;
  console.error(e.message);
  process.exitCode = 1;
}
