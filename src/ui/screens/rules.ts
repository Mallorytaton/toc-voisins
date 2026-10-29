// Règles de la partie : les variantes proposées à la création d'une salle ou d'un tournoi.
import { DEFAULT_VARIANTS, type Variants } from '../../engine';
import { h } from '../dom';
import { cardLook } from '../kit/data';
import { button } from '../kit/kit';

interface Option {
  label: string;
  desc: string;
  get: (v: Variants) => boolean;
  set: (v: Variants, on: boolean) => Variants;
}

/** Chaque interrupteur s'écarte des règles de base quand il est activé (sauf le pion bloquant). */
const OPTIONS: Option[] = [
  { label: 'Le Roi avance aussi de 13', desc: 'En plus de sortir un pion.', get: (v) => v.kingThirteen, set: (v, on) => ({ ...v, kingThirteen: on }) },
  { label: 'Le Valet avance de 11', desc: 'Au lieu d’échanger deux pions.', get: (v) => v.jackEleven, set: (v, on) => ({ ...v, jackEleven: on }) },
  { label: 'Le 7 sur plus de deux pions', desc: 'Les 7 pas se partagent entre autant de pions qu’on veut.', get: (v) => v.sevenAnyPawns, set: (v, on) => ({ ...v, sevenAnyPawns: on }) },
  { label: 'Le 7 prend les pions dépassés', desc: 'Chaque pion sauté retourne dans sa réserve.', get: (v) => !v.sevenNoPassCapture, set: (v, on) => ({ ...v, sevenNoPassCapture: !on }) },
  { label: 'Jokers dans le paquet', desc: 'Deux jokers par paquet, qui remplacent n’importe quelle carte.', get: (v) => v.jokers > 0, set: (v, on) => ({ ...v, jokers: on ? 2 : 0 }) },
  { label: 'Le 5 fait avancer un autre joueur', desc: 'On avance de 5 le pion de quelqu’un d’autre.', get: (v) => v.fiveOthers, set: (v, on) => ({ ...v, fiveOthers: on }) },
  { label: 'Défausser une seule carte', desc: 'Sans coup possible, on jette une carte au lieu de toute sa main.', get: (v) => v.discardOne, set: (v, on) => ({ ...v, discardOne: on }) },
  { label: 'Pion bloquant au départ', desc: 'Un pion qui vient de sortir ne peut être ni dépassé ni pris.', get: (v) => v.startBlocks, set: (v, on) => ({ ...v, startBlocks: on }) },
];

/** Règles complètes (les vieilles parties n'ont pas toutes les clés). */
export const withDefaults = (v?: Partial<Variants>): Variants => ({ ...DEFAULT_VARIANTS, ...v });

/** « Règles de base » ou « Règles de base + 2 variantes ». */
export function variantsSummary(v: Variants): string {
  const n = OPTIONS.filter((o) => o.get(v) !== o.get(DEFAULT_VARIANTS)).length;
  return n === 0 ? 'Règles de base' : `Règles de base + ${n} variante${n > 1 ? 's' : ''}`;
}

/** Rappel des règles de base, en tête de la feuille. */
const BASE = 'As : sortir ou 1 · Roi : sortir · 4 : recule de 4 · 7 : un pion ou partagé entre deux, sans prendre les pions dépassés · Valet : échange avec un pion de ton équipe ou adverse · les autres cartes avancent de leur valeur.';

/** Feuille « Règles de la partie ». editable = false : simple lecture (invités, tournoi). */
export function openVariantsSheet(current: Variants, editable: boolean, onSave: (v: Variants) => void) {
  let v = withDefaults(current);
  const rows = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } });
  const draw = () => rows.replaceChildren(...OPTIONS.map((o) => {
    const on = o.get(v);
    return h('label', { class: 'variant' + (editable ? '' : ' variant--ro') },
      h('span', { class: 'variant__text' }, h('b', null, o.label), h('span', null, o.desc)),
      h('input', {
        type: 'checkbox', class: 'switch', role: 'switch', checked: on, disabled: !editable,
        onchange: (e: Event) => { v = o.set(v, (e.target as HTMLInputElement).checked); draw(); },
      }));
  }));
  draw();
  const close = () => wrap.remove();
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div', { class: 'sheet sheet--tall', role: 'dialog', 'aria-label': 'Règles de la partie' },
      h('span', { class: 'sheet__title' }, 'Règles de la partie'),
      h('span', { class: 'sheet__text', style: { marginBottom: 2 } }, BASE),
      h('div', { class: 'scroll-y', style: { maxHeight: '46vh' } }, rows),
      editable
        ? [button('Valider', 'primary', () => { onSave(v); close(); }, { size: 'md', block: true }),
          button('Revenir aux règles de base', 'text', () => { v = { ...DEFAULT_VARIANTS }; draw(); })]
        : button('Fermer', 'white', close, { size: 'md', block: true })));
  (document.getElementById('app') ?? document.body).append(wrap);
}

