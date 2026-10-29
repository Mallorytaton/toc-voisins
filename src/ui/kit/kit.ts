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

const i = (style: string) => {
  const el = h('i');
  el.style.cssText = style;
  return el;
};

/** Barre d'onglets flottante : Jouer · Ta gang · Classement. */
export function tabbar(current: Tab, go: (t: Tab) => void): HTMLElement {
  const icons: Record<Tab, () => HTMLElement> = {
    home: () => h('span', { class: 'tabbar__icon', style: { width: 22 } },
      i('left:5px;top:0;width:12px;height:12px;border-radius:50%'),
      i('left:2px;top:12px;width:18px;height:9px;border-radius:7px 7px 3px 3px')),
    friends: () => h('span', { class: 'tabbar__icon' },
      i('left:2px;top:2px;width:10px;height:10px;border-radius:50%'),
      i('left:0;top:13px;width:14px;height:8px;border-radius:7px 7px 3px 3px'),
      i('left:13px;top:0;width:11px;height:11px;border-radius:50%;opacity:.6'),
      i('left:11px;top:12px;width:15px;height:9px;border-radius:7px 7px 3px 3px;opacity:.6')),
    ranking: () => h('span', { class: 'tabbar__icon', style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 3 } },
      ...[12, 20, 15].map((ht) => {
        const b = h('i', { style: { position: 'static', width: 6, height: ht, borderRadius: 2 } });
        return b;
      })),
  };
  const labels: Record<Tab, string> = { home: 'Jouer', friends: 'Ta gang', ranking: 'Classement' };
  return h('nav', { class: 'tabbar', 'aria-label': 'Navigation' },
    (Object.keys(labels) as Tab[]).map((t) =>
      h('button', {
        class: 'tabbar__btn', type: 'button', 'aria-current': t === current ? 'page' : undefined,
        onclick: () => go(t),
      }, icons[t](), labels[t])),
  );
}
