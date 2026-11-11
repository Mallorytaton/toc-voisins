// Le kiosque (la boutique), comme sur la maquette : les rubriques en pastilles (elles font défiler jusqu'à leur rayon),
// la nouveauté en bannière, les billes en grille de trois, les cris dans leur étoile, puis les effets, les plateaux
// et les titres. Un objet se touche : sa feuille le montre en grand, avec son prix ; rien ne s'achète d'un seul toucher.
import { type ShopItem, type ShopKind, SHOP, buy, lookOf, owns, wears } from '../../app/shop';
import { draftProfile } from '../../app/profile';
import { syncProfile } from '../../net/social';
import { boomFx } from '../board/boom';
import { playFx } from '../board/fx';
import { h, toast } from '../dom';
import { COL } from '../kit/data';
import { bille, billeSkin, button, tabbar } from '../kit/kit';
import { inPage, signets, spread } from '../album/spread';
import { mascot } from '../mascot';

type Rayon = 'bille' | 'cri' | 'plateau' | 'titre';
const RAYONS: [Rayon, string][] = [['bille', 'Billes'], ['cri', 'Cris'], ['plateau', 'Plateaux'], ['titre', 'Titres']];
const fmt = (n: number) => n.toLocaleString('fr-FR');
/** La couleur du mot de chaque cri, dans son étoile */
const CRI_INK: Record<string, string> = { boum: '#e0331b', paf: '#e0331b', kaboom: '#2440d6', splash: '#0b7f68' };
/** « la bille Galaxie », « le cri PAF ! »… pour les messages et les lecteurs d'écran */
const KIND: Record<ShopKind, string> = { bille: 'Bille', boom: 'Effet', cri: 'Cri', titre: 'Titre', plateau: 'Plateau' };

