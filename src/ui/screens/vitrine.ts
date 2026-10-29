// Vitrine du design system (#/vitrine) : tous les composants de base sur une page.
import { h, toast } from '../dom';
import { CHARS, COL, COLOR_NAMES, type ColorName } from '../kit/data';
import {
  avatar, avatarRing, backButton, bille, button, cardBack, duo, pauseButton, playingCard, segmented, tabbar,
} from '../kit/kit';

const section = (title: string, ...kids: (HTMLElement | false)[]) =>
  h('section', { style: { display: 'flex', flexDirection: 'column', gap: 12 } }, h('span', { class: 't-label' }, title), ...kids);

const row = (...kids: HTMLElement[]) =>
  h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 } }, ...kids);

const CHAR_COLORS: ColorName[] = ['coral', 'yellow', 'blue', 'teal', 'violet', 'rose'];

export function vitrineScreen(): HTMLElement {
  let sel = 2;
  const hand = ['AS0', 'KH0', 'QD0', 'JC0', '10D0', '7D0', '4H0', '8C0', '2H0', 'XJ0'];
  const handRow = row();
  const drawHand = () =>
    handRow.replaceChildren(...hand.map((c, i) => playingCard(c, { selected: i === sel, onclick: () => { sel = i; drawHand(); } })));
  drawHand();

  return h('div', { class: 'screen screen--tabs', 'data-fit': 'scroll' },
    h('div', { class: 'blob', style: { left: -120, top: -90, width: 360, height: 360, background: 'var(--coral-l)' } }),
    h('header', { class: 'screen__head', style: { position: 'relative' } },
      h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4 } },
        h('span', { class: 't-mini' }, 'Étape 1 · design system'),
        h('span', { class: 't-screen' }, 'Vitrine TOC')),
      h('span', { class: 'pill' }, 'Baloo 2 + Nunito')),

    section('Couleurs des joueurs',
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 } },
        COLOR_NAMES.map((c) =>
          h('div', { class: 'card card--row', style: { padding: 10, display: 'flex', alignItems: 'center', gap: 10 } },
            bille(c, { size: 26 }),
            h('div', { style: { display: 'flex', gap: 4 } },
              ...(['c', 'd', 'l'] as const).map((k) => h('span', { style: { width: 14, height: 28, borderRadius: 5, background: COL[c][k] } }))))))),

    section('Typographie',
      h('div', { class: 'card', style: { padding: 18, display: 'flex', flexDirection: 'column', gap: 8 } },
        h('span', { class: 't-screen' }, 'On joue ?'),
        h('span', { class: 't-card' }, 'Partie privée'),
        h('span', { style: { font: "600 22px/1.3 var(--display)" } }, 'Le jeu qui brise des amitiés… et qui en crée.'),
        h('span', { class: 't-body' }, 'Crée ta salle, invite tes amis et formez les équipes.'),
        h('span', { class: 't-label' }, 'Ton surnom'))),

    section('Boutons',
      button('C’est parti !', 'primary', () => toast('C’est parti !'), { size: 'lg', block: true }),
      row(button('Suivant', 'primary'), button('Rejoindre', 'dark', undefined, { size: 'md' })),
      button('Recommencer la donne', 'white', undefined, { size: 'md', block: true }),
      button('Quitter la partie', 'danger', undefined, { size: 'md', block: true }),
      row(button('Partager', 'yellow', undefined, { size: 'xs' }), button('Copier', 'dark', undefined, { size: 'sm' }),
        button('Copié !', 'ok', undefined, { size: 'sm' }), button('Inviter', 'primary', undefined, { size: 'xs' })),
      button('En attente…', 'off', undefined, { size: 'lg', block: true, disabled: true }),
      row(backButton(() => toast('Retour')), pauseButton(() => toast('Pause')), button('J’ai déjà un compte', 'text'))),

    section('Champs et sélecteurs',
      segmented([{ value: 4, label: '4 joueurs', sub: '2 équipes de 2' }, { value: 6, label: '6 joueurs', sub: '3 équipes de 2' }], 4, () => undefined),
      segmented([{ value: 'amis', label: 'Amis' }, { value: 'chat', label: 'Chat d’équipe' }], 'amis', () => undefined),
      h('div', { style: { display: 'flex', gap: 10 } },
        h('input', { class: 'field', placeholder: 'Code de salle (ex. TOC-4821)', style: { flex: 1 } }),
        button('Rejoindre', 'dark', undefined, { size: 'md' })),
      h('input', { class: 'field field--big', value: 'Frédo', maxlength: 14 })),

    section('Surfaces',
      h('div', { class: 'hero hero--blue' },
        h('div', { class: 'blob', style: { right: -26, top: -30, width: 120, height: 120 } }, bille('yellow', { size: 120, style: { boxShadow: '0 14px 20px rgba(0,0,0,.18)' } })),
        h('div', { class: 'blob deco-anim', style: { right: 76, top: 30, animation: 'tocBob 2.2s ease-in-out infinite' } }, bille('coral', { size: 38, style: { boxShadow: '0 8px 12px rgba(0,0,0,.2)' } })),
        h('span', { class: 'tag' }, 'ENTRE AMIS'),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 250 } },
          h('span', { class: 'hero__title' }, 'Partie privée'),
          h('span', { style: { font: '600 15px/1.4 var(--text)' } }, 'Crée ta salle, invite tes amis et formez les équipes.')),
        button('Créer une salle · 4 joueurs', 'on-blue', undefined, { size: 'md' })),
      h('div', { class: 'card', style: { padding: '14px 14px 14px 18px', display: 'flex', alignItems: 'center', gap: 12 } },
        h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 } },
          h('span', { class: 't-mini' }, 'Code de la salle'),
          h('span', { style: { font: '800 28px/1.05 var(--display)', letterSpacing: '.06em' } }, 'TOC-4821')),
        button('Copier', 'dark', undefined, { size: 'sm' })),
      row(h('span', { class: 'pill' }, '4 joueurs · 2 équipes'), h('span', { class: 'pill' }, duo('coral', 'yellow', 12), 'Équipe Soleil'),
        h('span', { class: 'tag tag--dark' }, 'NOUVEAU'), h('span', { class: 'badge-count' }, '14'))),

    section('Personnages',
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 } },
        CHARS.map((c, k) =>
          h('div', { class: 'card', style: { height: 92, borderRadius: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 } },
            avatar(c.id, CHAR_COLORS[k], 56),
            h('span', { style: { font: '800 12px var(--text)' } }, c.name)))),
      row(...CHARS.slice(0, 4).map((c, k) => avatarRing(c.id, CHAR_COLORS[k], 46, COL[CHAR_COLORS[k]].c)))),

    section('Billes',
      row(...COLOR_NAMES.map((c) => bille(c, { size: 30 })), bille('coral', { size: 30, sel: true }), bille('blue', { size: 30, target: true }))),

    section('Cartes',
      row(cardBack(), h('span', { class: 't-body' }, 'Touche une carte pour la sélectionner.')),
      handRow),

    tabbar('home', (t) => toast(t === 'home' ? 'Jouer' : t === 'friends' ? 'Amis' : 'Classement')),
  );
}
