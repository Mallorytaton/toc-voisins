// Composants de base de la maquette, en DOM natif.
import { h } from '../dom';
import { AV_COL, COL, cardLook, type CardOptions, type CharId, type ColorName } from './data';

type Css = Record<string, string | number>;
const d = (style: string, ...kids: HTMLElement[]) => {
  const el = h('div', null, ...kids);
  el.style.cssText = style;
  return el;
};

/** Personnage en formes simples (Avatar.dc.html). Tout est en em : 10em = la taille. */
export function avatar(char: CharId, color: ColorName, size = 64): HTMLElement {
  const [c, dk] = AV_COL[color] ?? AV_COL.coral;
  const eye = (left: number) =>
    d(`left:${left}em;top:4.75em;width:.95em;height:1.15em;border-radius:50%;background:#2b2a3d`,
      d('left:.2em;top:.2em;width:.35em;height:.35em;border-radius:50%;background:#fff;position:absolute'));
  const parts: HTMLElement[] = [];
  if (char === 'chignon')
    parts.push(d(`left:3.3em;top:-.1em;width:3.4em;height:3.4em;border-radius:50%;background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.5) 0,rgba(255,255,255,0) 45%),${c};box-shadow:inset -.3em -.4em 0 ${dk}`));
  parts.push(
    d(`left:.6em;top:1.1em;width:8.8em;height:8.6em;border-radius:50%;background:radial-gradient(circle at 34% 26%,rgba(255,255,255,.65) 0,rgba(255,255,255,0) 40%),${c};box-shadow:inset -.45em -.65em 0 ${dk},0 .45em .8em rgba(70,40,20,.22)`),
    d('left:2.05em;top:6.15em;width:1.3em;height:.8em;border-radius:50%;background:rgba(255,80,80,.3)'),
    d('left:6.65em;top:6.15em;width:1.3em;height:.8em;border-radius:50%;background:rgba(255,80,80,.3)'),
    eye(3.05), eye(5.95),
    d('left:4.4em;top:6.35em;width:1.2em;height:.6em;border-radius:0 0 .7em .7em;background:#2b2a3d'),
  );
  if (char === 'tuque')
    parts.push(
      d('left:1.05em;top:.5em;width:7.9em;height:3.4em;border-radius:4em 4em .8em .8em;background:#fff8ef;box-shadow:inset -.3em -.4em 0 #eadccb'),
      d(`left:1.35em;top:2.1em;width:7.3em;height:.6em;background:${dk};opacity:.85`),
      d('left:.75em;top:3.3em;width:8.5em;height:1.2em;border-radius:.7em;background:#f3e6d6;box-shadow:inset 0 -.25em 0 #e2d2be'),
      d('left:4.1em;top:-.4em;width:1.8em;height:1.8em;border-radius:50%;background:#fff8ef;box-shadow:inset -.2em -.25em 0 #eadccb'),
    );
  else if (char === 'casquette')
    parts.push(
      d('left:1.4em;top:.7em;width:7.2em;height:3.4em;border-radius:3.6em 3.6em .4em .4em;background:#2b2a3d;box-shadow:inset -.3em -.35em 0 #1b1a28'),
      d('left:4.5em;top:.45em;width:1em;height:.7em;border-radius:.5em;background:#2b2a3d'),
      d('left:4.9em;top:3.3em;width:4.6em;height:1.05em;border-radius:.2em 1em 1em .2em;background:#3b3a52'),
    );
  else if (char === 'couronne') {
    const crown = 'clip-path:polygon(0 100%,0 15%,22% 55%,50% 0,78% 55%,100% 15%,100% 100%)';
    parts.push(
      d(`left:2.9em;top:.15em;width:4.2em;height:2.4em;background:#d9a116;${crown}`),
      d(`left:2.9em;top:-.1em;width:4.2em;height:2.4em;background:#ffd34d;${crown}`),
      d('left:4.6em;top:1.2em;width:.8em;height:.8em;border-radius:50%;background:#ff6b4a'),
    );
  } else if (char === 'lunettes') {
    const lens = 'width:1.95em;height:1.95em;border-radius:50%;border:.32em solid #2b2a3d;background:rgba(255,255,255,.18);top:4.25em';
    parts.push(
      d(`left:2.55em;${lens}`), d(`left:5.5em;${lens}`),
      d('left:4.45em;top:4.95em;width:1.1em;height:.3em;background:#2b2a3d'),
    );
  } else if (char === 'bandeau')
    parts.push(
      d('left:.7em;top:2.75em;width:8.6em;height:1.25em;border-radius:.6em;background:#fff8ef;box-shadow:inset 0 -.25em 0 #eadccb;transform:rotate(-7deg)'),
      d('left:8.2em;top:1.7em;width:1.1em;height:1.1em;border-radius:50%;background:#fff8ef;box-shadow:inset -.2em -.2em 0 #eadccb'),
      d('left:8.9em;top:2.4em;width:.9em;height:.9em;border-radius:50%;background:#fff8ef;box-shadow:inset -.2em -.2em 0 #eadccb'),
    );
  const el = h('div', { class: 'avatar', 'aria-hidden': 'true' }, ...parts);
  el.style.cssText = `width:${size}px;height:${size}px;font-size:${size / 10}px`;
  return el;
}

