// Écrans d'arrivée : la couverture (splash), la présentation en trois cases, le choix du héros.
import { NICK_MAX, draftProfile, getProfile, saveProfile } from '../../app/profile';
import { syncProfile } from '../../net/social';
import { googleThenGo } from './account';
import { DEMO } from '../demo';
import { h } from '../dom';
import { CHARS, COL, COLOR_NAMES, type CharId, type ColorName } from '../kit/data';
import { avatar, backButton, bille, button, playingCard } from '../kit/kit';
import type { Humeur } from '../kit/perso';
import { ROUTES, go, takeLink } from '../nav';
import { mascot } from '../mascot';
import { burstEl } from '../planche';
import { openBoardJoin } from '../table-invite';

/** Le titre du jeu, lettré comme une couverture de BD. */
export function logo() {
  return h('div', { class: 'logo', role: 'img', 'aria-label': 'TOC' }, ...burstEl('var(--rouge)', 14, 37, 5), h('span', { 'aria-hidden': 'true' }, 'TOC !'));
}

/** Un perso posé dans le décor (il flotte doucement). */
function extra(char: CharId, color: ColorName, humeur: Humeur, size: number, style: Record<string, string | number>, flip = false) {
  return h('div', { class: 'splash__extra deco-anim', style }, avatar(char, color, size, humeur, { flip }));
}

export function splashScreen(): HTMLElement {
  return h('div', { class: 'screen splash', 'data-wide': '', 'data-tone': 'jaune' },
    h('i', { class: 'rays' }),
    h('div', { class: 'splash__hero' },
      h('span', { class: 'tag splash__kicker' }, 'Le jeu de'),
      logo(),
      h('span', { class: 'splash__tagline' }, 'Le jeu qui brise des amitiés… et qui en crée.'),
      // Toc au milieu de la bande : les quatre joueurs d'une table.
      h('div', { class: 'splash__cast' },
        extra('couronne', 'blue', 'furieux', 74, { left: -4, top: 6, animationDelay: '-.4s' }),
        extra('tuque', 'coral', 'malin', 88, { left: 20, top: 92, animationDelay: '-1.3s' }),
        extra('lunettes', 'yellow', 'joie', 78, { right: 0, top: 0, animationDelay: '-.9s' }, true),
        extra('casquette', 'teal', 'panique', 84, { right: 22, top: 96, animationDelay: '-1.9s' }, true),
        h('div', { class: 'splash__toc deco-anim' }, mascot('content', 176)))),
    h('div', { class: 'spacer' }),
    h('div', { class: 'splash__actions' },
      button('C’est parti !', 'primary', () => go(ROUTES.onboard), { size: 'lg', block: true }),
      // Compte Google : on retrouve son perso et sa progression ; sinon on le crée.
      button('J’ai déjà un compte', 'text', async () => {
        if (await googleThenGo()) go(getProfile() ? ROUTES.home : ROUTES.pick);
      }),
      // Une tablette posée au milieu de la table : elle devient le plateau d'une salle, sans compte.
      button('Utiliser comme plateau de jeu', 'text', openBoardJoin)),
  );
}

const SLIDES = [
  { t: 'Tu ne joues jamais seul', x: 'Ton partenaire est assis en face de toi. Vous gagnez ensemble quand toutes vos billes sont rentrées.', bg: 'var(--bleu)' },
  { t: 'Des cartes, pas de dés', x: 'Chaque carte a son pouvoir : le 4 recule, le 7 se partage, le Valet échange. Pas de chance, juste de la stratégie.', bg: 'var(--turq)' },
  { t: 'Rentre tes billes à la maison', x: 'Fais le tour du plateau et rentre tes 4 billes avant les autres. Attention : on peut te renvoyer à la réserve !', bg: '#ff8fc4' },
];

function slideArt(i: number): HTMLElement {
  const p = draftProfile();
  if (i === 0)
    return h('div', { class: 'onboard__duo' },
      avatar(p.char, p.color, 132, 'malin'),
      h('div', { class: 'onboard__plus' }, ...burstEl('#fff', 10, 34, 9), h('b', null, '+')),
      avatar('lunettes', p.color === 'yellow' ? 'teal' : 'yellow', 112, 'joie', { flip: true }),
      h('span', { class: 'tag onboard__team' }, 'Équipe Soleil'));
  if (i === 1)
    return h('div', { class: 'onboard__cards' },
      h('div', { style: { rotate: '-14deg', translate: '18px 16px' } }, playingCard('4H0')),
      h('div', { class: 'deco-anim', style: { animation: 'tocBob 2s ease-in-out infinite', zIndex: 1, scale: '1.14' } }, playingCard('7D0')),
      h('div', { style: { rotate: '14deg', translate: '-18px 16px' } }, playingCard('JS0')));
  const t = COL.teal;
  const b = (style: Record<string, string | number> = {}) => h('div', { class: 'bille', style: { '--c': '#ffcf1f', '--d': '#e3a700', '--s': '40', ...style } });
  return h('div', { class: 'onboard__home', style: { '--c': t.c } },
    h('div', { class: 'deco-anim', style: { animation: 'tocFloat 1.4s ease-in-out infinite' } }, b()),
    h('div', { class: 'onboard__lane' }, b(), b(), b(), h('i')),
    h('span', { class: 'tag' }, 'La maison'));
}

