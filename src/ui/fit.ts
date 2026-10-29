// Mise à l'échelle des écrans : tout tient dans l'écran du téléphone, sans défilement de page.
// La maquette est pensée pour 393 de large. Chaque écran est posé sur une scène qu'on agrandit
// ou réduit, et qui va jusqu'aux bords (comme la maquette, les marges d'encoche et de barre du bas
// sont dans l'écran lui-même) :
//   « fit »  : l'écran tient en entier (on réduit si besoin) — splash, présentation, perso, salle ;
//   « tabs » : Jouer, Amis et Classement partagent la même échelle (mêmes tailles d'un onglet
//              à l'autre) ; leurs listes défilent à l'intérieur.
import { h } from './dom';

const BASE_W = 393;
const MAX_W = 480;
const MAX_SCALE = 1.25;
/** Hauteur de référence des onglets : celle de l'accueil, le plus haut des trois (marges sûres minimales). */
const TABS_H = 860;
/** Marges sûres minimales comptées dans TABS_H (14 en haut, 12 en bas). */
const MIN_SAFE = 26;

/** Encoche et barre du bas du téléphone, en pixels réels. */
function insets(): { t: number; b: number } {
  const rot = document.documentElement.dataset.rot;
  const side = rot === '90' ? 'left' : rot === '-90' ? 'right' : 'top';
  const probe = h('div', { style: { position: 'fixed', visibility: 'hidden', paddingTop: `env(safe-area-inset-${side})`, paddingBottom: rot ? '0' : 'env(safe-area-inset-bottom)' } });
  document.body.append(probe);
  const cs = getComputedStyle(probe);
  const out = { t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 };
  probe.remove();
  return out;
}

export type FitMode = 'fit' | 'tabs';

/** Marges sûres exprimées dans les unités de la scène (réduite ou agrandie par s). */
function safeVars(stage: HTMLElement, s: number) {
  const rot = document.documentElement.dataset.rot;
  // L'app redressée en paysage : l'encoche est sur le côté gauche (90) ou droit (-90) de l'écran.
  const top = rot === '90' ? 'env(safe-area-inset-left)' : rot === '-90' ? 'env(safe-area-inset-right)' : 'env(safe-area-inset-top)';
  const bottom = rot ? '0px' : 'env(safe-area-inset-bottom)';
  stage.style.setProperty('--safe-top', `max(14px, calc(${top} / ${s}))`);
  stage.style.setProperty('--safe-bottom', `max(12px, calc(${bottom} / ${s}))`);
}

export function fitScreen(screen: HTMLElement, mode: FitMode): { el: HTMLElement; dispose: () => void } {
  const stage = h('div', { class: 'fit__stage' }, screen);
  const root = h('div', { class: 'fit' }, stage);

  // offsetHeight : hauteur de mise en page, sans les rotations (app redressée en paysage).
  const natural = (w: number, s: number) => {
    safeVars(stage, s);
    stage.style.transform = 'none';
    stage.style.width = w + 'px';
    stage.style.height = 'auto';
    screen.style.height = 'auto';
    return screen.offsetHeight;
  };
  const widthFor = (W: number, s: number) => Math.min(MAX_W, Math.max(BASE_W, Math.floor(W / s)));

  const apply = () => {
    const W = root.clientWidth, H = root.clientHeight;
    if (!W || !H) return;
    let s: number, w: number;
    if (mode === 'tabs') {
      // Même échelle pour les trois onglets : l'accueil (le plus haut) tient pile, encoche comprise.
      const { t, b } = insets();
      s = Math.min(W / BASE_W, (H - Math.max(t, 14) - Math.max(b, 12)) / (TABS_H - MIN_SAFE), MAX_SCALE);
      w = widthFor(W, s);
      // Sécurité (écrans sans liste qui défile) : s'il est plus haut que prévu, on réduit juste ce qu'il faut.
      if (!screen.querySelector('.scroll-y')) {
        const n = natural(w, s);
        if (n > H / s) s = H / n;
      }
    } else {
      // Deux passes : en élargissant la scène, le texte se réorganise et la hauteur change un peu.
      s = Math.min(W / BASE_W, MAX_SCALE);
      w = BASE_W;
      for (let k = 0; k < 3; k++) {
        s = Math.min(W / w, H / natural(w, s), MAX_SCALE);
        const next = widthFor(W, s);
        if (next === w) break;
        w = next;
      }
      s = Math.min(W / w, H / natural(w, s), MAX_SCALE);
    }
    safeVars(stage, s);
    stage.style.width = w + 'px';
    stage.style.height = H / s + 'px';
    screen.style.height = '100%';
    stage.style.transform = `translate(${Math.max(0, (W - w * s) / 2)}px,0) scale(${s})`;
  };

  const ro = new ResizeObserver(() => apply());
  ro.observe(root);
  // Les polices changent la hauteur du texte : on recalcule quand elles sont prêtes.
  document.fonts?.ready.then(() => apply()).catch(() => undefined);
  requestAnimationFrame(apply);
  return { el: root, dispose: () => ro.disconnect() };
}
