// Écrans d'arrivée : 01 Splash, 02 Onboarding, 03 Choix du perso.
import { NICK_MAX, draftProfile, getProfile, saveProfile } from '../../app/profile';
import { syncProfile } from '../../net/social';
import { googleThenGo } from './account';
import { DEMO } from '../demo';
import { h } from '../dom';
import { CHARS, COL, COLOR_NAMES, type CharId, type ColorName } from '../kit/data';
import { avatar, backButton, bille, button } from '../kit/kit';
import { ROUTES, go } from '../nav';

const blob = (style: Record<string, string | number>) => h('div', { class: 'blob', style });

/** Bille décorative avec un halo de sa couleur (et non le relief des billes du plateau). */
function floatBille(color: ColorName, size: number, left: number, top: number, dur: number, delay: number) {
  const t = COL[color];
  return h('div', { class: 'blob splash__float deco-anim', style: { left, top, animation: `tocFloat ${dur}s ease-in-out ${delay}s infinite` } },
    bille(color, { size, style: { boxShadow: `0 ${Math.round(size * 0.27)}px ${Math.round(size * 0.4)}px ${t.d}55` } }));
}

export function logo() {
  return h('div', { class: 'logo', role: 'img', 'aria-label': 'TOC' },
    h('div', { class: 'logo__tile logo__tile--t deco-anim' }, 'T'),
    h('div', { class: 'logo__tile logo__tile--o' },
      h('div', { class: 'deco-anim', style: { animation: 'tocBob 1.6s ease-in-out infinite' } },
        bille('yellow', { size: 58, style: { boxShadow: '0 6px 0 rgba(0,0,0,.15),inset 0 -4px 6px rgba(0,0,0,.08)' } }))),
    h('div', { class: 'logo__tile logo__tile--c deco-anim' }, 'C'));
}

export function splashScreen(): HTMLElement {
  return h('div', { class: 'screen splash' },
    blob({ left: -120, top: -90, width: 360, height: 360, background: 'var(--coral-l)' }),
    blob({ right: -150, top: 290, width: 330, height: 330, background: 'var(--blue-l)' }),
    blob({ left: -90, bottom: -130, width: 310, height: 310, background: 'var(--teal-l)' }),
    floatBille('yellow', 44, 44, 128, 3.2, 0),
    floatBille('coral', 30, 302, 160, 2.6, 0.6),
    floatBille('teal', 54, 300, 560, 3.6, 1.1),
    floatBille('blue', 36, 52, 604, 3, 0.3),
    h('div', { class: 'splash__hero' },
      h('span', { class: 'splash__kicker' }, 'Le jeu de'),
      logo(),
      h('span', { class: 'splash__tagline' }, 'Le jeu qui brise des amitiés… et qui en crée.')),
    h('div', { class: 'spacer' }),
    h('div', { class: 'splash__actions' },
      button('C’est parti !', 'primary', () => go(ROUTES.onboard), { size: 'lg', block: true }),
      // Compte Google : on retrouve son perso et sa progression ; sinon on le crée.
      button('J’ai déjà un compte', 'text', async () => {
        if (await googleThenGo()) go(getProfile() ? ROUTES.home : ROUTES.pick);
      })),
  );
}

const SLIDES = [
  { t: 'Tu ne joues jamais seul', x: 'Ton partenaire est assis en face de toi. Vous gagnez ensemble quand tous vos pions sont rentrés.', bg: 'var(--coral-l)' },
  { t: 'Des cartes, pas de dés', x: 'Chaque carte a son pouvoir : le 4 recule, le 7 se divise, le Valet échange. Pas de chance, juste de la stratégie.', bg: 'var(--yellow-l)' },
  { t: 'Rentre tes pions à la maison', x: 'Fais le tour du plateau et rentre tes 4 pions avant les autres. Attention : on peut te renvoyer dans ta réserve !', bg: 'var(--teal-l)' },
];

function ringed(char: CharId, color: ColorName, ring: string) {
  return h('div', { style: { padding: 10, borderRadius: '50%', background: '#fff', boxShadow: `0 0 0 5px ${ring},0 14px 24px rgba(70,40,20,.18)` } },
    avatar(char, color, 112));
}

function bigCard(rank: string, red: boolean, badge: string, bg: string, fg: string, style: Record<string, string | number>) {
  return h('div', { class: 'big-card', style },
    h('b', { style: { color: red ? 'var(--card-red)' : 'var(--ink)' } }, rank),
    h('span', { style: { background: bg, color: fg } }, badge));
}

