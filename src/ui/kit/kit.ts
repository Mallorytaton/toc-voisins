// Composants de base de l'app (direction BD), en DOM natif.
import { h } from '../dom';
import { ROUTES, go } from '../nav';
import { COL, cardLook, type CardOptions, type CharId, type ColorName } from './data';
import { type Humeur, perso } from './perso';

type Css = Record<string, string | number>;

/** Personnage d'un joueur : une bille avec un visage et son accessoire (src/ui/kit/perso.ts). */
export function avatar(char: CharId, color: ColorName, size = 64, humeur: Humeur = 'content', o: { flip?: boolean; ombre?: boolean } = {}): HTMLElement {
  const el = perso(char, color, size, humeur, o);
  el.classList.add('avatar');
  return el;
}

/**
 * Personnage dans une liste (accueil, salle, classement). Le trait d'encre du perso suffit à le détacher :
 * les anciens réglages d'anneau (couleur, marge, ombre) sont acceptés mais ne dessinent plus rien.
 */
export function avatarRing(
  char: CharId, color: ColorName, size: number, _ring?: string, _pad = 4, _ringW = 3, _drop: string | null = null,
): HTMLElement {
  return h('div', { class: 'avatar-ring' }, avatar(char, color, size));
}

export interface BilleOpts {
  size?: number;
  sel?: boolean;
  target?: boolean;
  style?: Css;
}

/** Bille (pion) : reflet franc, ombre en croissant, trait d'encre. */
export function bille(color: ColorName, o: BilleOpts = {}): HTMLElement {
  const t = COL[color];
  return h('div', {
    class: 'bille' + (o.sel ? ' bille--sel' : '') + (o.target ? ' bille--target' : ''),
    style: { '--c': t.c, '--d': t.d, '--s': String(o.size ?? 17), ...o.style },
  });
}

/** Bille du kiosque (motif sur la couleur du joueur) ; « classique » : la bille de base. */
export function billeSkin(el: HTMLElement, skin: string | undefined): HTMLElement {
  if (skin && skin !== 'classique') el.classList.add('bille--' + skin);
  return el;
}

/** Les quatre couleurs d'un jeu de cartes et l'étoile du joker, dessinées (repère 24 × 24). */
const SUITS: Record<string, string> = {
  H: 'M12 21 C5 15 2 11.5 2 8 A5 5 0 0 1 12 6.5 A5 5 0 0 1 22 8 C22 11.5 19 15 12 21 Z',
  D: 'M12 2 L21 12 L12 22 L3 12 Z',
  S: 'M12 2 C17 8 22 11 22 15 A4.5 4.5 0 0 1 13.5 17 L15 22 H9 L10.5 17 A4.5 4.5 0 0 1 2 15 C2 11 7 8 12 2 Z',
  C: 'M12 2 A4.6 4.6 0 0 1 15.6 9.4 A4.6 4.6 0 1 1 13.4 16.6 L15 22 H9 L10.6 16.6 A4.6 4.6 0 1 1 8.4 9.4 A4.6 4.6 0 0 1 12 2 Z',
  X: 'M12 1.5 L14.9 8.6 L22.5 9.2 L16.7 14.2 L18.5 21.6 L12 17.6 L5.5 21.6 L7.3 14.2 L1.5 9.2 L9.1 8.6 Z',
};

/** Le symbole d'une couleur de carte, à la couleur du texte courant. */
export function suitIcon(k: string): HTMLElement {
  const el = h('span', { 'aria-hidden': 'true', style: { display: 'inline-block', lineHeight: 0 } });
  el.innerHTML = `<svg viewBox="0 0 24 24"><path d="${SUITS[k] ?? SUITS.X}" fill="currentColor"/></svg>`;
  return el;
}

export interface CardViewOpts extends CardOptions {
  selected?: boolean;
  onclick?: () => void;
}