/** Étoile aux pointes irrégulières (toujours les mêmes), pour les cris. */
function wobBurst(n: number, inner: number, rot: number, wob: number) {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = ((rot + (i * 180) / n) * Math.PI) / 180, r = (i % 2 ? inner : 50) * (1 - (wob * ((i * 7) % 5)) / 5);
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)}% ${(50 + r * Math.sin(a)).toFixed(1)}%`);
  }
  return `polygon(${pts.join(',')})`;
}
const CRI_BURST = wobBurst(13, 39, 4, 0.1);
/** Petite étoile à quatre branches (décor de la bannière) */
const STAR = wobBurst(4, 17, 0, 0);

/** wide : le kiosque en double page (pliants, tablettes), les rayons à gauche et la cabine d'essayage à droite. */
export function shopScreen(o: { wide?: boolean } = {}): { el: HTMLElement; cleanup: () => void } {
  const coinsN = h('span');
  const coins = h('div', { class: 'tokens', role: 'img' }, h('i'), coinsN);
  const list = h('div', { class: 'scroll-y shop__list' });
  const save = () => { if (navigator.onLine) syncProfile().catch(() => undefined); };
  const marble = (skin: string, size: number) => billeSkin(bille(draftProfile().color, { size }), skin);
  const of = (kind: ShopKind) => SHOP.filter((x) => x.kind === kind);

  /** L'étiquette sous un objet : son prix, « Portée » si c'est celui que tu portes, « À toi » si tu l'as déjà. */
  const priceTag = (it: ShopItem) => (wears(it) ? h('span', { class: 'shop__tag shop__tag--on' }, it.kind === 'bille' ? 'Portée' : 'Porté')
    : owns(it.id) ? h('span', { class: 'shop__tag shop__tag--mine' }, 'À toi') : h('span', { class: 'shop__tag' }, fmt(it.price)));
  const label = (it: ShopItem) => `${KIND[it.kind]} ${it.name}, ${wears(it) ? 'ce que tu portes' : owns(it.id) ? 'à toi : toucher pour porter' : fmt(it.price) + ' pièces'}`;

  /** L'objet en grand, dans sa feuille : quatre billes sur le bois, le cri dans son étoile, l'effet qui se joue au toucher… */
  const preview = (it: ShopItem): HTMLElement => {
    if (it.kind === 'bille') return h('div', { class: 'shop__marbles' }, ...[0, 1, 2, 3].map(() => marble(it.id, 34)));
    if (it.kind === 'cri') return h('div', { class: 'shop__fxbox' }, criEl(it, 150));
    if (it.kind === 'titre') return h('div', { class: 'shop__fxbox' }, h('span', { class: 'shop__titre shop__titre--grand' }, it.id === 'aucun' ? 'Sans titre' : it.name));
    if (it.kind === 'plateau') return h('div', { class: 'shop__board shop__board--' + it.id, style: it.id === 'peint' ? { backgroundImage: `url(${import.meta.env.BASE_URL}plateaux/peint-mini.jpg)` } : {} });
    const layer = h('div', { class: 'shop__fx' });
    const box = h('button', { class: 'shop__fxbox', type: 'button', 'aria-label': `Voir l’effet ${it.name}` }, marble(lookOf(draftProfile().look).bille, 30), layer);
    const fire = () => boomFx((x) => playFx(layer, x), { boom: it.id }, 0, 0, COL[draftProfile().color].c);
    box.addEventListener('click', fire);
    setTimeout(fire, 350);
    return box;
  };
  const WHERE: Record<ShopKind, string> = {
    bille: 'Tes billes sur le plateau, vues par toute la table.', boom: 'Ce qui jaillit quand tu renvoies une bille. Touche pour revoir.',
    cri: 'Le mot qui claque quand tu fais BOUM.', titre: 'Sous ton nom, sur l’affiche et sur ta fiche de héros.', plateau: 'Ton plateau de jeu, sur ton écran (parties à 4).',
  };

  // ---------- Pliants : la cabine d'essayage, sur la page de droite (maquette « TOC sur pliants ») ----------
  // L'objet touché à gauche passe aussitôt en cabine : on le voit en grand, Toc donne son avis, et on l'achète ou on le
  // porte sans changer de page.
  let chosen: ShopItem | undefined;
  const cabin = h('div', { class: 'livre__corps cabine' });
  const cabinBtn = h('button', { class: 'livre__go', type: 'button' }) as HTMLButtonElement;
  const showCabin = (it: ShopItem) => {
    chosen = it;
    const miss = it.price - draftProfile().tokens, mine = owns(it.id), on = wears(it);
    cabin.replaceChildren(
      h('div', { class: 'cabine__scene' }, h('i', { class: 'rays' }), preview(it),
        h('span', { class: 'cabine__toc' }, mascot(on ? 'vainqueur' : 'surpris', 118)),
        h('span', { class: 'cabine__bulle' }, on ? 'Ça te va bien !' : 'Oh, la classe !')),
      h('div', { class: 'card cabine__fiche' },
        h('b', null, it.kind === 'bille' ? `Bille ${it.name}` : it.name),
        h('span', null, WHERE[it.kind]),
        h('div', { class: 'cabine__prix' },
          on ? h('span', { class: 'shop__tag shop__tag--on' }, it.kind === 'bille' ? 'Portée' : 'Porté') : mine ? h('span', { class: 'shop__tag shop__tag--mine' }, 'À toi') : h('span', { class: 'une2__prix' }, h('i'), fmt(it.price)),
          !mine && miss <= 0 ? h('em', null, `Il te restera ${fmt(-miss)} pièces.`) : null)),
      h('span', { class: 'cabine__aide' }, 'Touche un autre objet à gauche : la cabine le passe aussitôt, sans changer de page.'));
    cabinBtn.disabled = on || (!mine && miss > 0);
    cabinBtn.textContent = on ? (it.kind === 'bille' ? 'Portée' : 'Porté') : mine ? 'Porter' : miss > 0 ? `Il manque ${fmt(miss)}` : `Acheter · ${fmt(it.price)}`;
    cabinBtn.onclick = () => {
      if (!buy(it)) return toast('Pas assez de pièces.');
      save();
      toast(mine ? `${it.name} : c’est ce que tu portes.` : `${it.name} : à toi !`);
      showCabin(it);
    };
    draw();
  };

  /** La feuille d'un objet : on le voit en grand, puis on l'achète ou on le porte. */
  const openItem = (it: ShopItem) => {
    if (o.wide) return showCabin(it);
    const close = () => wrap.remove();
    const miss = it.price - draftProfile().tokens;
    const act = wears(it) ? button(it.kind === 'bille' ? '✓ Portée' : '✓ Porté', 'off', undefined, { size: 'md', block: true, disabled: true })
      : owns(it.id) ? button('Porter', 'primary', () => { buy(it); save(); close(); draw(); toast(`${it.name} : c’est ce que tu portes.`); }, { size: 'md', block: true })
        : miss > 0 ? button(`Il te manque ${fmt(miss)} pièces`, 'off', undefined, { size: 'md', block: true, disabled: true })
          : button(`Acheter · ${fmt(it.price)}`, 'yellow', () => {
            if (!buy(it)) return toast('Pas assez de pièces.');
            save();
            close();
            draw();
            toast(`${it.name} : à toi !`);
          }, { size: 'md', block: true });
    const wrap: HTMLElement = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === wrap) close(); } },
      h('div', { class: 'sheet shop__sheet', role: 'dialog', 'aria-label': `${KIND[it.kind]} ${it.name}` },
        h('span', { class: 'sheet__title' }, it.kind === 'bille' ? `Bille ${it.name}` : it.name),
        h('span', { class: 'sheet__text', style: { marginBottom: 0 } }, WHERE[it.kind]),
        preview(it),
        act,
        button('Fermer', 'text', close)));
    (document.getElementById('app') ?? document.body).append(wrap);
  };

  /** Un cri dans son étoile (112 de large sur la planche). */
  function criEl(it: ShopItem, w = 112): HTMLElement {
    const layer = (inset: string, bg: string, extra: Record<string, string> = {}) => h('i', { style: { inset, background: bg, clipPath: CRI_BURST, ...extra } });
    return h('span', { class: 'shop__cri', style: { width: w, height: Math.round(w * 0.75), fontSize: Math.round(w * 0.1875) } },
      layer('auto', 'var(--ink)', { left: '4px', top: '5px', width: '100%', height: '100%' }), layer('-4px', 'var(--ink)'), layer('0', '#fff'),
      h('b', { style: { color: CRI_INK[it.id] ?? 'var(--rouge)' } }, it.name));
  }

  // ---------- Les rayons ----------
  /** Une tuile de la grille : l'objet, son nom, son prix. */
  const tile = (it: ShopItem, visual: HTMLElement, cls = '') => h('button', { class: 'shop__tile' + (wears(it) ? ' shop__tile--on' : '') + (chosen === it ? ' shop__tile--choisi' : '') + cls, type: 'button', 'aria-label': label(it), 'aria-pressed': o.wide ? String(chosen === it) : undefined, onclick: () => openItem(it) },
    visual, h('span', { class: 'shop__name' }, it.name), priceTag(it));
  const head = (title: string, sub: string) => h('div', { class: 'shop__head' }, h('span', { class: 'shop__h' }, title), h('span', { class: 'shop__sub' }, sub));
  const sections: Partial<Record<Rayon, HTMLElement>> = {};

  /** La nouveauté en bannière : la plus belle bille que tu n'as pas encore. */
  const newest = () => of('bille').filter((x) => !owns(x.id)).sort((a, b) => b.price - a.price)[0];
  const banner = (it: ShopItem | undefined): HTMLElement | null => {
    if (!it) return null;
    const star = (left: number, top: number, size: number, bg: string) => h('i', { class: 'shop__star', style: { left, top, width: size, height: size, background: bg, clipPath: STAR } });
    return h('div', { class: 'shop__une' },
      h('i', { class: 'shop__une-rays' }),
      h('span', { class: 'shop__une-tag' }, 'Nouveau'),
      h('span', { class: 'shop__une-name' }, `Bille ${it.name}`),
      h('button', { class: 'shop__une-buy', type: 'button', 'aria-label': `Voir la bille ${it.name}, ${fmt(it.price)} pièces`, onclick: () => openItem(it) }, h('i'), h('b', null, fmt(it.price))),
      h('span', { class: 'shop__une-bille' }, marble(it.id, 110)),
      star(196, 26, 24, '#fff'), star(328, 96, 18, 'var(--jaune)'), star(206, 112, 13, '#fff'));
  };

  const draw = () => {
    const p = draftProfile();
    coinsN.textContent = fmt(p.tokens);
    coins.setAttribute('aria-label', `Tu as ${fmt(p.tokens)} pièces`);
    const top = list.scrollTop;
    // La nouveauté a sa bannière : elle ne revient pas dans la grille, qui tient en deux rangées.
    const feat = newest();
    const featured = banner(feat);
    const billes = of('bille').filter((x) => x !== feat);
    sections.bille = h('div', { class: 'shop__grid' }, ...billes.map((it) => tile(it, h('span', { class: 'shop__bille' }, marble(it.id, 52)))));
    sections.cri = h('div', { class: 'shop__rayon' },
      head('Les cris', WHERE.cri),
      // Ceux qu'il te reste à gagner d'abord ; ceux que tu as déjà suivent, en faisant glisser la rangée.
      h('div', { class: 'shop__cris' }, ...[...of('cri')].sort((a, b) => Number(owns(a.id)) - Number(owns(b.id))).map((it, k) => h('button', { class: 'shop__cribtn', type: 'button', 'aria-label': label(it), style: { rotate: `${[-4, 3, -2, 2][k % 4]}deg` }, onclick: () => openItem(it) },
        criEl(it), h('small', null, wears(it) ? 'Porté' : owns(it.id) ? 'À toi' : `${fmt(it.price)} pièces`)))),
      head('Les effets', 'Ce qui jaillit quand tu renvoies une bille.'),
      h('div', { class: 'shop__grid' }, ...of('boom').map((it) => tile(it, h('span', { class: 'shop__fxico shop__fxico--' + it.id }, marble(lookOf(p.look).bille, 30))))));
    sections.plateau = h('div', { class: 'shop__rayon' },
      head('Les plateaux', WHERE.plateau),
      h('div', { class: 'shop__grid shop__grid--2' }, ...of('plateau').map((it) => tile(it,
        h('span', { class: 'shop__board shop__board--' + it.id, style: it.id === 'peint' ? { backgroundImage: `url(${import.meta.env.BASE_URL}plateaux/peint-mini.jpg)` } : {} }), ' shop__tile--large'))));
    sections.titre = h('div', { class: 'shop__rayon' },
      head('Les titres', WHERE.titre),
      h('div', { class: 'shop__grid shop__grid--2' }, ...of('titre').map((it) => tile(it, h('span', { class: 'shop__titre' + (it.id === 'aucun' ? ' shop__titre--vide' : '') }, it.id === 'aucun' ? 'Sans titre' : it.name), ' shop__tile--titre'))));
    list.replaceChildren(...[featured, sections.bille, sections.cri, sections.plateau, sections.titre,
      h('p', { class: 'shop__foot' }, 'Une partie en ligne gagnée rapporte 100 pièces, une partie perdue 20.')].filter((x): x is HTMLElement => !!x));
    list.scrollTop = top;
  };

  // Les pastilles : chacune fait défiler jusqu'à son rayon, et s'allume quand on y est.
  let current: Rayon = 'bille';
  const pills = RAYONS.map(([id, name]) => h('button', {
    type: 'button', 'aria-pressed': String(id === current),
    onclick: () => {
      const el = id === 'bille' ? null : sections[id];
      list.scrollTo({ top: el ? el.offsetTop - list.offsetTop - 6 : 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    },
  }, name));
  const light = () => {
    const y = list.scrollTop + 60;
    let now: Rayon = 'bille';
    for (const [id] of RAYONS) { const el = sections[id]; if (el && id !== 'bille' && el.offsetTop - list.offsetTop <= y) now = id; }
    // Tout en bas, le dernier rayon est forcément celui qu'on regarde.
    if (list.scrollTop + list.clientHeight >= list.scrollHeight - 4 && list.scrollTop > 0) now = 'titre';
    if (now === current) return;
    current = now;
    pills.forEach((b, k) => b.setAttribute('aria-pressed', String(RAYONS[k][0] === current)));
  };
  list.addEventListener('scroll', light, { passive: true });
  draw();

  const top = h('div', { class: 'shop__top' }, h('h1', { class: 't-screen shop__title' }, 'Le kiosque'), coins);
  const rayons = h('div', { class: 'shop__pills', role: 'group', 'aria-label': 'Les rayons du kiosque' }, ...pills);
  if (o.wide) {
    const sp = spread({ tone: 'jaune', cls: 'kiosque2' });
    sp.left.append(inPage(h('div', { class: 'screen shop', 'data-tone': 'rose', style: { gap: 0 } }, top, rayons, list)), signets('shop'));
    sp.right.append(h('div', { class: 'cabine__tete' }, h('span', { class: 'tag' }, 'La cabine d’essayage')), cabin, cabinBtn);
    const first = newest() ?? of('bille')[0];
    if (first) showCabin(first);
    return { el: sp.el, cleanup: () => sp.dispose() };
  }
  const el = h('div', { class: 'screen screen--tabs shop', 'data-fit': 'tabs', 'data-tone': 'rose', style: { gap: 0, paddingTop: 'calc(var(--safe-top) + 2px)' } },
    top, rayons, list, tabbar('shop'));
  return { el, cleanup: () => {} };
}
