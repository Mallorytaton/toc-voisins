// 07 Ta gang (amis, chat d'équipe) et 08 Classement.
import { draftProfile } from '../../app/profile';
import {
  DEMO, DEMO_CHAT, DEMO_FRIENDS, DEMO_ME_RANK, DEMO_RANKS, PARTNER_REPLIES,
  type ChatMsg, type Friend, type RankScope,
} from '../demo';
import { h, toast } from '../dom';
import { COL } from '../kit/data';
import { avatar, avatarRing, button, segmented, tabbar, type Tab } from '../kit/kit';
import { ROUTES, go } from '../nav';

const fmt = (n: number) => n.toLocaleString('fr-CA');
const goTab = (t: Tab) => go(t === 'home' ? ROUTES.home : t === 'friends' ? ROUTES.friends : ROUTES.ranking);

function friendRow(f: Friend, invited: Set<string>): HTMLElement {
  const off = f.presence === 'off';
  const pic = h('div', { style: { position: 'relative', flex: 'none' } }, avatar(f.char, f.color, 46),
    !off && h('span', { class: 'friend__dot', style: { background: f.presence === 'on' ? 'var(--teal)' : 'var(--yellow)' } }));
  let action: HTMLElement | false = false;
  if (f.presence === 'game') action = h('span', { class: 'in-game' }, 'En partie');
  if (f.presence === 'on') {
    const b = button('', 'primary', () => {
      if (invited.has(f.name)) invited.delete(f.name);
      else invited.add(f.name);
      draw();
    }, { size: 'xs' });
    const draw = () => {
      const on = invited.has(f.name);
      b.textContent = on ? 'Invité·e' : 'Inviter';
      b.className = 'btn btn--xs ' + (on ? 'btn--ok' : 'btn--primary');
      if (!on) b.style.boxShadow = '0 4px 0 var(--primary-edge)';
      else b.style.boxShadow = '';
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

function friendsPane(): HTMLElement {
  const p = draftProfile();
  const friends = DEMO ? DEMO_FRIENDS : [];
  const on = friends.filter((f) => f.presence !== 'off');
  const off = friends.filter((f) => f.presence === 'off');
  const invited = new Set<string>();
  const code = DEMO ? 'FREDO#2741' : p.friendCode ?? '—';
  const share = async () => {
    const text = `Ajoute-moi sur TOC : ${code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'TOC', text });
      else { await navigator.clipboard.writeText(code); toast('Code ami copié !'); }
    } catch { /* partage annulé */ }
  };
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
    h('div', { class: 'friend-code' },
      h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 } },
        h('span', { class: 'friend-code__label' }, 'Ton code ami'), h('span', { class: 'friend-code__value' }, code)),
      button('Partager', 'yellow', share, { size: 'xs' })),
    friends.length
      ? [
        h('span', { class: 't-label', style: { marginTop: 8 } }, `En ligne · ${on.length}`),
        on.map((f) => friendRow(f, invited)),
        h('span', { class: 't-label', style: { marginTop: 8 } }, 'Hors ligne'),
        off.map((f) => friendRow(f, invited)),
      ]
      : h('p', { class: 'empty' }, 'Ta gang est vide pour l’instant. Partage ton code ami pour que tes chums t’ajoutent.'));
}

function chatPane(): { head: HTMLElement; body: HTMLElement; foot: HTMLElement } {
  const msgs: ChatMsg[] = DEMO ? DEMO_CHAT.slice() : [];
  const list = h('div', { class: 'chat' });
  const scroller = h('div', { style: { flex: 1, overflowY: 'auto', padding: '16px 0 12px' } }, list);
  let typing = false;
  const draw = () => {
    list.replaceChildren(
      h('span', { style: { alignSelf: 'center', font: '800 11px var(--text)', color: 'var(--ink-3)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 } }, 'Aujourd’hui'),
      ...(msgs.length ? msgs.map((m) => h('div', { class: 'bubble ' + (m.me ? 'bubble--me' : 'bubble--them') }, m.t))
        : [h('p', { class: 'empty' }, 'Jase avec ton partenaire ici pendant vos parties.')]),
      ...(typing ? [h('div', { class: 'typing', 'aria-label': 'Mimi écrit…' }, h('i'), h('i'), h('i'))] : []));
    scroller.scrollTop = 1e6;
  };
  const send = (t: string) => {
    t = t.trim();
    if (!t) return;
    msgs.push({ me: true, t });
    input.value = '';
    draw();
    if (!DEMO) return;
    setTimeout(() => { typing = true; draw(); }, 400);
    setTimeout(() => {
      typing = false;
      msgs.push({ me: false, t: PARTNER_REPLIES[Math.floor(Math.random() * PARTNER_REPLIES.length)] });
      draw();
    }, 1600);
  };
  const input = h('input', { class: 'field', placeholder: 'Écris à Mimi…', 'aria-label': 'Message', enterkeyhint: 'send', style: { flex: 1, height: 50 } });
  input.addEventListener('keydown', (e) => e.key === 'Enter' && send(input.value));
  draw();
  const head = h('div', { class: 'card card--row', style: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 20 } },
    avatar('lunettes', 'yellow', 38),
    h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column' } },
      h('span', { style: { font: '800 16px/1.1 var(--display)' } }, 'Équipe Soleil'),
      h('span', { style: { font: '700 12px var(--text)', color: '#1d7f67' } }, 'Toi + Mimi · en ligne')),
    h('div', { class: 'duo' }, h('span', { style: { background: COL.coral.c } }), h('span', { style: { background: COL.yellow.c, marginLeft: -5 } })));
  const foot = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
    h('div', { class: 'quick' }, ...['J’arrive !', 'Une autre ?', 'Bien joué partner', 'Garde ton 7'].map((t) => h('button', { type: 'button', onclick: () => send(t) }, t))),
    h('div', { style: { display: 'flex', gap: 8 } }, input,
      h('button', { class: 'send', type: 'button', 'aria-label': 'Envoyer', onclick: () => send(input.value) }, h('i'))));
  return { head, body: scroller, foot };
}

export function friendsScreen(): HTMLElement {
  const content = h('div', { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14 } });
  const show = (k: 'amis' | 'chat') => {
    if (k === 'amis') content.replaceChildren(friendsPane());
    else {
      const c = chatPane();
      content.replaceChildren(c.head, c.body, c.foot);
    }
  };
  show('amis');
  return h('div', { class: 'screen screen--tabs', style: { gap: 14, paddingTop: 'calc(var(--safe-top) + 12px)' } },
    h('span', { class: 't-screen' }, 'Ta gang'),
    segmented([{ value: 'amis' as const, label: 'Amis' }, { value: 'chat' as const, label: 'Chat d’équipe' }], 'amis', show),
    content,
    tabbar('friends', goTab));
}

export function rankingScreen(): HTMLElement {
  const p = draftProfile();
  const body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } });
  const me = h('div', { class: 'rank-row rank-me' });
  const show = (scope: RankScope) => {
    const rk = DEMO ? DEMO_RANKS[scope] : [];
    if (!rk.length) {
      body.replaceChildren(h('p', { class: 'empty' }, 'Le classement démarre avec ta première partie en ligne. Envoye, lance une salle !'));
      me.hidden = true;
      return;
    }
    const steps: [number, string, string, number, string, number][] = [
      [1, COL.blue.c, COL.blue.d, 96, '#fff', 56], [0, COL.yellow.c, COL.yellow.d, 128, 'var(--ink)', 66], [2, COL.coral.c, COL.coral.d, 76, '#fff', 56],
    ];
    body.replaceChildren(
      h('div', { class: 'podium' }, ...steps.map(([i, c, d, ht, nc, size]) => {
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
    const [rank, pts, next] = DEMO_ME_RANK[scope];
    me.hidden = false;
    me.replaceChildren(
      h('span', { class: 'rank-row__n' }, rank),
      avatar(p.char, p.color, 40),
      h('div', { class: 'rank-row__who' }, h('span', { class: 'rank-row__name' }, `${p.nick || 'Toi'} (toi)`), h('span', { class: 'rank-row__sub' }, next)),
      h('span', { style: { font: '800 16px/1 var(--display)' } }, fmt(pts)));
  };
  show('quebec');
  return h('div', { class: 'screen screen--tabs', style: { gap: 14, paddingTop: 'calc(var(--safe-top) + 12px)', paddingBottom: 'calc(var(--safe-bottom) + 190px)' } },
    h('div', { style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 } },
      h('span', { class: 't-screen' }, 'Classement'),
      h('span', { class: 'pill' }, DEMO ? 'Saison 4 · finit dans 12 j' : 'Saison 1')),
    segmented<RankScope>([{ value: 'amis', label: 'Amis' }, { value: 'quebec', label: 'Québec' }, { value: 'monde', label: 'Monde' }], 'quebec', show),
    body,
    me,
    tabbar('ranking', goTab));
}
