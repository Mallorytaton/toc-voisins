import QRCode from 'qrcode';
import { DEFAULT_VARIANTS, Variants, newGame, partner, teamOf } from '../engine';
import { Board } from './board';
import { LocalSetup, loadLocal } from '../local/local';
import { isFirebaseConfigured } from '../net/firebase-config';
import { OnlineSession, prefs } from '../net/online';
import { COLORS, shapeIcon } from './colors';
import { h, toast } from './dom';
import { VARIANT_INFO, rulesView, variantSummary } from './rules';

export const go = (path: string) => (location.hash = '#' + path);
export const gameLink = (code: string) => `${location.origin}${import.meta.env.BASE_URL}#/g/${code}`;

function page(title: string | null, back: string | null, ...children: (Node | null)[]) {
  return h(
    'div',
    { class: 'page' },
    title !== null
      ? h('header', { class: 'topbar' },
          back !== null ? h('button', { class: 'icon-btn', onclick: () => go(back), 'aria-label': 'Retour' }, '←') : h('span'),
          h('span', { class: 'title' }, title),
          h('span', { class: 'icon-spacer' }))
      : null,
    h('main', { class: 'page-body' }, ...children),
  );
}

function icon(color: number, size = 22) {
  const el = h('span', { class: 'shape-icon' });
  el.innerHTML = shapeIcon(color, size);
  return el;
}

/** Mini-plateau décoratif de l'accueil, avec quelques pions en cours de partie. */
function heroBoard() {
  const b = new Board(4, 0, [0, 1, 2, 3]);
  const st = newGame(4);
  const spots: [number, number, number][] = [[0, 0, 12], [0, 1, 74], [1, 0, 30], [1, 2, 0], [2, 1, 50], [2, 3, 75], [3, 0, 8], [3, 2, 66]];
  for (const [s, i, p] of spots) st.pawns[s][i] = { p, fresh: false };
  b.update(st, { highlight: [], selected: null, ghosts: [] }, false);
  return h('div', { class: 'hero-board', 'aria-hidden': 'true' }, b.el);
}

export function homeScreen(): HTMLElement {
  const local = loadLocal();
  const last = prefs.lastGame;
  const online = isFirebaseConfigured();
  const codeInput = h('input', {
    class: 'input code-input', inputmode: 'numeric', maxlength: 9, placeholder: '4821', 'aria-label': 'Code de la partie', autocomplete: 'off',
  }) as HTMLInputElement;
  const join = () => {
    const code = codeInput.value.replace(/\D/g, '');
    if (code.length !== 4) return toast('Le code comporte 4 chiffres (ex. TOC-4821)');
    go('/g/' + code);
  };
  codeInput.addEventListener('keydown', (e) => e.key === 'Enter' && join());
  return page(
    null,
    null,
    h('div', { class: 'hero' },
      heroBoard(),
      h('h1', null, 'Toc', h('span', null, 'entre voisins')),
      h('p', { class: 'tagline' }, 'Créez une partie, envoyez le lien, jouez chacun depuis son téléphone.')),
    online
      ? h('section', { class: 'card-box' },
          h('button', { class: 'btn primary big', onclick: () => go('/creer') }, 'Créer une partie'),
          h('div', { class: 'join-row' },
            h('label', { class: 'code-label' }, 'TOC-', codeInput),
            h('button', { class: 'btn', onclick: join }, 'Rejoindre')),
          last ? h('button', { class: 'btn ghost', onclick: () => go('/g/' + last) }, `Reprendre la partie TOC-${last}`) : null)
      : h('section', { class: 'card-box' },
          h('p', null, 'Le jeu en ligne n’est pas encore configuré (Firebase). La table locale fonctionne déjà.')),
    h('section', { class: 'card-box' },
      h('button', { class: 'btn big', onclick: () => go('/local') }, 'Table locale'),
      h('p', { class: 'muted small' }, 'Plusieurs joueurs sur le même appareil, avec ou sans robots. Fonctionne hors ligne.'),
      local && local.state.phase !== 'over' ? h('button', { class: 'btn ghost', onclick: () => go('/local/jeu') }, 'Reprendre la table locale') : null),
    h('button', { class: 'btn ghost', onclick: () => go('/regles') }, 'Règles du jeu'),
  );
}