/** Avatar posé sur un disque blanc cerclé de couleur (accueil, salle, classement). */
export function avatarRing(
  char: CharId, color: ColorName, size: number, ring: string, pad = 4, ringW = 3, drop: string | null = '0 6px 12px rgba(70,40,20,.15)',
): HTMLElement {
  return h('div', {
    class: 'avatar-ring',
    style: { padding: pad, boxShadow: `0 0 0 ${ringW}px ${ring}` + (drop ? ',' + drop : '') },
  }, avatar(char, color, size));
}

export interface BilleOpts {
  size?: number;
  sel?: boolean;
  target?: boolean;
  style?: Css;
}

/** Bille (pion) brillante avec relief. */
export function bille(color: ColorName, o: BilleOpts = {}): HTMLElement {
  const t = COL[color];
  return h('div', {
    class: 'bille' + (o.sel ? ' bille--sel' : '') + (o.target ? ' bille--target' : ''),
    style: { '--c': t.c, '--d': t.d, '--s': String(o.size ?? 17), ...o.style },
  });
}

/** Bille de la boutique (motif sur la couleur du joueur) ; « classique » : la bille de base. */
export function billeSkin(el: HTMLElement, skin: string | undefined): HTMLElement {
  if (skin && skin !== 'classique') el.classList.add('bille--' + skin);
  return el;
}

export interface CardViewOpts extends CardOptions {
  selected?: boolean;
  onclick?: () => void;
}

/** Carte à jouer 80 × 116 avec son badge de pouvoir. */
export function playingCard(card: string, o: CardViewOpts = {}): HTMLElement {
  const c = cardLook(card, o);
  const col = card.startsWith('X') ? '#9b7bff' : c.red ? 'var(--card-red)' : 'var(--ink)';
  return h(o.onclick ? 'button' : 'div', {
    class: 'pcard',
    type: o.onclick ? 'button' : undefined,
    'aria-pressed': o.onclick ? String(!!o.selected) : undefined,
    'aria-label': `${c.t}, ${c.badge}`,
    onclick: o.onclick,
    style: { '--col': col, '--bbg': c.bg, '--bc': c.bc, border: 'none', cursor: o.onclick ? 'pointer' : 'default' },
  },
    h('div', { class: 'pcard__corner' }, h('span', { class: 'pcard__rank' }, c.r), h('span', { class: 'pcard__suit' }, c.s)),
    h('div', { class: 'pcard__pip' }, c.s),
    h('span', { class: 'pcard__badge' }, c.badge),
  );
}

/** Dos de carte bleu « TOC » (pioche). */
export function cardBack(): HTMLElement {
  return h('div', { class: 'pback', 'aria-hidden': 'true' }, h('span', null, 'TOC'));
}

/** Deux pastilles qui se chevauchent : les couleurs d'une équipe. */
export function duo(a: ColorName, b: ColorName, size = 14): HTMLElement {
  const dot = (c: ColorName, extra: Css = {}) => h('span', { style: { width: size, height: size, background: COL[c].c, ...extra } });
  return h('span', { class: 'duo' }, dot(a), dot(b, { marginLeft: -Math.round(size * 0.57) }));
}

export type BtnVariant = 'primary' | 'white' | 'danger' | 'dark' | 'on-blue' | 'yellow' | 'ok' | 'off' | 'text';
export type BtnSize = 'lg' | 'md' | 'sm' | 'xs';

export function button(label: string, variant: BtnVariant, onclick?: () => void, o: { size?: BtnSize; block?: boolean; disabled?: boolean } = {}) {
  const cls = ['btn', 'btn--' + variant, o.size && 'btn--' + o.size, o.block && 'btn--block'].filter(Boolean).join(' ');
  return h('button', { class: cls, type: 'button', onclick, disabled: o.disabled }, label);
}

