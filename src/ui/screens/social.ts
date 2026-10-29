// 07 Amis (liste, chat d'équipe) et 08 Classement.
import { draftProfile } from '../../app/profile';
import {
  type FriendView, type RankEntry, addFriend, currentUid, friendIds, sendChat, setTyping, topPlayers,
  watchChat, watchFriends,
} from '../../net/social';
import {
  DEMO, DEMO_CHAT, DEMO_FRIENDS, DEMO_ME_RANK, DEMO_RANKS, PARTNER_REPLIES, type RankRow, type RankScope,
} from '../demo';
import { h, toast } from '../dom';
import { COL } from '../kit/data';
import { avatar, avatarRing, button, segmented, tabbar, type Tab } from '../kit/kit';
import { ROUTES, go } from '../nav';
import { savedMode } from './home';

type View = { el: HTMLElement; cleanup: () => void };
const fmt = (n: number) => n.toLocaleString('fr-FR');
const goTab = (t: Tab) => go(t === 'home' ? ROUTES.home : t === 'friends' ? ROUTES.friends : ROUTES.ranking);

function friendRow(f: Omit<FriendView, 'uid'> & { uid?: string }, invited: Set<string>): HTMLElement {
  const off = f.presence === 'off';
  const pic = h('div', { style: { position: 'relative', flex: 'none' } }, avatar(f.char, f.color, 46),
    !off && h('span', { class: 'friend__dot', style: { background: f.presence === 'on' ? 'var(--teal)' : 'var(--yellow)' } }));
  let action: HTMLElement | false = false;
  if (f.presence === 'game') action = h('span', { class: 'in-game' }, 'En partie');
  if (f.presence === 'on') {
    const key = f.uid ?? f.name;
    const b = button('', 'primary', () => {
      // Pour de vrai : on ouvre une salle et l'ami reçoit l'invitation.
      if (f.uid && !DEMO) return go(`/salle/nouvelle?n=${savedMode()}&invite=${f.uid}`);
      if (invited.has(key)) invited.delete(key);
      else invited.add(key);
      draw();
    }, { size: 'xs' });
    const draw = () => {
      const on = invited.has(key);
      b.textContent = on ? 'Invité·e' : 'Inviter';
      b.className = 'btn btn--xs ' + (on ? 'btn--ok' : 'btn--primary');
      b.style.boxShadow = on ? '' : '0 4px 0 var(--primary-edge)';
    };
    draw();
    action = b;
  }
  return h('div', { class: 'friend ' + (off ? 'card--flat friend--off' : 'card card--row'), style: { borderRadius: 22 } },
    pic,
    h('div', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 } },
      h('span', { class: 'friend__name' }, f.name), h('span', { class: 'friend__status' }, f.status)),
    action);
}