/** Carte à jouer 92 × 132 : rang et couleur dans les deux coins du haut, bandeau de pouvoir en bas. */
export function playingCard(card: string, o: CardViewOpts = {}): HTMLElement {
  const c = cardLook(card, o);
  const col = c.k === 'X' ? 'var(--violet-d)' : c.red ? 'var(--card-red)' : 'var(--ink)';
  const corner = (end = false) => {
    const suit = suitIcon(c.k);
    suit.className = 'pcard__suit';
    // Le joker n'a pas de rang : son étoile suffit.
    return h('div', { class: 'pcard__corner' + (end ? ' pcard__corner--end' : '') }, c.k === 'X' ? null : h('span', { class: 'pcard__rank' + (c.r.length > 1 ? ' pcard__rank--wide' : '') }, c.r), suit);
  };
  const pip = suitIcon(c.k);
  pip.className = 'pcard__pip';
  return h(o.onclick ? 'button' : 'div', {
    class: 'pcard',
    type: o.onclick ? 'button' : undefined,
    'aria-pressed': o.onclick ? String(!!o.selected) : undefined,
    'aria-label': `${c.t}, ${c.badge}`,
    onclick: o.onclick,
    style: { '--col': col, '--bbg': c.bg, '--bc': c.bc, cursor: o.onclick ? 'pointer' : 'default' },
  }, corner(), corner(true), pip, h('span', { class: 'pcard__badge' }, c.badge));
}

/** Dos de carte rouge « TOC » (pioche). */
export function cardBack(): HTMLElement {
  return h('div', { class: 'pback', 'aria-hidden': 'true' }, h('span', null, 'TOC'));
}

/** Deux pastilles qui se chevauchent : les couleurs d'une équipe. */
export function duo(a: ColorName, b: ColorName, size = 14): HTMLElement {
  const dot = (c: ColorName, extra: Css = {}) => h('span', { style: { width: size, height: size, background: COL[c].c, ...extra } });
  return h('span', { class: 'duo' }, dot(a), dot(b, { marginLeft: -Math.round(size * 0.36) }));
}

export type BtnVariant = 'primary' | 'white' | 'danger' | 'dark' | 'on-blue' | 'yellow' | 'ok' | 'off' | 'text';
export type BtnSize = 'lg' | 'md' | 'sm' | 'xs';

export function button(label: string, variant: BtnVariant, onclick?: () => void, o: { size?: BtnSize; block?: boolean; disabled?: boolean } = {}) {
  const cls = ['btn', 'btn--' + variant, o.size && 'btn--' + o.size, o.block && 'btn--block'].filter(Boolean).join(' ');
  return h('button', { class: cls, type: 'button', onclick, disabled: o.disabled }, label);
}