/** Rappel des règles pendant la partie : le but, chaque carte (selon les variantes), les variantes actives. */
export function openRulesSheet(current: Variants) {
  const v = withDefaults(current);
  const ranks = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2', ...(v.jokers > 0 ? ['X'] : [])];
  const cards = ranks.map((r) => {
    const c = cardLook(r + (r === 'X' ? 'J0' : 'S0'), v);
    return h('div', { class: 'rule-card' },
      h('span', { class: 'rule-card__rank' }, c.r),
      h('div', { class: 'rule-card__text' },
        h('span', { class: 'rule-card__badge', style: { background: c.bg, color: c.bc } }, c.badge),
        h('span', null, c.rule)));
  });
  const active = OPTIONS.filter((o) => o.get(v) !== o.get(DEFAULT_VARIANTS));
  const game = [
    'Le but : rentrer les 4 billes de chaque joueur de ton équipe dans sa maison, avant les autres équipes.',
    'Tes billes partent de ta réserve et sortent sur ton trou de départ (As ou Roi).',
    'On fait un tour complet, puis on entre dans sa maison depuis le trou juste avant son départ, au compte exact.',
    'S’arrêter sur une bille la renvoie dans sa réserve, même celle de ton partenaire.',
    ...(v.startBlocks ? ['Une bille qui vient de sortir bloque son trou de départ : personne ne la dépasse ni ne la prend.'] : []),
    v.discardOne ? 'Sans coup possible, tu défausses une carte de ton choix.' : 'Sans coup possible, tu défausses ta main et tu attends la donne suivante.',
    'Quand tes 4 billes sont rentrées, tu joues celles de ton partenaire.',
  ];
  const close = () => wrap.remove();
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div', { class: 'sheet sheet--tall', role: 'dialog', 'aria-label': 'Règles du TOC' },
      h('span', { class: 'sheet__title' }, 'Règles du TOC'),
      h('div', { class: 'scroll-y', style: { maxHeight: '58vh', display: 'flex', flexDirection: 'column', gap: 12 } },
        h('span', { class: 't-label' }, 'Les cartes'),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } }, ...cards),
        h('span', { class: 't-label' }, 'Le jeu'),
        h('ul', { class: 'rule-list' }, ...game.map((t) => h('li', null, t))),
        h('span', { class: 't-label' }, 'Variantes de cette partie'),
        active.length
          ? h('ul', { class: 'rule-list' }, ...active.map((o) => h('li', null, h('b', null, o.label), ' : ', o.desc)))
          : h('span', { class: 't-body' }, 'Aucune : on joue avec les règles de base.')),
      button('Fermer', 'primary', close, { size: 'md', block: true })));
  (document.getElementById('app') ?? document.body).append(wrap);
}

/** Carte « Règles » (salle, création de tournoi) : résumé, et la feuille au toucher. */
export function variantsCard(get: () => Variants, editable: () => boolean, onSave: (v: Variants) => void): { el: HTMLElement; refresh: () => void } {
  const summary = h('span', { class: 'variants-card__sum' });
  const action = h('span', { class: 'variants-card__go' });
  const el = h('button', {
    class: 'variants-card', type: 'button',
    onclick: () => openVariantsSheet(get(), editable(), onSave),
  }, h('span', { class: 'variants-card__title' }, 'Règles'), summary, action);
  const refresh = () => {
    summary.textContent = variantsSummary(withDefaults(get()));
    action.textContent = editable() ? 'Modifier ›' : 'Voir ›';
  };
  refresh();
  return { el, refresh };
}