function friendsPane(): View {
  const p = draftProfile();
  const invited = new Set<string>();
  const code = DEMO ? 'FREDO#2741' : p.friendCode ?? '—';
  const share = async () => {
    const text = `Ajoute-moi sur TOC : ${code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'TOC', text });
      else { await navigator.clipboard.writeText(code); toast('Code ami copié !'); }
    } catch { /* partage annulé */ }
  };
  const list = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } });
  const draw = (friends: Omit<FriendView, 'uid'>[]) => {
    const on = friends.filter((f) => f.presence !== 'off');
    const off = friends.filter((f) => f.presence === 'off');
    list.replaceChildren(...(friends.length
      ? [
        h('span', { class: 't-label', style: { marginTop: 8 } }, `En ligne · ${on.length}`),
        ...on.map((f) => friendRow(f, invited)),
        ...(off.length ? [h('span', { class: 't-label', style: { marginTop: 8 } }, 'Hors ligne'), ...off.map((f) => friendRow(f, invited))] : []),
      ]
      : [h('p', { class: 'empty' }, 'Pas encore d’amis. Partage ton code ami, ou ajoute celui d’un ami.')]));
  };
  const field = h('input', { class: 'field', placeholder: 'Code ami (ex. MIMI#4821)', 'aria-label': 'Code ami à ajouter', autocapitalize: 'characters', style: { flex: 1 } });
  const add = async () => {
    try {
      const name = await addFriend(field.value);
      field.value = '';
      toast(`${name} fait partie de tes amis !`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ajout impossible.', 2400);
    }
  };
  field.addEventListener('keydown', (e) => e.key === 'Enter' && add());
  let stop = () => {};
  if (DEMO) draw(DEMO_FRIENDS);
  else {
    draw([]);
    stop = watchFriends(draw);
  }
  const el = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
    h('div', { class: 'friend-code' },
      h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 } },
        h('span', { class: 'friend-code__label' }, 'Ton code ami'), h('span', { class: 'friend-code__value' }, code)),
      button('Partager', 'yellow', share, { size: 'xs' })),
    !DEMO && h('div', { style: { display: 'flex', gap: 8 } }, field, button('Ajouter', 'dark', add, { size: 'md' })),
    list);
  return { el, cleanup: stop };
}

function chatPane(): { head: HTMLElement; body: HTMLElement; foot: HTMLElement | null; cleanup: () => void } {
  const partner = DEMO ? { uid: '', name: 'Mimi', char: 'lunettes' as const, color: 'yellow' as const } : draftProfile().partner;
  const list = h('div', { class: 'chat' });
  const scroller = h('div', { style: { flex: 1, overflowY: 'auto', padding: '16px 0 12px' } }, list);
  const head = h('div', { class: 'card card--row', style: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 20 } },
    partner ? avatar(partner.char, partner.color, 38) : avatar(draftProfile().char, draftProfile().color, 38),
    h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column' } },
      h('span', { style: { font: '800 16px/1.1 var(--display)' } }, partner ? 'Équipe Soleil' : 'Chat d’équipe'),
      h('span', { style: { font: '700 12px var(--text)', color: '#1d7f67' } }, partner ? `Toi + ${partner.name}` : 'Pas encore de partenaire')),
    h('div', { class: 'duo' }, h('span', { style: { background: COL.coral.c } }), h('span', { style: { background: COL.yellow.c, marginLeft: -5 } })));
  if (!partner) {
    list.replaceChildren(h('p', { class: 'empty' }, 'Joue une partie en ligne : ton chat avec ton partenaire s’ouvrira ici.'));
    return { head, body: scroller, foot: null, cleanup: () => {} };
  }
  let lines: { me: boolean; t: string }[] = DEMO ? DEMO_CHAT.slice() : [];
  let typing = false;
  const draw = () => {
    list.replaceChildren(
      h('span', { style: { alignSelf: 'center', font: '800 11px var(--text)', color: 'var(--ink-3)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 } }, 'Aujourd’hui'),
      ...(lines.length ? lines.map((m, i) => h('div', { class: 'bubble ' + (m.me ? 'bubble--me' : 'bubble--them') + (i < lines.length - 1 ? ' bubble--old' : '') }, m.t))
        : [h('p', { class: 'empty' }, `Dis bonjour à ${partner.name} !`)]),
      ...(typing ? [h('div', { class: 'typing', 'aria-label': `${partner.name} écrit…` }, h('i'), h('i'), h('i'))] : []));
    scroller.scrollTop = 1e6;
  };
  const send = (t: string) => {
    t = t.trim();
    if (!t) return;
    input.value = '';
    if (!DEMO) return void sendChat(partner.uid, t).catch(() => toast('Message non envoyé.'));
    lines.push({ me: true, t });
    draw();
    setTimeout(() => { typing = true; draw(); }, 400);
    setTimeout(() => {
      typing = false;
      lines.push({ me: false, t: PARTNER_REPLIES[Math.floor(Math.random() * PARTNER_REPLIES.length)] });
      draw();
    }, 1600);
  };
  const input = h('input', { class: 'field', placeholder: `Écris à ${partner.name}…`, 'aria-label': 'Message', enterkeyhint: 'send', style: { flex: 1, height: 50 } });
  input.addEventListener('keydown', (e) => e.key === 'Enter' && send(input.value));
  let wasTyping = false;
  input.addEventListener('input', () => {
    const now = input.value.trim().length > 0;
    if (!DEMO && now !== wasTyping) void setTyping(partner.uid, (wasTyping = now));
  });
  let stop = () => {};
  if (!DEMO) stop = watchChat(partner.uid, (ls, ty) => {
    lines = ls.map((l) => ({ me: l.from === currentUid(), t: l.t }));
    typing = ty;
    draw();
  });
  draw();
  const foot = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
    h('div', { class: 'quick' }, ...['J’arrive !', 'Une autre ?', 'Bien joué partenaire', 'Garde ton 7'].map((t) => h('button', { type: 'button', onclick: () => send(t) }, t))),
    h('div', { style: { display: 'flex', gap: 8 } }, input,
      h('button', { class: 'send', type: 'button', 'aria-label': 'Envoyer', onclick: () => send(input.value) }, h('i'))));
  return { head, body: scroller, foot, cleanup: () => { stop(); if (!DEMO && wasTyping) void setTyping(partner.uid, false); } };
}

export function friendsScreen(): View {
  const content = h('div', { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14 } });
  // La liste d'amis défile à l'intérieur de l'écran.
  let stop = () => {};
  const show = (k: 'amis' | 'chat') => {
    stop();
    if (k === 'amis') {
      const v = friendsPane();
      stop = v.cleanup;
      v.el.classList.add('scroll-y');
      content.replaceChildren(v.el);
    } else {
      const c = chatPane();
      stop = c.cleanup;
      content.replaceChildren(c.head, c.body, ...(c.foot ? [c.foot] : []));
    }
  };
  show('amis');
  const el = h('div', { class: 'screen screen--tabs', 'data-fit': 'tabs', style: { gap: 14, paddingTop: 'calc(var(--safe-top) + 12px)' } },
    h('span', { class: 't-screen' }, 'Tes amis'),
    segmented([{ value: 'amis' as const, label: 'Amis' }, { value: 'chat' as const, label: 'Chat d’équipe' }], 'amis', show),
    content,
    tabbar('friends', goTab));
  return { el, cleanup: () => stop() };
}

export function rankingScreen(): View {
  // Le podium et la liste défilent à l'intérieur de l'écran.
  const body = h('div', { class: 'scroll-y', style: { display: 'flex', flexDirection: 'column', gap: 14 } });
  const me = h('div', { class: 'rank-row rank-me' });
  let scope: RankScope = 'monde';
  let real: { all: RankEntry[]; friends: Set<string> } | null = null;

  const render = (rk: RankRow[], mine: [string, number, string] | null) => {
    const p = draftProfile();
    if (!rk.length) {
      body.replaceChildren(h('p', { class: 'empty' }, real ? 'Personne au classement pour l’instant. Gagne une partie en ligne pour y entrer !' : 'Chargement du classement…'));
      me.hidden = true;
      return;
    }
    const steps: [number, string, string, number, string, number][] = [
      [1, COL.blue.c, COL.blue.d, 96, '#fff', 56], [0, COL.yellow.c, COL.yellow.d, 128, 'var(--ink)', 66], [2, COL.coral.c, COL.coral.d, 76, '#fff', 56],
    ];
    body.replaceChildren(
      h('div', { class: 'podium' }, ...steps.filter(([i]) => rk[i]).map(([i, c, d, ht, nc, size]) => {
        const r = rk[i];
        return h('div', null,
          avatarRing(r.char, r.color, size, c, 4, 3, '0 8px 14px rgba(70,40,20,.15)'),
          h('span', { class: 'podium__name' }, r.name),
          h('span', { class: 'podium__pts' }, `${fmt(r.pts)} pts`),
          h('div', { class: 'podium__step', style: { height: ht, background: c, color: nc, boxShadow: `0 7px 0 ${d},inset 0 3px 0 rgba(255,255,255,.45)` } }, i + 1));
      })),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 } }, ...rk.slice(3).map((r, i) =>
        h('div', { class: 'rank-row' },
          h('span', { class: 'rank-row__n' }, i + 4),
          avatar(r.char, r.color, 40),
          h('div', { class: 'rank-row__who' }, h('span', { class: 'rank-row__name' }, r.name), h('span', { class: 'rank-row__sub' }, r.region)),
          h('div', { class: 'rank-row__pts' }, fmt(r.pts),
            h('span', { style: { color: r.trend[0] === '▲' ? 'var(--ok-ink)' : r.trend[0] === '▼' ? 'var(--coral-d)' : 'var(--ink-3)' } }, r.trend))))));
    me.hidden = !mine;
    if (mine) me.replaceChildren(
      h('span', { class: 'rank-row__n' }, mine[0]),
      avatar(p.char, p.color, 40),
      h('div', { class: 'rank-row__who' }, h('span', { class: 'rank-row__name' }, `${p.nick || 'Toi'} (toi)`), h('span', { class: 'rank-row__sub' }, mine[2])),
      h('span', { style: { font: '800 16px/1 var(--display)' } }, fmt(mine[1])));
  };

  const show = (s: RankScope) => {
    scope = s;
    if (DEMO) return render(DEMO_RANKS[s], DEMO_ME_RANK[s]);
    if (!real) return render([], null);
    const uid = currentUid();
    const list = real.all.filter((e) => s === 'monde' || real!.friends.has(e.uid) || e.uid === uid);
    const rows: RankRow[] = list.map((e) => ({ name: e.nick, region: e.city ?? '', pts: e.points, trend: '—', char: e.char, color: e.color }));
    const i = list.findIndex((e) => e.uid === uid);
    const pts = draftProfile().points ?? 0;
    const mine: [string, number, string] = i < 0 ? ['—', pts, 'Gagne une partie en ligne pour entrer au classement']
      : [`#${i + 1}`, list[i].points, i === 0 ? 'Tu es en tête !' : `Encore ${list[i - 1].points - list[i].points + 1} pts pour dépasser ${list[i - 1].nick}`];
    render(rows, mine);
  };

  show(scope);
  if (!DEMO)
    Promise.all([topPlayers(), friendIds()])
      .then(([all, f]) => { real = { all, friends: new Set(f) }; show(scope); })
      .catch(() => { real = { all: [], friends: new Set() }; show(scope); });

  const el = h('div', { class: 'screen screen--tabs', 'data-fit': 'tabs', style: { gap: 14, paddingTop: 'calc(var(--safe-top) + 12px)', paddingBottom: 'calc(var(--safe-bottom) + 190px)' } },
    h('div', { style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 } },
      h('span', { class: 't-screen' }, 'Classement'),
      h('span', { class: 'pill' }, DEMO ? 'Saison 4 · finit dans 12 j' : 'Saison 1')),
    segmented<RankScope>([{ value: 'amis', label: 'Amis' }, { value: 'monde', label: 'Monde' }], 'monde', show),
    body,
    me,
    tabbar('ranking', goTab));
  return { el, cleanup: () => {} };
}