function variantsForm(init: Variants) {
  const v: Variants = { ...init };
  const nodes = VARIANT_INFO.map((info) => {
    const cb = h('input', { type: 'checkbox', checked: v[info.key] }) as HTMLInputElement;
    cb.addEventListener('change', () => (v[info.key] = cb.checked));
    return h('label', { class: 'check' }, cb, h('span', null, h('strong', null, info.label), h('br'), h('span', { class: 'muted small' }, info.help)));
  });
  const jok = h('select', { class: 'input', 'aria-label': 'Nombre de jokers' }, [0, 2, 4].map((n) => h('option', { value: n, selected: n === v.jokers }, `${n} jokers`))) as HTMLSelectElement;
  jok.addEventListener('change', () => (v.jokers = +jok.value as Variants['jokers']));
  return { el: h('fieldset', { class: 'variants' }, h('legend', null, 'Variantes'), ...nodes, h('label', { class: 'row-label' }, 'Jokers par paquet ', jok)), v };
}

function segmented(options: number[], value: number, onChange: (n: number) => void, label: (n: number) => string) {
  const wrap = h('div', { class: 'segmented', role: 'radiogroup' });
  const draw = () =>
    wrap.replaceChildren(
      ...options.map((n) =>
        h('button', { class: 'seg' + (n === value ? ' on' : ''), role: 'radio', 'aria-checked': n === value ? 'true' : 'false', onclick: () => { value = n; onChange(n); draw(); } }, label(n)),
      ),
    );
  draw();
  return wrap;
}

export function createScreen(onCreate: (n: number, v: Variants) => Promise<void>): HTMLElement {
  let n = 4;
  const form = variantsForm(DEFAULT_VARIANTS);
  const btn = h('button', { class: 'btn primary big' }, 'Créer la partie') as HTMLButtonElement;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Création…';
    try {
      await onCreate(n, form.v);
    } catch (e) {
      console.error(e);
      toast('Création impossible : ' + (e as Error).message);
      btn.disabled = false;
      btn.textContent = 'Créer la partie';
    }
  });
  return page('Nouvelle partie', '/',
    h('section', { class: 'card-box' },
      h('h2', null, 'Nombre de joueurs'),
      segmented([4, 6], n, (x) => (n = x), (x) => (x === 4 ? '4 joueurs · 2 équipes' : '6 joueurs · 3 équipes'))),
    h('section', { class: 'card-box' }, form.el),
    btn);
}

export async function share(code: string) {
  const url = gameLink(code);
  const text = `On joue au Toc ? Rejoins la partie TOC-${code} :`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Toc entre voisins', text, url });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast('Lien copié dans le presse-papier');
  } catch {
    prompt('Copie ce lien :', url);
  }
}

export function shareBox(code: string): HTMLElement {
  const qr = h('div', { class: 'qr', 'aria-label': 'QR code du lien' });
  QRCode.toString(gameLink(code), { type: 'svg', margin: 1, color: { dark: '#2b1a0e', light: '#ffffff' } }).then((svg) => (qr.innerHTML = svg));
  return h('section', { class: 'card-box share' },
    h('div', { class: 'big-code' }, `TOC-${code}`),
    h('button', { class: 'btn primary', onclick: () => share(code) }, 'Partager le lien'),
    h('details', null, h('summary', null, 'QR code et lien'), qr, h('p', { class: 'small break' }, gameLink(code))));
}

/** Table ronde : les places sont dans le même ordre que sur le plateau, partenaires en face. */
function seatTable(n: number, label: (s: number) => HTMLElement) {
  const wrap = h('div', { class: `seat-table n${n}` });
  for (let s = 0; s < n; s++) {
    const a = Math.PI / 2 + (2 * Math.PI * s) / n;
    const el = label(s);
    el.style.left = `${50 + Math.cos(a) * 38}%`;
    el.style.top = `${50 + Math.sin(a) * 38}%`;
    wrap.append(el);
  }
  wrap.append(h('div', { class: 'seat-center' }, 'Partenaires', h('br'), 'face à face'));
  return wrap;
}

