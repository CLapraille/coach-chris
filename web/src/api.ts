import { useCallback, useEffect, useState } from 'react';

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? `Erreur ${res.status}`);
  }
  return (await res.json()) as T;
}

export type Loadable<T> =
  { state: 'loading' } | { state: 'error'; error: Error } | { state: 'ready'; data: T; reload: () => void };

/** Charge une ressource de l'API ; `reload` la relit sans repasser par l'état de chargement. */
export function useApi<T>(path: string): Loadable<T> {
  const [result, setResult] = useState<{ data: T } | { error: Error } | null>(null);
  const load = useCallback(() => {
    api<T>(path).then(
      (data) => setResult({ data }),
      (error: unknown) => setResult({ error: error instanceof Error ? error : new Error(String(error)) }),
    );
  }, [path]);
  useEffect(load, [load]);
  if (!result) return { state: 'loading' };
  if ('error' in result) return { state: 'error', error: result.error };
  return { state: 'ready', data: result.data, reload: load };
}
