// 04 Accueil : profil, choix 4/6 joueurs, partie privée, code de salle, tournoi.
import { XP_PER_LEVEL, draftProfile, levelOf } from '../../app/profile';
import { cupKey, setCup, watchCup, watchFriends } from '../../net/social';
import { DEMO, DEMO_FRIENDS, type Friend } from '../demo';
import { h, toast } from '../dom';
import { avatar, avatarRing, bille, button, segmented, tabbar } from '../kit/kit';
import { ROUTES, go } from '../nav';

const fmt = (n: number) => n.toLocaleString('fr-CA');
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

/** Prochain vendredi 20 h (heure locale) : la Coupe du Vendredi. */
function nextCup(now: Date): Date {
  const d = new Date(now);
  d.setHours(20, 0, 0, 0);
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7));
  if (d <= now) d.setDate(d.getDate() + 7);
  return d;
}

function clockParts(ms: number): [string, string][] {
  const p2 = (v: number) => String(v).padStart(2, '0');
  const s = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(s / 86400);
  if (days > 0) return [[p2(days), 'j'], [p2(Math.floor(s / 3600) % 24), 'h'], [p2(Math.floor(s / 60) % 60), 'min']];
  return [[p2(Math.floor(s / 3600)), 'h'], [p2(Math.floor(s / 60) % 60), 'min'], [p2(s % 60), 's']];
}

export function homeScreen(): { el: HTMLElement; cleanup: () => void } {
  const p = draftProfile();
  const { level, inLevel } = levelOf(p.xp);
  let mode = savedMode();
  let registered = DEMO;
  const capacity = 64;
  const baseCount = DEMO ? 41 : 0;

  // En-tête : avatar + niveau, salut + XP, jetons
  const head = h('div', { class: 'home-head' },
    h('div', { style: { position: 'relative' } },
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

  // Amis en ligne (« Mimi, Coco pis 2 autres en ligne »)
  const friendsLine = h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 34 } });
  const drawFriends = (all: Pick<Friend, 'name' | 'char' | 'color' | 'presence'>[]) => {
    const online = all.filter((f) => f.presence !== 'off');
    friendsLine.replaceChildren(...(online.length
      ? [h('div', { class: 'stack' }, ...online.slice(0, 3).map((f) => h('div', { class: 'avatar-ring' }, avatar(f.char, f.color, 30)))),
        h('span', { style: { font: '700 13px var(--text)' } },
          online.length > 2 ? `${online[0].name}, ${online[1].name} pis ${online.length - 2} autres en ligne` : online.map((f) => f.name).join(' pis ') + ' en ligne')]
      : [h('span', { style: { font: '700 13px var(--text)', opacity: 0.9 } }, 'Partage le code de ta salle à ta gang.')]));
  };
  drawFriends(DEMO ? DEMO_FRIENDS : []);
  const stopFriends = DEMO || !navigator.onLine ? () => {} : watchFriends(drawFriends);

  const privateCard = h('div', { class: 'hero hero--blue' },
    h('div', { class: 'blob', style: { right: -26, top: -30 } }, bille('yellow', { size: 120, style: { boxShadow: '0 14px 20px rgba(0,0,0,.18)' } })),
    h('div', { class: 'blob deco-anim', style: { right: 76, top: 30, animation: 'tocBob 2.2s ease-in-out infinite' } },
      bille('coral', { size: 38, style: { boxShadow: '0 8px 12px rgba(0,0,0,.2)' } })),
    h('span', { class: 'tag', style: { position: 'relative' } }, 'ENTRE AMIS'),
    h('div', { style: { position: 'relative', display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 250 } },
      h('span', { class: 'hero__title' }, 'Partie privée'),
      h('span', { style: { font: '600 15px/1.4 var(--text)', textWrap: 'pretty' } }, 'Crée ta salle, invite ta gang pis placez-vous en équipes.')),
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

  // Tournoi
  const clock = h('div', { class: 'countdown' });
  const regText = h('span');
  const regFill = h('div');
  let count = baseCount + (registered ? 1 : 0);
  const cupId = cupKey(nextCup(new Date()));
  const regBtn = button('', 'dark', () => {
    if (DEMO) { registered = !registered; count += registered ? 1 : -1; return drawReg(); }
    if (!registered && count >= capacity) return toast('Le tournoi est complet !');
    setCup(cupId, !registered).catch(() => toast('Inscription impossible pour l’instant.'));
  }, { size: 'md' });
  const drawReg = () => {
    const n = count;
    regText.textContent = `${n} / ${capacity} inscrits`;
    regFill.style.width = `${Math.round((n / capacity) * 100)}%`;
    regBtn.textContent = registered ? 'T’es inscrit !' : 'M’inscrire';
    regBtn.style.background = registered ? 'var(--teal-d)' : '';
    regBtn.style.boxShadow = registered ? '0 5px 0 var(--ok-ink)' : '';
  };
  const tick = () => {
    const now = new Date();
    clock.replaceChildren(...clockParts(nextCup(now).getTime() - now.getTime()).map(([v, u]) => h('div', null, h('b', null, v), h('span', null, u))));
  };
  drawReg();
  tick();
  const timer = setInterval(tick, 1000);

  const cup = h('div', { class: 'hero hero--yellow' },
    h('div', { class: 'blob', style: { right: -40, bottom: -50, width: 150, height: 150, background: 'rgba(255,255,255,.25)' } }),
    h('div', { style: { position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      h('span', { class: 'tag tag--dark' }, 'TOURNOI · 4 JOUEURS'),
      h('span', { style: { font: '800 13px var(--text)' } }, 'Gros lot : 5 000')),
    h('span', { style: { position: 'relative', font: '800 28px/1 var(--display)' } }, 'La Coupe du Vendredi'),
    h('div', { style: { position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 } },
      h('span', { style: { font: '800 12px var(--text)', letterSpacing: '.08em', textTransform: 'uppercase', color: '#5a4300' } }, 'Commence dans'),
      clock),
    h('div', { style: { position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', font: '800 13px var(--text)' } }, regText, h('span', null, `${capacity / 2} équipes`)),
      h('div', { class: 'reg-bar' }, regFill)),
    regBtn);

  const el = h('div', { class: 'screen screen--tabs', style: { gap: 18, paddingTop: 'calc(var(--safe-top) + 12px)' } },
    head,
    h('span', { class: 't-screen', style: { marginTop: 6 } }, 'On joue ?'),
    segmented<4 | 6>([{ value: 4, label: '4 joueurs', sub: '2 équipes de 2' }, { value: 6, label: '6 joueurs', sub: '3 équipes de 2' }], mode, setMode),
    privateCard,
    h('div', { style: { display: 'flex', gap: 10 } }, code, button('Rejoindre', 'dark', join, { size: 'md' })),
    cup,
    tabbar('home', (t) => go(t === 'home' ? ROUTES.home : t === 'friends' ? ROUTES.friends : ROUTES.ranking)));
  const stopCup = DEMO || !navigator.onLine ? () => {} : watchCup(cupId, (n, mine) => { count = n; registered = mine; drawReg(); });
  return { el, cleanup: () => { clearInterval(timer); stopFriends(); stopCup(); } };
}