export function lobbyScreen(sess: OnlineSession): HTMLElement {
  const root = h('div');
  const nameInput = h('input', { class: 'input', maxlength: 14, placeholder: 'Ton prénom', 'aria-label': 'Ton prénom', autocomplete: 'given-name' }) as HTMLInputElement;
  const g0 = sess.game!;
  nameInput.value = g0.players[sess.uid]?.name || prefs.name;
  let pendingName: ReturnType<typeof setTimeout> | undefined;
  nameInput.addEventListener('input', () => {
    clearTimeout(pendingName);
    pendingName = setTimeout(() => sess.setProfile(nameInput.value.trim(), sess.game!.players[sess.uid]?.color ?? -1), 400);
  });

  const body = h('div');
  const draw = () => {
    const g = sess.game;
    if (!g) return;
    const me = g.players[sess.uid];
    const usedColors = new Set(Object.entries(g.players).filter(([u]) => u !== sess.uid && g.seats.includes(u)).map(([, p]) => p.color));
    const mySeat = sess.mySeat;
    const allSeated = g.seats.every((u) => u && g.players[u]?.name && g.players[u].color >= 0);
    const colorPicker = h('div', { class: 'colors', role: 'radiogroup', 'aria-label': 'Couleur' },
      COLORS.map((c, i) =>
        h('button', {
          class: 'color-btn' + (me?.color === i ? ' on' : ''), disabled: usedColors.has(i), role: 'radio', 'aria-checked': me?.color === i ? 'true' : 'false',
          'aria-label': `${c.name} (${c.shapeName})`,
          onclick: () => sess.setProfile(nameInput.value.trim(), i),
        }, icon(i, 30), h('span', { class: 'small' }, c.name))));
    const table = seatTable(g.meta.n, (s) => {
      const uid = g.seats[s];
      const p = uid ? g.players[uid] : null;
      const mine = uid === sess.uid;
      const team = 'ABC'[teamOf(g.meta.n, s)];
      return h('button', {
        class: 'seat' + (mine ? ' mine' : '') + (uid ? ' taken' : ''),
        disabled: !!uid && !mine,
        onclick: async () => {
          if (!nameInput.value.trim()) return toast("Indique d'abord ton prénom");
          try {
            await sess.setProfile(nameInput.value.trim(), me?.color ?? -1);
            if (!mine) await sess.takeSeat(s);
          } catch (e) {
            toast((e as Error).message);
          }
        },
      },
      p && p.color >= 0 ? icon(p.color, 22) : null,
      h('span', { class: 'seat-name' }, p ? p.name || '…' : `Place ${s + 1}`),
      h('span', { class: 'small muted' }, `Équipe ${team}` + (uid && !sess.online(uid) ? ' · absent' : '')));
    });
    const missing = g.seats.filter((u) => !u).length;
    body.replaceChildren(
      h('section', { class: 'card-box' },
        h('h2', null, 'Toi'),
        nameInput,
        h('p', { class: 'small muted' }, 'Ta couleur (chaque couleur a sa forme) :'),
        colorPicker),
      h('section', { class: 'card-box' },
        h('h2', null, 'Choisis ta place'),
        table,
        mySeat >= 0 ? h('p', { class: 'small' }, `Ton partenaire est à la place ${partner(g.meta.n, mySeat) + 1}.`) : null),
      h('section', { class: 'card-box' },
        h('p', { class: 'small muted' }, `${g.meta.n} joueurs · ${variantSummary(g.meta.variants).join(' · ')}`),
        sess.isHost
          ? h('button', { class: 'btn primary big', disabled: !allSeated, onclick: () => sess.startGame().catch((e) => toast(e.message)) },
              allSeated ? 'Lancer la partie' : missing ? `En attente de ${missing} joueur${missing > 1 ? 's' : ''}…` : 'Chacun doit choisir sa couleur')
          : h('p', null, allSeated ? "Tout le monde est prêt : l'hôte va lancer la partie." : 'La partie démarre quand toutes les places sont prises.')),
    );
    if (me && me.color < 0 && prefs.color >= 0 && !usedColors.has(prefs.color) && me.name) sess.setProfile(me.name, prefs.color);
  };
  root.append(page('Salon', '/', shareBox(sess.code), body));
  const unsub = sess.subscribe(draw);
  draw();
  (root as HTMLElement & { cleanup?: () => void }).cleanup = () => unsub();
  return root;
}

