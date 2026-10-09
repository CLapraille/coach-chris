import { useState } from 'react';

/** Thème de l'interface : `auto` suit le système (sombre par défaut, D57). Choix propre à l'appareil. */
export type Theme = 'auto' | 'dark' | 'light';

const KEY = 'cc.theme';

export function storedTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'dark' || t === 'light' ? t : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(t: Theme): void {
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  // Barre d'état du téléphone : couleur du fond du thème choisi (index.html suit le système en Auto).
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const system = m.dataset.media ?? m.media;
    m.dataset.media = system;
    m.media = t === 'auto' ? system : (t === 'dark') === system.includes('dark') ? 'all' : 'not all';
  });
}

const LABEL: Record<Theme, string> = { auto: 'Auto', dark: 'Sombre', light: 'Clair' };

/** Choix du thème : Auto (système), Sombre ou Clair, retenu sur cet appareil. */
export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>(storedTheme);
  const choose = (t: Theme) => {
    setTheme(t);
    applyTheme(t);
    try {
      if (t === 'auto') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, t);
    } catch {
      // Stockage indisponible (navigation privée) : le choix vaut pour la session.
    }
  };
  return (
    <div className="theme" role="radiogroup" aria-label="Thème">
      {(['auto', 'dark', 'light'] as const).map((t) => (
        <button key={t} type="button" role="radio" aria-checked={theme === t} onClick={() => choose(t)}>
          {LABEL[t]}
        </button>
      ))}
    </div>
  );
}