export function backButton(onclick: () => void) {
  return h('button', { class: 'btn-round', type: 'button', 'aria-label': 'Retour', onclick }, '‹');
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

/** Sélecteur segmenté. Les options avec sous-titre prennent la version haute (56 px). */
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

export type Tab = 'home' | 'friends' | 'ranking';

/** Icônes maison de la barre d'onglets, dans le verre des billes : une bille, deux billes qui sourient, une coupe. */
const mg = (id: string, c: string, d: string) => `<radialGradient id="${id}" cx="36%" cy="30%" r="72%"><stop offset="0" stop-color="#fff"/><stop offset=".22" stop-color="${c}"/><stop offset=".82" stop-color="${c}"/><stop offset="1" stop-color="${d}"/></radialGradient>`;
const TAB_ICONS: Record<Tab, string> = {
  home: `<svg viewBox="0 0 32 32" aria-hidden="true"><defs>${mg('tbj', '#ff6b4a', '#d9482a')}</defs><ellipse cx="16" cy="28.5" rx="8" ry="2.2" fill="#000" opacity=".15"/><circle cx="16" cy="15" r="11" fill="url(#tbj)"/><path d="M13.6 10.4v9.2l7.2-4.6z" fill="#fff"/></svg>`,
  friends: `<svg viewBox="0 0 32 32" aria-hidden="true"><defs>${mg('tba', '#4a7dff', '#2f5bd6')}${mg('tbb', '#ffc93c', '#d9a116')}</defs><ellipse cx="16" cy="29" rx="12" ry="2" fill="#000" opacity=".14"/><circle cx="11" cy="15.5" r="8.6" fill="url(#tba)"/><circle cx="21.4" cy="18" r="8.6" fill="url(#tbb)"/>`
    + '<circle cx="8.6" cy="15" r="1.3" fill="#2b2a3d"/><circle cx="13" cy="15" r="1.3" fill="#2b2a3d"/><circle cx="19.2" cy="17.4" r="1.3" fill="#2b2a3d"/><circle cx="23.8" cy="17.4" r="1.3" fill="#2b2a3d"/><path d="M19.4 20.8q2.3 1.9 4.6 0" stroke="#2b2a3d" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>',
  ranking: '<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="tbc" x1="0" x2="1"><stop offset="0" stop-color="#ffe07a"/><stop offset=".55" stop-color="#ffc93c"/><stop offset="1" stop-color="#d9a116"/></linearGradient></defs><ellipse cx="16" cy="29.2" rx="8" ry="1.9" fill="#000" opacity=".14"/>'
    + '<path d="M8.5 8H5a4 4 0 0 0 4.6 6.2M23.5 8H27a4 4 0 0 1-4.6 6.2" stroke="#d9a116" stroke-width="2" fill="none"/><path d="M8 5.5h16v6a8 8 0 0 1-16 0z" fill="url(#tbc)"/><rect x="14" y="18.5" width="4" height="4.5" fill="#d9a116"/><rect x="10" y="23" width="12" height="4.2" rx="1.6" fill="#2b2a3d"/>'
    + '<path d="M16 7.6l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z" fill="#fff"/></svg>',
};
/** Dernier onglet affiché : la pastille glisse depuis lui vers le nouvel onglet. */
let lastTab: Tab | null = null;

/** Barre d'onglets flottante : Jouer · Amis · Classement. */
export function tabbar(current: Tab, go: (t: Tab) => void): HTMLElement {
  const labels: Record<Tab, string> = { home: 'Jouer', friends: 'Amis', ranking: 'Classement' };
  const tabs = Object.keys(labels) as Tab[];
  const to = tabs.indexOf(current), from = lastTab ? tabs.indexOf(lastTab) : to;
  lastTab = current;
  const pill = h('span', { class: 'tabbar__pill', style: { '--i': String(from) } });
  if (from !== to) requestAnimationFrame(() => requestAnimationFrame(() => pill.style.setProperty('--i', String(to))));
  const icon = (t: Tab) => {
    const el = h('span', { class: 'tabbar__icon' });
    el.innerHTML = TAB_ICONS[t];
    return el;
  };
  return h('nav', { class: 'tabbar', 'aria-label': 'Navigation' },
    pill,
    tabs.map((t) =>
      h('button', {
        class: 'tabbar__btn', type: 'button', 'aria-current': t === current ? 'page' : undefined,
        onclick: () => go(t),
      }, icon(t), labels[t])),
  );
}