export function reclaimScreen(sess: OnlineSession): HTMLElement {
  const g = sess.game!;
  const free = g.seats.map((u, s) => ({ u, s })).filter(({ u }) => u && !sess.online(u));
  return page('Partie en cours', '/',
    h('section', { class: 'card-box' },
      h('p', null, 'Cette partie a déjà commencé. Si tu jouais déjà (depuis un autre navigateur ou après avoir réinstallé l’appli), reprends ta place :'),
      free.length
        ? h('div', { class: 'stack' }, free.map(({ u, s }) =>
            h('button', { class: 'btn', onclick: () => sess.reclaimSeat(s).catch((e) => toast(e.message)) }, icon(g.players[u]?.color ?? 0), ` Je suis ${g.players[u]?.name ?? 'Place ' + (s + 1)}`)))
        : h('p', { class: 'muted' }, 'Tous les joueurs sont connectés : aucune place à reprendre.')));
}

export function rulesScreen(): HTMLElement {
  return page('Règles', '/', h('section', { class: 'card-box' }, rulesView(DEFAULT_VARIANTS)));
}

export function localSetupScreen(onStart: (s: LocalSetup) => void): HTMLElement {
  let n = 4;
  const form = variantsForm(DEFAULT_VARIANTS);
  const rows = h('div', { class: 'stack' });
  const players = Array.from({ length: 6 }, (_, i) => ({ name: i === 0 ? prefs.name || 'Moi' : `Robot ${i}`, color: i, bot: i !== 0 }));
  const draw = () =>
    rows.replaceChildren(
      ...players.slice(0, n).map((p, i) => {
        const inp = h('input', { class: 'input', value: p.name, maxlength: 14, 'aria-label': `Nom place ${i + 1}` }) as HTMLInputElement;
        inp.addEventListener('input', () => (p.name = inp.value));
        return h('div', { class: 'player-row' },
          icon(p.color, 26),
          inp,
          h('button', {
            class: 'btn small-btn' + (p.bot ? '' : ' on'),
            onclick: () => { p.bot = !p.bot; if (p.name.startsWith('Robot') && !p.bot) p.name = `Joueur ${i + 1}`; else if (p.bot && p.name.startsWith('Joueur')) p.name = `Robot ${i}`; draw(); },
          }, p.bot ? '🤖 Robot' : '🙂 Humain'),
          h('span', { class: 'small muted' }, 'Éq. ' + 'ABC'[teamOf(n, i)]));
      }),
    );
  draw();
  return page('Table locale', '/',
    h('section', { class: 'card-box' },
      h('h2', null, 'Joueurs'),
      segmented([4, 6], n, (x) => { n = x; draw(); }, (x) => `${x} joueurs`),
      h('p', { class: 'small muted' }, 'Les places sont dans l’ordre du jeu ; les partenaires sont face à face (1 et 3, 2 et 4…).'),
      rows),
    h('section', { class: 'card-box' }, form.el),
    h('button', {
      class: 'btn primary big',
      onclick: () => {
        const ps = players.slice(0, n);
        if (ps.every((p) => p.bot)) return toast('Il faut au moins un humain');
        onStart({ n, variants: form.v, players: ps.map((p, i) => ({ ...p, name: p.name.trim() || `Joueur ${i + 1}` })) });
      },
    }, 'Commencer'));
}
