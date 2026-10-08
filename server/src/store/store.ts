import { CosmosClient, type Container } from '@azure/cosmos';
import { AzureCliCredential, ManagedIdentityCredential, type TokenCredential } from '@azure/identity';

/** Conteneurs de la base `coachchris` (ARCHITECTURE §3) et leur clé de partition. */
export const CONTAINERS = {
  cache: 'pk',
  plan: 'weekDate',
  library: 'kind',
  user: 'kind',
  ops: 'kind',
} as const;
export type ContainerName = keyof typeof CONTAINERS;

/** Champs communs à tout document (ARCHITECTURE §3). */
export interface Doc {
  id: string;
  source: 'garmin' | 'campus' | 'app';
  fetchedAt: string;
  schemaVersion: number;
  [key: string]: unknown;
}

export interface Store {
  get<T extends Doc>(container: ContainerName, id: string, pk: string): Promise<T | undefined>;
  /** Tous les documents d'une partition. */
  list<T extends Doc>(container: ContainerName, pk: string): Promise<T[]>;
  upsert(container: ContainerName, doc: Doc): Promise<void>;
  /** Sans effet si le document n'existe pas. */
  delete(container: ContainerName, id: string, pk: string): Promise<void>;
}

export class CosmosStore implements Store {
  private readonly containers: Record<ContainerName, Container>;

  constructor(endpoint: string) {
    // Aucune clé (disableLocalAuth) : identité managée sur Azure, az login en local.
    const db = new CosmosClient({ endpoint, aadCredentials: credential() }).database('coachchris');
    this.containers = Object.fromEntries(
      Object.keys(CONTAINERS).map((name) => [name, db.container(name)]),
    ) as Record<ContainerName, Container>;
  }

  async get<T extends Doc>(container: ContainerName, id: string, pk: string): Promise<T | undefined> {
    const { resource } = await this.containers[container].item(id, pk).read<T>();
    return resource && strip(resource);
  }

  async list<T extends Doc>(container: ContainerName, pk: string): Promise<T[]> {
    const { resources } = await this.containers[container].items
      .query<T>({ query: 'SELECT * FROM c' }, { partitionKey: pk })
      .fetchAll();
    return resources.map(strip);
  }

  async upsert(container: ContainerName, doc: Doc): Promise<void> {
    await this.containers[container].items.upsert(doc);
  }

  async delete(container: ContainerName, id: string, pk: string): Promise<void> {
    try {
      await this.containers[container].item(id, pk).delete();
    } catch (e) {
      if ((e as { code?: number }).code !== 404) throw e;
    }
  }
}

/**
 * Choix explicite plutôt que DefaultAzureCredential : la chaîne par défaut sonde d'abord d'autres méthodes
 * (dont l'identité managée, absente du poste), ce qui coûtait une vingtaine de secondes au démarrage.
 */
function credential(env = process.env): TokenCredential {
  if (env.IDENTITY_ENDPOINT) {
    return env.AZURE_CLIENT_ID
      ? new ManagedIdentityCredential({ clientId: env.AZURE_CLIENT_ID })
      : new ManagedIdentityCredential();
  }
  return new AzureCliCredential();
}

/** Retire les métadonnées système de Cosmos (_rid, _etag…). */
function strip<T extends Doc>(d: T): T {
  return Object.fromEntries(Object.entries(d).filter(([k]) => !k.startsWith('_'))) as T;
}

/** Pour les tests : même contrat, en mémoire. */
export class MemoryStore implements Store {
  private readonly data = new Map<string, Doc>();

  private key(container: ContainerName, pk: string, id: string): string {
    return `${container}|${pk}|${id}`;
  }

  async get<T extends Doc>(container: ContainerName, id: string, pk: string): Promise<T | undefined> {
    return structuredClone(this.data.get(this.key(container, pk, id))) as T | undefined;
  }

  async list<T extends Doc>(container: ContainerName, pk: string): Promise<T[]> {
    const prefix = `${container}|${pk}|`;
    return [...this.data].filter(([k]) => k.startsWith(prefix)).map(([, d]) => structuredClone(d) as T);
  }

  async upsert(container: ContainerName, doc: Doc): Promise<void> {
    const pk = doc[CONTAINERS[container]];
    if (typeof pk !== 'string') throw new Error(`clé de partition /${CONTAINERS[container]} manquante`);
    this.data.set(this.key(container, pk, doc.id), structuredClone(doc));
  }

  async delete(container: ContainerName, id: string, pk: string): Promise<void> {
    this.data.delete(this.key(container, pk, id));
  }
}
