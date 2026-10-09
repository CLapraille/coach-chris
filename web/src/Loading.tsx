import { useEffect, useState } from 'react';

/**
 * Attente d'une réponse de l'API. Sur Azure, le serveur s'arrête après quelques minutes sans visite :
 * au-delà de 3 s, on dit qu'il redémarre plutôt que de laisser croire à une panne.
 */
export function Loading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(t);
  }, []);
  return (
    <p className="muted" role="status">
      Chargement…
      {slow && ' Le serveur redémarre après une pause, cela peut prendre une trentaine de secondes.'}
    </p>
  );
}
