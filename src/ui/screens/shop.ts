// Le kiosque (la boutique) : billes, effets de BOUM, cris et titres, achetés avec les pièces gagnées en partie.
import { type ShopItem, type ShopKind, SHOP, buy, lookOf, owns, wears } from '../../app/shop';
import { draftProfile } from '../../app/profile';
import { syncProfile } from '../../net/social';
import { boomFx } from '../board/boom';
import { playFx } from '../board/fx';
import { h, toast } from '../dom';
import { COL } from '../kit/data';
import { bille, billeSkin, segmented, tabbar } from '../kit/kit';
import { burstEl } from '../planche';

type Tab = 'bille' | 'boom' | 'titre' | 'plateau';
const fmt = (n: number) => n.toLocaleString('fr-FR');

export function shopScreen(): { el: HTMLElement; cleanup: () => void } {
  let tab: Tab = 'bille';
  const coinsN = h('span');
  const coins = h('div', { class: 'tokens', 'aria-label': 'Tes pièces' }, h('i'), coinsN);
  const list = h('div', { class: 'scroll-y shop__list' });
  const save = () => { if (navigator.onLine) syncProfile().catch(() => undefined); };
  const marble = (skin: string, size: number) => billeSkin(bille(draftProfile().color, { size }), skin);

  /** Aperçu : quatre billes, ou un bout de plateau où l'effet se joue quand on le touche. */
  const preview = (it: ShopItem): HTMLElement => {
    if (it.kind === 'bille') return h('div', { class: 'shop__marbles' }, ...[0, 1, 2, 3].map(() => marble(it.id, 30)));
    // Le cri, tel qu'il claque sur le plateau : dans son étoile.
    if (it.kind === 'cri') return h('div', { class: 'shop__fxbox shop__burst' }, ...burstEl('#fff', 12, 36, 5), h('span', { class: 'shop__cri' }, it.name));
    if (it.kind === 'titre') return h('div', { class: 'shop__fxbox' }, h('span', { class: 'shop__titre' }, it.id === 'aucun' ? '—' : it.name));
    if (it.kind === 'plateau') return h('div', { class: 'shop__board shop__board--' + it.id, style: it.id === 'peint' ? { backgroundImage: `url(${import.meta.env.BASE_URL}plateaux/peint-mini.jpg)` } : {} });
    const layer = h('div', { class: 'shop__fx' });
    const box = h('button', { class: 'shop__fxbox', type: 'button', 'aria-label': `Voir l’effet ${it.name}` },
      marble(lookOf(draftProfile().look).bille, 26), layer);
    box.addEventListener('click', () => boomFx((x) => playFx(layer, x), { boom: it.id }, 0, 0, COL[draftProfile().color].c));
    return box;
  };

  const action = (it: ShopItem) => {
    if (wears(it)) return h('span', { class: 'shop__state' }, '✓ Porté');
    if (owns(it.id)) return h('button', { class: 'shop__btn', type: 'button', onclick: () => { buy(it); save(); draw(); } }, 'Porter');
    const miss = it.price - draftProfile().tokens;
    return h('button', {
      class: 'shop__btn shop__btn--buy', type: 'button', disabled: miss > 0,
      onclick: () => {
        if (!buy(it)) return toast('Pas assez de pièces.');
        save();
        toast(`${it.name} : à toi !`);
        draw();
      },
    }, h('i', { class: 'shop__coin' }), miss > 0 ? `${fmt(it.price)} · il t’en manque ${fmt(miss)}` : `Acheter · ${fmt(it.price)}`);
  };

  const card = (it: ShopItem) =>
    h('div', { class: 'shop__item' + (wears(it) ? ' shop__item--on' : '') }, preview(it), h('b', { class: 'shop__name' }, it.name), action(it));
  const section = (label: string, kind: ShopKind) =>
    [h('span', { class: 't-label' }, label), h('div', { class: 'shop__grid' }, ...SHOP.filter((x) => x.kind === kind).map(card))];

  const draw = () => {
    coinsN.textContent = fmt(draftProfile().tokens);
    list.replaceChildren(
      ...(tab === 'bille' ? section('Tes billes sur le plateau, vues par toute la table', 'bille')
        : tab === 'boom' ? [...section('Quand tu renvoies une bille à sa réserve · touche pour voir', 'boom'), ...section('Le cri du BOUM', 'cri')]
          : tab === 'titre' ? section('Sous ton nom, dans la salle et sur ta fiche', 'titre')
            : section('Ton plateau de jeu, sur ton écran (parties à 4)', 'plateau')),
      h('p', { class: 'shop__foot' }, 'Une partie en ligne gagnée rapporte 100 pièces, une partie perdue 20.'));
  };
  const tabs = segmented<Tab>([{ value: 'bille', label: 'Billes' }, { value: 'boom', label: 'BOUM' }, { value: 'titre', label: 'Titres' }, { value: 'plateau', label: 'Plateaux' }], tab, (v) => { tab = v; draw(); });
  draw();

  const el = h('div', { class: 'screen screen--tabs shop', 'data-fit': 'tabs', 'data-tone': 'rose', style: { gap: 10, paddingTop: 'calc(var(--safe-top) + 8px)' } },
    h('div', { class: 'screen__head' },
      h('span', { class: 't-screen', style: { marginRight: 'auto' } }, 'Le kiosque'), coins),
    tabs, list, tabbar('shop'));
  return { el, cleanup: () => {} };
}