/** Petit dessin au trait (repère 24 × 24), à la couleur du texte courant. */
export function icon(d: string, size = 20, width = 3): HTMLElement {
  const el = h('span', { 'aria-hidden': 'true', style: { display: 'inline-block', width: size, height: size, lineHeight: 0, flex: 'none' } });
  el.innerHTML = `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
  return el;
}
export const ICONS = {
  back: 'M14.5 5 L7.5 12 l7 7',
  close: 'M6 6 l12 12 M18 6 L6 18',
  share: 'M12 15V4 M7.5 8.5 L12 4l4.5 4.5 M5 13v5.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V13',
  play: 'M8 5.5v13l10.5-6.500z',
  chat: 'M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-6.500l-4.500 4v-4H5a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 5 4.5z',
  plus: 'M12 4v16 M4 12h16',
  arrow: 'M5 12h13 M12 5l7 7-7 7',
  invite: 'M13 8 a3.600 3.600 0 1 1 -7.200 0 a3.600 3.600 0 1 1 7.200 0 M3 20 c0 -4 3 -6.500 6.500 -6.500 s6.500 2.500 6.500 6.500 M19 7 v6 M16 10 h6',
  list: 'M9 6h11 M9 12h11 M9 18h11 M4.500 6h.01 M4.500 12h.01 M4.500 18h.01',
  edit: 'M4 20 l1 -4.500 L15.500 5 l3.500 3.500 L8.500 19 Z M13.500 7 l3.500 3.500',
  check: 'M5 12.500 l4.500 4.500 l9.500 -10.500',
};

export function backButton(onclick: () => void) {
  return h('button', { class: 'btn-round', type: 'button', 'aria-label': 'Retour', onclick }, icon(ICONS.back, 20, 3.6));
}

export function pauseButton(onclick: () => void) {
  return h('button', { class: 'btn-round', type: 'button', 'aria-label': 'Pause', onclick },
    h('span', { class: 'pause-bar' }), h('span', { class: 'pause-bar' }));
}

export interface SegOption<T> {
  value: T;
  label: string;
  sub?: string;
}

/** Sélecteur segmenté. Les options avec sous-titre prennent la version haute. */
export function segmented<T>(options: SegOption<T>[], value: T, onChange: (v: T) => void): HTMLElement {
  const tall = options.some((o) => o.sub);
  const root = h('div', { class: 'seg' + (tall ? ' seg--tall' : ''), role: 'group' });
  const btns = options.map((o) =>
    h('button', {
      class: 'seg__opt', type: 'button', 'aria-pressed': String(o.value === value),
      onclick: () => {
        btns.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === o.value)));
        onChange(o.value);
      },
    }, o.label, o.sub && h('span', { class: 'seg__sub' }, o.sub)),
  );
  root.append(...btns);
  return root;
}

/** Les cinq rubriques de l'app : La une, Ta bande, Albums (tournois), Classement, Kiosque (boutique). */
export type Tab = 'home' | 'friends' | 'albums' | 'ranking' | 'shop';

const TABS: { id: Tab; label: string; path: string; d: string }[] = [
  { id: 'home', label: 'La une', path: ROUTES.home, d: 'M13.5 2 L4.5 13.5 h6 l-1 8.5 L19.5 10 h-6 Z' },
  { id: 'friends', label: 'Ta bande', path: ROUTES.friends, d: 'M12.600 8 a3.600 3.600 0 1 1 -7.200 0 a3.600 3.600 0 1 1 7.200 0 M2.500 20 c0 -4 3 -6.500 6.500 -6.500 s6.500 2.500 6.500 6.500 M20.300 9.500 a2.800 2.800 0 1 1 -5.600 0 a2.800 2.800 0 1 1 5.600 0 M17 13.800 c2.800 0 4.800 2 4.800 5.700' },
  { id: 'albums', label: 'Albums', path: ROUTES.albums, d: 'M5 5.5 A2 2 0 0 1 7 3.5 h12 v14 H7 a2 2 0 0 0 -2 2 Z M5 19.5 a2 2 0 0 0 2 2 h12 v-4 M9.5 8 h5.500' },
  { id: 'ranking', label: 'Classement', path: ROUTES.ranking, d: 'M7 4h10v5a5 5 0 0 1-10 0z M7 6H4a3 3 0 0 0 3 4 M17 6h3a3 3 0 0 1-3 4 M12 14v4.500 M8.500 20.500h7' },
  { id: 'shop', label: 'Kiosque', path: ROUTES.shop, d: 'M5 8.5 h14 l-1 12 H6 Z M9 8.5 V7 a3 3 0 0 1 6 0 v1.500' },
];

/** Barre d'onglets flottante. `dots` : pastille de nouveautés sur une rubrique (ex. une partie qui t'attend). */
export function tabbar(current: Tab, dots: Partial<Record<Tab, number>> = {}): HTMLElement {
  return h('nav', { class: 'tabbar', 'aria-label': 'Navigation' },
    TABS.map((t) => {
      const ic = icon(t.d, 23, 2.4);
      ic.className = 'tabbar__icon';
      return h('button', {
        class: 'tabbar__btn', type: 'button', 'aria-current': t.id === current ? 'page' : undefined,
        onclick: () => go(t.path),
      }, ic, t.label, dots[t.id] ? h('span', { class: 'tabbar__dot' }, String(dots[t.id])) : null);
    }),
  );
}
