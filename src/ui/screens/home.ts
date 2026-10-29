// 04 Accueil : profil, choix 4/6 joueurs, partie privée, code de salle.
import { XP_PER_LEVEL, draftProfile, levelOf } from '../../app/profile';
import { watchFriends } from '../../net/social';
import { openAccountSheet } from './account';
import { DEMO, DEMO_FRIENDS, type Friend } from '../demo';
import { h, toast } from '../dom';
import { avatar, avatarRing, bille, button, segmented, tabbar } from '../kit/kit';
import { ROUTES, go } from '../nav';

const fmt = (n: number) => n.toLocaleString('fr-FR');
const MODE_KEY = 'toc.mode';

export function savedMode(): 4 | 6 {
  try {
    return localStorage.getItem(MODE_KEY) === '6' ? 6 : 4;
  } catch {
    return 4;
  }
}

/** Code saisi (« TOC-4821 », « toc 4821 », « 4821 ») ramené à ses 4 chiffres. */
export function parseRoomCode(raw: string): string | null {
  const m = /^\s*(?:toc[\s-]*)?(\d{4})\s*$/i.exec(raw);
  return m ? m[1] : null;
}

export function homeScreen(): { el: HTMLElement; cleanup: () => void } {
  const p = draftProfile();
  const { level, inLevel } = levelOf(p.xp);
  let mode = savedMode();

  // En-tête : avatar + niveau, salut + XP, jetons
  const head = h('div', { class: 'home-head' },
    h('button', {
      type: 'button', 'aria-label': 'Ton compte', onclick: () => openAccountSheet(),
      style: { position: 'relative', border: 'none', background: 'none', padding: 0, cursor: 'pointer' },
    },
      avatarRing(p.char, p.color, 46, 'var(--coral)'),
      h('span', { class: 'badge-count home-head__lvl', 'aria-label': `Niveau ${level}` }, level)),
    h('div', { class: 'home-head__who' },
      h('span', { class: 'home-head__hi' }, `Salut ${p.nick || 'toi'} !`),
      h('div', { class: 'home-head__xp' },
        h('div', { class: 'bar', style: { width: 64, flex: 'none' } }, h('div', { style: { width: `${Math.round((inLevel / XP_PER_LEVEL) * 100)}%` } })),
        `${fmt(inLevel)} / ${fmt(XP_PER_LEVEL)} XP`)),
    h('div', { class: 'tokens', 'aria-label': `${p.tokens} jetons` }, h('i'), h('span', null, fmt(p.tokens))));

  const createBtn = button('', 'on-blue', () => go('/salle/nouvelle?n=' + mode), { size: 'md' });
  const setMode = (m: 4 | 6) => {
    mode = m;
    createBtn.textContent = `Créer une salle · ${m} joueurs`;
    try { localStorage.setItem(MODE_KEY, String(m)); } catch { /* sans stockage, on garde en mémoire */ }
  };
  setMode(mode);

  // Amis en ligne (« Mimi, Coco et 2 autres en ligne »)
  const friendsLine = h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 34 } });
  const drawFriends = (all: Pick<Friend, 'name' | 'char' | 'color' | 'presence'>[]) => {
    const online = all.filter((f) => f.presence !== 'off');
    friendsLine.replaceChildren(...(online.length
      ? [h('div', { class: 'stack' }, ...online.slice(0, 3).map((f) => h('div', { class: 'avatar-ring' }, avatar(f.char, f.color, 30)))),
        h('span', { style: { font: '700 13px var(--text)' } },
          online.length > 2 ? `${online[0].name}, ${online[1].name} et ${online.length - 2} autres en ligne` : online.map((f) => f.name).join(' et ') + ' en ligne')]
      : [h('span', { style: { font: '700 13px var(--text)', opacity: 0.9 } }, 'Partage le code de ta salle à tes amis.')]));
  };
  drawFriends(DEMO ? DEMO_FRIENDS : []);
  const stopFriends = DEMO || !navigator.onLine ? () => {} : watchFriends(drawFriends);

  const privateCard = h('div', { class: 'hero hero--blue hero--tight' },
    h('div', { class: 'blob', style: { right: -26, top: -30 } }, bille('yellow', { size: 120, style: { boxShadow: '0 14px 20px rgba(0,0,0,.18)' } })),
    h('div', { class: 'blob deco-anim', style: { right: 76, top: 30, animation: 'tocBob 2.2s ease-in-out infinite' } },
      bille('coral', { size: 38, style: { boxShadow: '0 8px 12px rgba(0,0,0,.2)' } })),
    h('span', { class: 'tag', style: { position: 'relative' } }, 'ENTRE AMIS'),
    h('div', { style: { position: 'relative', display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 250 } },
      h('span', { class: 'hero__title' }, 'Partie privée'),
      h('span', { style: { font: '600 15px/1.4 var(--text)', textWrap: 'pretty' } }, 'Crée ta salle, invite tes amis et formez les équipes.')),
    friendsLine,
    createBtn);

  const code = h('input', {
    class: 'field', placeholder: 'Code de salle (ex. TOC-4821)', 'aria-label': 'Code de salle',
    inputmode: 'text', autocapitalize: 'characters', enterkeyhint: 'go', style: { flex: 1 },
  });
  const join = () => {
    const c = parseRoomCode(code.value);
    if (!c) return toast('Le code ressemble à TOC-4821');
    go('/salle/' + c);
  };
  code.addEventListener('keydown', (e) => e.key === 'Enter' && join());

  const el = h('div', { class: 'screen screen--tabs home', 'data-fit': 'tabs', style: { gap: 14, paddingTop: 'calc(var(--safe-top) + 10px)' } },
    head,
    h('span', { class: 't-screen' }, 'On joue ?'),
    segmented<4 | 6>([{ value: 4, label: '4 joueurs', sub: '2 équipes de 2' }, { value: 6, label: '6 joueurs', sub: '3 équipes de 2' }], mode, setMode),
    privateCard,
    h('div', { style: { display: 'flex', gap: 10 } }, code, button('Rejoindre', 'dark', join, { size: 'md' })),
    tabbar('home', (t) => go(t === 'home' ? ROUTES.home : t === 'friends' ? ROUTES.friends : ROUTES.ranking)));
  return { el, cleanup: () => stopFriends() };
}
