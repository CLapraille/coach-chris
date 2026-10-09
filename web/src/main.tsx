import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { initAuth } from './auth.ts';
import './index.css';
import { applyTheme, storedTheme } from './theme.tsx';

applyTheme(storedTheme());

// La connexion se termine avant le premier rendu (retour de redirection Entra).
await initAuth();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
