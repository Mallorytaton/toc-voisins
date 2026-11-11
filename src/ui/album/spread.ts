// La double page (pliants, tablettes), hors partie : deux pages de part et d'autre de la reliure, comme un album de BD
// ouvert (maquette « TOC sur pliants »). La page de gauche liste, la page de droite répond ; quatre marque-pages au bas
// de la page de gauche remplacent la barre d'onglets. Les pages se règlent sur la forme de l'écran et la place de la
// pliure (src/ui/fold.ts), jamais sur un modèle de téléphone.
import { h } from '../dom';
import { noteOpened, panes, pose, shapeOf, viewSize, watchFold } from '../fold';
import { type Tab, icon } from '../kit/kit';
import { ROUTES, go } from '../nav';

const SIGNETS: { id: Tab; label: string; path: string; d: string }[] = [
  { id: 'home', label: 'La une', path: ROUTES.home, d: 'M4 11.500 L12 4.500 l8 7 M6.500 10 v9.500 h11 V10 M10 19.500 v-5 h4 v5' },
  { id: 'friends', label: 'Ta bande', path: ROUTES.friends, d: 'M12.600 8 a3.600 3.600 0 1 1 -7.200 0 a3.600 3.600 0 1 1 7.200 0 M2.500 20 c0 -4 3 -6.500 6.500 -6.500 s6.500 2.500 6.500 6.500 M20.300 9.500 a2.800 2.800 0 1 1 -5.600 0 a2.800 2.800 0 1 1 5.600 0 M17 13.800 c2.800 0 4.800 2 4.800 5.700' },
  { id: 'albums', label: 'Albums', path: ROUTES.albums, d: 'M4 5.500 L12 4 v16 l-8 -1.500 Z M12 4 l8 1.500 v13 L12 20' },
  { id: 'shop', label: 'Kiosque', path: ROUTES.shop, d: 'M4.500 9.500 h15 v10 h-15 Z M4 9.500 l1.500 -5 h13 l1.500 5 M9.500 19.500 v-5 h5 v5' },
];

/** Les quatre marque-pages : la rubrique en cours est blanche et dépasse des autres. `dots` : pastille de nouveautés. */
export function signets(current: Tab | null, dots: Partial<Record<Tab, number>> = {}): HTMLElement {
  return h('nav', { class: 'signets', 'aria-label': 'Navigation' },
    SIGNETS.map((t) => h('button', {
      class: 'signet signet--' + t.id, type: 'button', 'aria-current': t.id === current ? 'page' : undefined, onclick: () => go(t.path),
    }, icon(t.d, 22, 2.6), t.label, dots[t.id] ? h('span', { class: 'signet__dot' }, String(dots[t.id])) : null)));
}

/** Pose un écran du téléphone dans une page de la double page : son contenu, sans barre d'onglets ni fond à lui (album.css). */
export function inPage(screen: HTMLElement): HTMLElement {
  screen.classList.add('livre__ecran');
  return screen;
}

export interface Spread {
  el: HTMLElement;
  /** La page de gauche (elle liste) et la page de droite (elle répond) : on y pose le contenu. */
  left: HTMLElement;
  right: HTMLElement;
  dispose: () => void;
}

/** La largeur de référence d'une double page : en dessous et au-dessus, tout se met à l'échelle (dans des limites lisibles). */
const REF_W = 752, REF_H = 760;

/**
 * Une double page vide. tone : la couleur de la rubrique (jaune, bleu, turq, rose, nuit, rouge) ;
 * tab : la rubrique allumée dans les marque-pages (null : pas de marque-pages, pour une page hors rubriques).
 */
export function spread(o: { tone: string; cls?: string }): Spread {
  const left = h('div', { class: 'livre__page livre__page--g' });
  const right = h('div', { class: 'livre__page livre__page--d' });
  const el = h('div', { class: 'livre' + (o.cls ? ' ' + o.cls : ''), 'data-tone': o.tone }, h('i', { class: 'livre__reliure', 'aria-hidden': 'true' }), left, right);
  const fit = () => {
    // (clavier rentré : les pages ne changent pas d'échelle pendant qu'on écrit)
    const p = pose(), { w: W, h: H } = viewSize();
    // L'échelle : les pages gardent des cotes de lecture, du pliant étroit à la tablette.
    const k = Math.min(1.5, Math.max(0.9, Math.min(W / REF_W, H / REF_H)));
    el.style.zoom = k.toFixed(3);
    el.dataset.tenue = p;
    el.dataset.forme = shapeOf(W, H);
    // En livre : chaque page tient de son côté de la pliure.
    const two = p === 'book' ? panes(p) : null;
    el.style.setProperty('--pa', two ? `${Math.round((two[0].x + two[0].w) / k)}px` : '50%');
    el.style.setProperty('--pb', two ? `${Math.round(two[1].x / k)}px` : '50%');
    if (p !== 'phone' && p !== 'flip') noteOpened();
  };
  fit();
  const stop = watchFold(fit);
  return { el, left, right, dispose: stop };
}
