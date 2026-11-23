import { describe, expect, it } from 'vitest';
import { demoFor } from './demos.ts';

describe('demoFor (D167)', () => {
  it('relie chaque exercice du plan à sa figure', () => {
    const fig = (n: string) => demoFor(n)?.figure;
    expect(fig('Fente statique haltères')).toBe('X1');
    expect(fig('Fentes marchées lentes')).toBe('X1');
    expect(fig('Fente arrière')).toBe('X1');
    expect(fig('Squat poids du corps')).toBe('X2');
    expect(fig('Soulevé de terre roumain unipodal')).toBe('X3');
    expect(fig('Montée mollet unipodale genou fléchi')).toBe('X4');
    expect(fig('Montées mollet genou fléchi')).toBe('X4');
    expect(fig('Montée mollet unipodale jambe tendue')).toBe('C6');
    expect(fig('Montées sur pointes')).toBe('X5');
    expect(fig('Relevés tibial dos au mur')).toBe('X6');
    expect(fig('Pont fessier unipodal')).toBe('X7');
    expect(fig('Pont fessier')).toBe('H9');
    expect(fig('Planche latérale')).toBe('X8');
    expect(fig('Dead bug')).toBe('X9');
    expect(fig('Bird dog')).toBe('X10');
    expect(fig('Glissement nerveux sciatique assis')).toBe('X11');
    expect(fig('Glissement nerveux sciatique allongé')).toBe('X12');
    expect(fig('Marche latérale élastique')).toBe('X13');
    expect(fig('Montées de genoux sur place')).toBe('X14');
    expect(fig('Respiration ventrale')).toBe('X15');
    expect(fig('Cheville genou au mur')).toBe('C1');
    expect(fig('Étirement soléaire genou fléchi')).toBe('C3');
    expect(fig('Étirement mollet et soléaire au mur')).toBe('C2');
    expect(fig('Fléchisseur de hanche en fente')).toBe('H2');
    expect(fig('Transitions 90/90 de hanche')).toBe('H1');
    expect(fig('Chat-vache')).toBe('T1');
  });

  it('sans figure : lien vidéo quand même', () => {
    const d = demoFor('Yoga des orteils');
    expect(d?.figure).toBeUndefined();
    expect(d?.videoUrl).toBe('https://www.youtube.com/results?search_query=Yoga%20des%20orteils%20exercice');
    expect(demoFor('Chat-vache debout')?.figure).toBeUndefined();
  });

  it('les étapes cardio ne sont pas des exercices', () => {
    for (const n of [
      'Marche rapide',
      'Marche',
      'Course très lente',
      'Pédalage souple',
      'Rame facile',
      'Palier',
      'Accélérations',
      'Montée progressive',
    ]) {
      expect(demoFor(n)).toBeNull();
    }
    // « Marche latérale élastique » reste un exercice.
    expect(demoFor('Marche latérale élastique')).not.toBeNull();
  });

  it('un code de la bibliothèque passe avant le nom', () => {
    expect(demoFor('Hanche 90/90, transitions', 'H1')?.figure).toBe('H1');
  });
});