export function onboardScreen(): HTMLElement {
  let slide = 0;
  const count = h('span', { class: 'pill onboard__count' });
  const panel = h('div', { class: 'onboard__panel' });
  const title = h('span', { class: 't-screen onboard__title' });
  const body = h('span', { class: 'onboard__body' });
  const dots = h('div', { class: 'dots', 'aria-hidden': 'true' }, h('span'), h('span'), h('span'));
  const next = button('Suivant', 'primary', () => (slide < 2 ? show(slide + 1) : go(ROUTES.pick)));
  const show = (i: number) => {
    slide = i;
    const s = SLIDES[i];
    count.textContent = `${i + 1} / 3`;
    panel.style.setProperty('--pc', s.bg);
    panel.replaceChildren(h('i', { class: 'rays' }), slideArt(i));
    title.textContent = s.t;
    body.textContent = s.x;
    [...dots.children].forEach((d, k) => (k === i ? d.setAttribute('aria-current', 'step') : d.removeAttribute('aria-current')));
    next.textContent = i === 2 ? 'Choisir mon perso' : 'Suivant';
  };
  show(0);
  return h('div', { class: 'screen onboard', 'data-wide': '', 'data-tone': 'jaune' },
    h('div', { class: 'onboard__top' }, count, button('Passer', 'text', () => go(ROUTES.pick))),
    panel,
    h('div', { class: 'onboard__text' }, title, body),
    h('div', { class: 'spacer', style: { minHeight: 16 } }),
    h('div', { class: 'onboard__foot' }, dots, next));
}

export function pickScreen(): HTMLElement {
  const p = draftProfile();
  let char = p.char;
  let color = p.color;
  const disc = h('div', { class: 'pick__disc' });
  const name = h('span', { class: 'tag pick__name' });
  const grid = h('div', { class: 'pick__grid' });
  const colors = h('div', { class: 'pick__colors', role: 'group', 'aria-label': 'Ta couleur' });
  const nick = h('input', {
    class: 'field field--big', value: p.nick || (DEMO ? 'Frédo' : ''), placeholder: 'Ex. Frédo', maxlength: NICK_MAX, 'aria-label': 'Ton surnom',
    autocomplete: 'nickname', enterkeyhint: 'done',
  });
  const COLOR_LABEL: Record<ColorName, string> = { coral: 'Rouge', blue: 'Bleu', yellow: 'Jaune', teal: 'Turquoise', violet: 'Violet', rose: 'Rose' };

  const draw = () => {
    // Le héros choisi, en grand devant son étoile (blanche quand il est lui-même jaune).
    disc.replaceChildren(...burstEl(color === 'yellow' ? '#fff' : 'var(--jaune)', 15, 38, 6), avatar(char, color, 132, 'joie'));
    name.textContent = CHARS.find((c) => c.id === char)!.name;
    grid.replaceChildren(...CHARS.map((c) => {
      const on = c.id === char;
      return h('button', {
        class: 'pick__char', type: 'button', 'aria-pressed': String(on),
        onclick: () => { char = c.id; draw(); },
      }, avatar(c.id, color, 52, on ? 'joie' : 'content'), c.name);
    }));
    colors.replaceChildren(...COLOR_NAMES.map((k) => {
      const on = k === color;
      return h('button', {
        class: 'pick__color', type: 'button', 'aria-pressed': String(on), 'aria-label': COLOR_LABEL[k] ?? k,
        onclick: () => { color = k; draw(); },
      }, bille(k, { size: 34 }));
    }));
  };
  draw();

  const done = () => {
    saveProfile({ char, color, nick: nick.value });
    if (!DEMO && navigator.onLine) syncProfile().catch((e) => console.warn('profil', e));
    go(takeLink() ?? ROUTES.home);
  };
  return h('div', { class: 'screen pick', 'data-wide': '', 'data-tone': 'bleu' },
    h('div', { class: 'screen__head' },
      backButton(() => go(ROUTES.onboard)),
      h('div', { style: { display: 'flex', flexDirection: 'column', minWidth: 0 } },
        h('span', { class: 't-title' }, 'Choisis ton héros'),
        h('span', { class: 'pick__sub' }, 'Tu pourras en changer quand tu veux.'))),
    h('div', { class: 'pick__preview' }, disc, name),
    grid,
    h('div', { class: 'card pick__colorbox' }, h('span', { class: 't-label' }, 'Ta couleur'), colors),
    h('label', { class: 'pick__nick' }, h('span', { class: 't-label' }, 'Ton surnom'), nick),
    h('div', { class: 'spacer' }),
    button('C’est moi, ça !', 'primary', done, { block: true }));
}