function slideArt(i: number): HTMLElement {
  const p = draftProfile();
  if (i === 0)
    return h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 } },
      h('div', { style: { display: 'flex', alignItems: 'flex-end', gap: 6 } },
        ringed(p.char, p.color, 'var(--coral)'), h('div', { class: 'plus-dot' }, '+'), ringed('lunettes', 'yellow', 'var(--yellow)')),
      h('div', { class: 'team-pill' },
        h('span', { style: { width: 12, height: 12, borderRadius: '50%', background: 'var(--coral)' } }),
        h('span', { style: { width: 12, height: 12, borderRadius: '50%', background: 'var(--yellow)', marginLeft: -4 } }),
        'Équipe Soleil'));
  if (i === 1)
    return h('div', { style: { position: 'relative', width: 300, height: 220 } },
      bigCard('4', true, 'Recule 4', '#dfe7ff', '#2f5bd6', { left: 30, top: 40, transform: 'rotate(-14deg)' }),
      bigCard('V', false, 'Échange', '#ece6ff', '#6a4bd8', { left: 166, top: 40, transform: 'rotate(14deg)' }),
      bigCard('7', true, 'Divise', '#fff1c9', '#9a6b00', { left: 98, top: 14, animation: 'tocBob 2s ease-in-out infinite', boxShadow: '0 8px 0 var(--clay-2),0 22px 32px rgba(70,40,20,.2)' }));
  const glow = { boxShadow: '0 14px 16px rgba(29,156,126,.3)' };
  const inRow = { boxShadow: '0 5px 0 var(--teal-d)' };
  return h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 } },
    h('div', { class: 'deco-anim', style: { animation: 'tocFloat 1.4s ease-in-out infinite' } }, bille('teal', { size: 46, style: glow })),
    h('div', { class: 'home-row' },
      bille('teal', { size: 46, style: inRow }), bille('teal', { size: 46, style: inRow }), bille('teal', { size: 46, style: inRow }),
      h('div', { class: 'hole' })),
    h('span', { style: { font: '800 13px var(--text)', color: '#1d7f67', letterSpacing: '.14em', textTransform: 'uppercase' } }, 'La maison'));
}

export function onboardScreen(): HTMLElement {
  let slide = 0;
  const count = h('span', { class: 'onboard__count' });
  const panel = h('div', { class: 'onboard__panel' });
  const title = h('span', { class: 'onboard__title' });
  const body = h('span', { class: 'onboard__body' });
  const dots = h('div', { class: 'dots', 'aria-hidden': 'true' }, h('span'), h('span'), h('span'));
  const next = button('Suivant', 'primary', () => (slide < 2 ? show(slide + 1) : go(ROUTES.pick)));
  const show = (i: number) => {
    slide = i;
    const s = SLIDES[i];
    count.textContent = `${i + 1} / 3`;
    panel.style.background = s.bg;
    panel.replaceChildren(slideArt(i));
    title.textContent = s.t;
    body.textContent = s.x;
    [...dots.children].forEach((d, k) => (k === i ? d.setAttribute('aria-current', 'step') : d.removeAttribute('aria-current')));
    next.textContent = i === 2 ? 'Choisir mon perso' : 'Suivant';
  };
  show(0);
  return h('div', { class: 'screen onboard' },
    h('div', { class: 'onboard__top' }, count, button('Passer', 'text', () => go(ROUTES.pick))),
    panel,
    h('div', { class: 'onboard__text' }, title, body),
    h('div', { class: 'spacer', style: { minHeight: 24 } }),
    h('div', { class: 'onboard__foot' }, dots, next));
}

export function pickScreen(): HTMLElement {
  const p = draftProfile();
  let char = p.char;
  let color = p.color;
  const disc = h('div', { class: 'pick__disc' });
  const name = h('span', { class: 'pick__name' });
  const grid = h('div', { class: 'pick__grid' });
  const colors = h('div', { class: 'pick__colors', role: 'group', 'aria-label': 'Ta couleur' });
  const nick = h('input', {
    class: 'field field--big', value: p.nick || (DEMO ? 'Frédo' : ''), placeholder: 'Ex. Frédo', maxlength: NICK_MAX, 'aria-label': 'Ton surnom',
    autocomplete: 'nickname', enterkeyhint: 'done',
  });

  const draw = () => {
    const t = COL[color];
    disc.style.background = t.l;
    disc.replaceChildren(avatar(char, color, 140));
    name.textContent = CHARS.find((c) => c.id === char)!.name;
    grid.replaceChildren(...CHARS.map((c) => {
      const on = c.id === char;
      return h('button', {
        class: 'pick__char', type: 'button', 'aria-pressed': String(on),
        style: { boxShadow: on ? `0 0 0 3px ${t.c},0 6px 0 ${t.d}` : '0 5px 0 var(--clay)' },
        onclick: () => { char = c.id; draw(); },
      }, avatar(c.id, color, 56), c.name);
    }));
    colors.replaceChildren(...COLOR_NAMES.map((k) => {
      const on = k === color;
      return h('button', {
        class: 'pick__color', type: 'button', 'aria-pressed': String(on), 'aria-label': k,
        style: {
          background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,.8) 0 10%, rgba(255,255,255,0) 34%), ${COL[k].c}`,
          boxShadow: on ? `0 0 0 4px var(--app),0 0 0 7px ${COL[k].c}` : `0 4px 0 ${COL[k].d}`,
        },
        onclick: () => { color = k; draw(); },
      });
    }));
  };
  draw();

  const done = () => {
    saveProfile({ char, color, nick: nick.value });
    if (!DEMO && navigator.onLine) syncProfile().catch((e) => console.warn('profil', e));
    go(ROUTES.home);
  };
  return h('div', { class: 'screen pick' },
    h('div', { class: 'screen__head' },
      backButton(() => go(ROUTES.onboard)),
      h('div', { style: { display: 'flex', flexDirection: 'column' } },
        h('span', { class: 't-title' }, 'Choisis ton perso'),
        h('span', { class: 'pick__sub' }, 'Tu pourras le changer quand tu veux.'))),
    h('div', { class: 'pick__preview' }, disc, name),
    grid,
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } }, h('span', { class: 't-label' }, 'Ta couleur'), colors),
    h('label', { style: { display: 'flex', flexDirection: 'column', gap: 8 } }, h('span', { class: 't-label' }, 'Ton surnom'), nick),
    h('div', { class: 'spacer' }),
    button('C’est moi, ça !', 'primary', done, { block: true }));
}
