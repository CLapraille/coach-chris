import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { API_BASE, initAuth } from './auth.ts';
import './index.css';
import { applyTheme, storedTheme } from './theme.tsx';

applyTheme(storedTheme());

// Réveil du serveur dès l'ouverture, en parallèle de la connexion : sur Azure il s'arrête quand
// personne ne s'en sert, et redémarrer prend plusieurs secondes. La sonde ne demande pas de jeton.
if (API_BASE) void fetch(`${API_BASE}/api/health`).catch(() => undefined);

// La connexion se termine avant le premier rendu (retour de redirection Entra).
await initAuth();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
