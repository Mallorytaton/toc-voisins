// Mise à l'échelle des écrans : tout tient dans l'écran du téléphone, sans défilement de page.
// La maquette est pensée pour 393 de large. Chaque écran est posé sur une scène qu'on agrandit
// ou réduit : « fit » = tout l'écran tient (on réduit si besoin), « width » = on suit la largeur
// et seules les listes défilent à l'intérieur (Ta gang, classement).
import { h } from './dom';

const BASE_W = 393;
const MAX_W = 480;
const MAX_SCALE = 1.25;

export type FitMode = 'fit' | 'width';

export function fitScreen(screen: HTMLElement, mode: FitMode): { el: HTMLElement; dispose: () => void } {
  const stage = h('div', { class: 'fit__stage' }, screen);
  const root = h('div', { class: 'fit' }, stage);

  const natural = (w: number) => {
    stage.style.transform = 'none';
    stage.style.width = w + 'px';
    stage.style.height = 'auto';
    screen.style.height = 'auto';
    // offsetHeight : hauteur de mise en page, sans les rotations (app redressée en paysage).
    return screen.offsetHeight;
  };

  const apply = () => {
    const W = root.clientWidth, H = root.clientHeight;
    if (!W || !H) return;
    let w = BASE_W, s = Math.min(W / BASE_W, MAX_SCALE);
    if (mode === 'fit') {
      // Deux passes : en élargissant la scène, le texte se réorganise et la hauteur change un peu.
      for (let k = 0; k < 3; k++) {
        s = Math.min(W / w, H / natural(w), MAX_SCALE);
        const next = Math.min(MAX_W, Math.max(BASE_W, Math.floor(W / s)));
        if (next === w) break;
        w = next;
      }
      s = Math.min(W / w, H / natural(w), MAX_SCALE);
    }
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
