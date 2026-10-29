// 06 Plateau de jeu : rendu de la maquette, sélection des coups, animations.
import type { GameSource } from '../../app/game-source';
import { draftProfile } from '../../app/profile';
import {
  type Card, type GameState, type Move, type PawnRef, type Rank, applyMove, botGift, botMove, cryptoRng, inHome,
  legalMovesFor, partner, rankOf, sameRef, stepForward, teamOf, trackLen,
} from '../../engine';
import { type Fx, playFx } from '../board/fx';
import { armOf, geom, pawnXY, trackIndex } from '../board/geom';
import { h } from '../dom';
import { COL, EMOTES, SEAT_COLORS, TEAM_NAMES, cardLook } from '../kit/data';
import { avatar, bille, button, cardBack, pauseButton, playingCard } from '../kit/kit';
import { openRulesSheet } from './rules';
import { buzz, sfx, soundSettings } from '../sound';

const REPLIES = ['Aïe !', 'Tu vas voir…', 'Hahaha', 'Pas mal du tout', 'Sérieux ?'];
const TURN_MS = 30_000;
const STAGE_W = 393;
const STAGE_H = 750;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const r1 = (n: number) => Math.round(n * 10) / 10;
const key = (r: PawnRef) => `${r.s}.${r.i}`;
const JOKER_ORDER: Rank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
const RANK_SHORT: Partial<Record<Rank, string>> = { K: 'R', Q: 'D', J: 'V' };

export function gameScreen(src: GameSource, o: { onQuit: () => void }): { el: HTMLElement; cleanup: () => void } {
  const N = src.state.n as 4 | 6;
  const me = src.mySeat;
  const g = geom(N);
  const L = trackLen(N);
  const Z = N === 4
    ? { hs: 13.5, ss: 16.5, rs: 13.5, ps: 17, av: 40, lift: 11 }
    : { hs: 10.5, ss: 13, rs: 10.5, ps: 13.5, av: 34, lift: 8 };
  const tint = (s: number) => COL[SEAT_COLORS[N][s]];
  const nick = draftProfile().nick || 'Toi';
  const nameOf = (s: number) => (s === me ? nick : src.players[s].name);

  let view: GameState = src.state;
  let shown: Card = view.lastCard;
  let busy = false;
  let dealing = false;
  let disposed = false;

  // ---------- Scène ----------
  const stage = h('div', { class: 'game__stage' });
  const frame = h('div', { class: 'game__frame' }, stage);
  const root = h('div', { class: 'game' }, frame);
  const fit = () => {
    const w = frame.clientWidth, ht = frame.clientHeight;
    const s = Math.min(w / STAGE_W, ht / STAGE_H);
    stage.style.transform = `translate(${(w - STAGE_W * s) / 2}px,${Math.max(0, (ht - STAGE_H * s) / 2)}px) scale(${s})`;
  };
  window.addEventListener('resize', fit);

  stage.append(
    h('div', { class: 'blob', style: { left: -140, top: 370, width: 300, height: 300, background: '#ffe9df', zIndex: 0 } }),
    h('div', { class: 'blob', style: { right: -160, top: 10, width: 320, height: 320, background: '#e6ecff', zIndex: 0 } }),
  );

  // ---------- Barre du haut ----------
  const roundEl = h('span', { class: 'g-top__round' });
  const turnEl = h('span', { class: 'g-top__turn' });
  const scoreEl = h('div', { class: 'g-score', 'aria-label': 'Billes rentrées par équipe' });
  const rulesBtn = h('button', { class: 'btn-round g-rules', type: 'button', 'aria-label': 'Règles', onclick: () => openRulesSheet(view.variants) }, '?');
  stage.append(h('div', { class: 'g-top' }, pauseButton(() => openPause()), rulesBtn, h('div', { class: 'g-top__mid' }, roundEl, turnEl), scoreEl));

  // ---------- Plateau ----------
  const board = h('div', { class: 'board' });
  const pathLayer = h('div');
  const ghostLayer = h('div');
  const pawnLayer = h('div');
  const avLayer = h('div');
  const bubbleLayer = h('div');
  const fxBoard = h('div', { class: 'fx-layer', style: { zIndex: 1100 } });
  const discard = h('div', { class: 'discard' });
  const center = N === 4 ? { x: 95, s: 170 } : { x: 122, s: 116 };
  board.append(
    h('div', { class: 'board__wood' }),
    h('div', { class: 'board__center', style: { left: center.x, top: center.x, width: center.s, height: center.s } }),
  );
  const rpads: HTMLElement[] = [];
  g.arms.forEach((am, arm) => {
    const s = (arm - armOf(N, me, 0) + N) % N; // place assise sur ce bras
    const c = tint(s);
    const pad = (b: typeof am.rpad) =>
      h('div', { class: 'pad', style: { left: b.x, top: b.y, width: b.w, height: b.h, borderRadius: b.r, background: c.l, transform: `rotate(${b.rot}deg)` } });
    const rp = pad(am.rpad);
    rpads[s] = rp;
    board.append(rp, pad(am.lpad));
  });
  const hole = (x: number, y: number, z: number, bg: string, sh: string) =>
    h('div', { class: 'hole', style: { left: r1(x - z / 2), top: r1(y - z / 2), width: z, height: z, background: bg, boxShadow: sh } });
  g.track.forEach(([x, y], i) => {
    const arm = Math.floor(i / 16), st = i % 16 === g.sj;
    const c = tint((arm - armOf(N, me, 0) + N) % N);
    board.append(st
      ? hole(x, y, Z.ss, c.l, `inset 0 2px 3px rgba(0,0,0,.18),0 0 0 ${N === 4 ? 3 : 2}px ${c.c}`)
      : hole(x, y, Z.hs, '#ead8c4', 'inset 0 2px 3px rgba(90,60,30,.28),0 1px 0 rgba(255,255,255,.9)'));
  });
  g.lanes.forEach((ln, arm) => {
    const c = tint((arm - armOf(N, me, 0) + N) % N);
    ln.forEach(([x, y]) => board.append(hole(x, y, Z.hs, c.c, 'inset 0 2px 3px rgba(0,0,0,.3),0 1px 0 rgba(255,255,255,.8)')));
    g.res[arm].forEach(([x, y]) => board.append(hole(x, y, Z.rs, 'rgba(90,60,30,.14)', 'inset 0 2px 3px rgba(90,60,30,.25)')));
  });
  board.append(pathLayer,
    h('div', { class: 'pile', style: { transform: `scale(${N === 4 ? 1 : 0.72})` } }, cardBack(), discard),
    ghostLayer, pawnLayer, avLayer, bubbleLayer, fxBoard);
  stage.append(board);
  const fxScreen = h('div', { class: 'fx-layer', style: { zIndex: 38 } });
  stage.append(fxScreen);
  const fx = (layer: 'board' | 'screen', it: Fx) => {
    if (it.kind === 'float') it = { ...it, x: Math.min(300, Math.max(60, it.x)), y: Math.max(40, it.y) };
    playFx(layer === 'board' ? fxBoard : fxScreen, it);
  };

  // ---------- Billes ----------
  const pawnEls = new Map<string, { outer: HTMLElement; inner: HTMLElement; y: number }>();
  const xy = (s: number, i: number, p: number) => pawnXY(g, me, s, i, p);
  for (let s = 0; s < N; s++)
    for (let i = 0; i < 4; i++) {
      const inner = bille(SEAT_COLORS[N][s], { size: Z.ps });
      const outer = h('div', { class: 'pawn', style: { width: Z.ps, height: Z.ps } }, inner);
      outer.addEventListener('click', () => onPawn({ s, i }));
      pawnEls.set(`${s}.${i}`, { outer, inner, y: 0 });
      pawnLayer.append(outer);
    }
  /** Place une bille sur la progression p (durée de transition en ms, soulèvement en px). */
  const place = (s: number, i: number, p: number, dur = 0, lift = 0, extraZ = 0) => {
    const e = pawnEls.get(`${s}.${i}`)!;
    const [x, y] = xy(s, i, p);
    e.y = y;
    e.outer.style.transition = dur ? `left ${dur}ms ease-out, top ${dur}ms ease-out, translate ${Math.round(dur / 2)}ms ease-out` : 'none';
    e.outer.style.left = r1(x - Z.ps / 2) + 'px';
    e.outer.style.top = r1(y - Z.ps * 0.62) + 'px';
    e.outer.style.translate = lift ? `0 ${-lift}px` : '0 0';
    e.outer.style.zIndex = String(Math.round(y) + extraZ);
  };
  const unlift = (s: number, i: number) => { pawnEls.get(`${s}.${i}`)!.outer.style.translate = '0 0'; };
  const syncPawns = (st: GameState) => st.pawns.forEach((row, s) => row.forEach((pw, i) => place(s, i, pw.p)));

  // ---------- Avatars ----------
  const avEls: { root: HTMLElement; pulse: HTMLElement; cards: HTMLElement }[] = [];
  for (let s = 0; s < N; s++) {
    const [x, y] = g.avs[armOf(N, me, s)];
    const size = Z.av, ring = tint(s).c, isMe = s === me;
    const pl = isMe ? { ...src.players[s], ...draftProfile() } : src.players[s];
    const pulse = h('div', { class: 'seat-av__pulse', style: { background: ring } });
    const cards = h('span', { class: 'seat-av__cards', style: x > 200 ? { left: '-8px' } : { right: '-8px' } });
    const vert = Math.abs(x - 180) < 20;
    const tag = vert && y < 180 ? { left: size + 8 + 'px', top: size / 2 - 9 + 'px' }
      : y < 180 ? { left: '50%', top: '-20px', transform: 'translateX(-50%)' }
        : { left: '50%', top: size + 5 + 'px', transform: 'translateX(-50%)' };
    const rootAv = h('div', { class: 'seat-av', style: { left: r1(x - size / 2), top: r1(y - size / 2), width: size, height: size } },
      pulse,
      h('div', { class: 'seat-av__disc', style: { boxShadow: `0 0 0 3px ${ring},0 6px 12px rgba(70,40,20,.25)` } }),
      h('div', { style: { position: 'absolute', inset: 0 } }, avatar(pl.char, pl.color, size)),
      cards,
      !isMe && h('span', { class: 'seat-av__name', style: tag }, pl.name));
    avEls[s] = { root: rootAv, pulse, cards };
    avLayer.append(rootAv);
  }

  // ---------- Toast, émotes, choix ----------
  const toastBox = h('div');
  let toastTimer = 0;
  const toast = (t: string, ms = 1700) => {
    clearTimeout(toastTimer);
    toastBox.replaceChildren(h('div', { class: 'g-toast', role: 'status' }, t));
    toastTimer = window.setTimeout(() => toastBox.replaceChildren(), ms);
  };
  const bubble = (s: number, t: string) => {
    const [x, y] = g.avs[armOf(N, me, s)];
    const b = h('div', { class: 'emote-bubble', style: { left: r1(Math.min(290, Math.max(70, x))), top: r1(y < 60 ? y + Z.av / 2 + 18 : y - Z.av / 2 - 44) } }, t);
    bubbleLayer.querySelectorAll(`[data-seat="${s}"]`).forEach((n) => n.remove());
    b.dataset.seat = String(s);
    bubbleLayer.append(b);
    setTimeout(() => b.remove(), 2200);
  };
  const emoteBtn = h('button', { class: 'btn-round btn-round--lg emote-btn', type: 'button', 'aria-label': 'Émotes', 'aria-expanded': 'false' },
    h('i', null, h('span'), h('span'), h('span')));
  const emotePop = h('div', { class: 'pop pop--emotes', hidden: true },
    ...EMOTES.map((t) => h('button', { type: 'button', onclick: () => sendEmote(t) }, t)));
  const setEmotes = (open: boolean) => {
    emotePop.hidden = !open;
    emoteBtn.setAttribute('aria-expanded', String(open));
  };
  emoteBtn.addEventListener('click', () => setEmotes(!!emotePop.hidden));
  const sendEmote = (t: string) => {
    setEmotes(false);
    bubble(me, t);
    src.emote?.(t);
    if (src.local) {
      const others = [...Array(N).keys()].filter((k) => k !== me);
      setTimeout(() => bubble(others[Math.floor(Math.random() * others.length)], REPLIES[Math.floor(Math.random() * REPLIES.length)]), 950);
    }
  };
  const choicePop = h('div', { class: 'pop pop--choice', hidden: true });
  stage.append(toastBox, emotePop, choicePop);

  // ---------- Barre d'action, minuteur, main ----------
  const hintT = h('b');
  const hintS = h('span');
  // « Une astuce ? » : propose un bon coup (le robot le choisit) sans le jouer à la place du joueur.
  const tipBtn = h('button', { class: 'g-tip', type: 'button', onclick: () => suggest() }, 'Une astuce ?');
  const resetSeven = h('button', { class: 'g-tip', type: 'button', onclick: () => { split = new Map(); render(); } }, 'Recommencer le partage');
  const playBtn = button('Jouer', 'primary', () => commit());
  playBtn.classList.add('g-play');
  const actions = h('div', { class: 'g-actions' }, emoteBtn, h('div', { class: 'g-hint', 'aria-live': 'polite' }, hintT, hintS, tipBtn, resetSeven), playBtn);
  const timerBar = h('div');
  const timerEl = h('div', { class: 'g-timer', 'aria-hidden': 'true' }, timerBar);
  const hand = h('div', { class: 'hand' });
  stage.append(actions, timerEl, hand);

  // ---------- Sélection ----------
  let sel: number | null = null;
  let jokerAs: Rank | null = null;
  let pick: PawnRef | null = null;
  let target: PawnRef | null = null;
  let split = new Map<string, number>();
  /** Explication de l'astuce affichée tant que sa sélection est en place. */
  let tip: string | null = null;
  const clearSel = () => { sel = null; jokerAs = null; pick = null; target = null; split = new Map(); tip = null; };

  const myHand = () => view.hands[me] ?? [];
  const myTurn = () => !busy && view.phase === 'play' && view.turn === me;
  // L'échange se choisit même pendant l'animation de distribution.
  const giving = () => view.phase === 'exchange' && !view.exchange[me];

  interface Plan {
    moves: Move[];
    chosen: Move | null;
    cands: PawnRef[];
    targets: PawnRef[];
    jokerValues: Rank[];
    sevenPawns: PawnRef[];
  }
  const empty: Plan = { moves: [], chosen: null, cands: [], targets: [], jokerValues: [], sevenPawns: [] };

  const plan = (): Plan => {
    if (sel === null || !myTurn()) return empty;
    const card = myHand()[sel];
    let ms = legalMovesFor(view, me, card);
    if (!ms.length) return empty;
    if (ms.every((m) => m.kind === 'discard')) return { ...empty, moves: ms, chosen: ms.find((m) => m.card === card) ?? ms[0] };
    let jokerValues: Rank[] = [];
    if (rankOf(card) === 'X') {
      const vals = new Set(ms.map((m) => (m.kind === 'discard' ? 'A' : m.as)));
      jokerValues = JOKER_ORDER.filter((r) => vals.has(r));
      if (jokerAs === null && jokerValues.length === 1) jokerAs = jokerValues[0];
      if (jokerAs === null) return { ...empty, moves: ms, jokerValues };
      ms = ms.filter((m) => m.kind !== 'discard' && m.as === jokerAs);
    }
    const play = ms.filter((m): m is Exclude<Move, { kind: 'discard' }> => m.kind !== 'discard');
    const cands: PawnRef[] = [];
    const add = (r: PawnRef) => { if (!cands.some((c) => sameRef(c, r))) cands.push(r); };
    play.forEach((m) => (m.kind === 'seven' ? m.parts.forEach((p) => add(p.pawn)) : add(m.pawn)));
    if (!pick && cands.length === 1) pick = cands[0];
    if (play[0]?.kind === 'seven') {
      if (pick && !split.size) {
        const solo = play.find((m) => m.kind === 'seven' && m.parts.length === 1 && sameRef(m.parts[0].pawn, pick!));
        const best = Math.max(0, ...play.flatMap((m) => (m.kind === 'seven' ? m.parts.filter((p) => sameRef(p.pawn, pick!)).map((p) => p.steps) : [])));
        split.set(key(pick), solo ? 7 : best);
      }
      const want = [...split].filter(([, n]) => n > 0).sort().join(',');
      const chosen = play.find((m) => m.kind === 'seven' && m.parts.map((p) => [key(p.pawn), p.steps] as const).sort().map(([k, n]) => `${k},${n}`).join(',') === want) ?? null;
      return { moves: ms, chosen, cands, targets: [], jokerValues, sevenPawns: play.some((m) => m.kind === 'seven' && m.parts.length > 1) ? cands : [] };
    }
    if (!pick) return { moves: ms, chosen: null, cands, targets: [], jokerValues, sevenPawns: [] };
    const mine = play.filter((m): m is Exclude<typeof m, { kind: 'seven' }> => m.kind !== 'seven' && sameRef(m.pawn, pick!));
    if (mine[0]?.kind === 'swap') {
      const targets = mine.map((m) => (m.kind === 'swap' ? m.target : m.pawn));
      if (!target && targets.length === 1) target = targets[0];
      const chosen = target ? mine.find((m) => m.kind === 'swap' && sameRef(m.target, target!)) ?? null : null;
      return { moves: ms, chosen, cands, targets, jokerValues, sevenPawns: [] };
    }
    return { moves: ms, chosen: mine[0] ?? null, cands, targets: [], jokerValues, sevenPawns: [] };
  };

  const onPawn = (r: PawnRef) => {
    const pl = plan();
    tip = null; // le joueur choisit lui-même : l'explication de l'astuce ne vaut plus
    if (pl.targets.some((t) => sameRef(t, r))) target = r;
    else if (pl.cands.some((c) => sameRef(c, r))) {
      if (pl.sevenPawns.length && pick) giveStep(r);
      else {
        pick = r;
        target = null;
        split = new Map();
      }
    } else return;
    render();
  };

  /**
   * Partage du 7 : la bille touchée gagne un pas, pris sur la bille qui en a le plus.
   * Si on touche une nouvelle bille alors que le partage est au maximum de billes (deux, en règle de base),
   * elle prend la place de celle qui a le moins de pas.
   */
  const giveStep = (r: PawnRef) => {
    const k = key(r);
    const cur = new Map([...split].filter(([, n]) => n > 0));
    const others = [...cur.entries()].filter(([kk]) => kk !== k).sort((a, b) => b[1] - a[1]);
    const maxPawns = view.variants.sevenAnyPawns ? Infinity : 2;
    const total = [...cur.values()].reduce((a, b) => a + b, 0);
    // Il reste des pas à placer (la première bille était bloquée avant 7) : on les ajoute.
    if (total < 7 && (cur.has(k) || cur.size < maxPawns)) {
      cur.set(k, (cur.get(k) ?? 0) + 1);
      split = cur;
      return;
    }
    if (!others.length) return toast('Touche une autre bille pour partager le 7.');
    if (!cur.has(k) && cur.size >= maxPawns) {
      const [weakK, weakN] = others[others.length - 1];
      cur.delete(weakK);
      cur.set(k, weakN);
    } else {
      const [fromK, fromN] = others[0];
      if (fromN - 1 > 0) cur.set(fromK, fromN - 1);
      else cur.delete(fromK);
      cur.set(k, (cur.get(k) ?? 0) + 1);
    }
    split = cur;
  };

  /** Progressions successives d'un pion qui fait `steps` pas (négatif = recule). */
  const walk = (p: number, steps: number) => {
    const out: number[] = [];
    for (let k = 0; k < Math.abs(steps); k++) out.push((p = steps > 0 ? stepForward(N, p) : (p - 1 + L) % L));
    return out;
  };

  const preview = (pl: Plan) => {
    pathLayer.replaceChildren();
    ghostLayer.replaceChildren();
    const m = pl.chosen;
    const sevenSplit = [...split].filter(([, n]) => n > 0);
    if (sevenSplit.length && (!m || m.kind === 'seven')) return previewSeven(sevenSplit, m);
    if (!m || m.kind === 'discard' || m.kind === 'swap') return false;
    const cap = applyMove(view, m).lastCaptures.length > 0;
    const ghost = (s: number, i: number, p: number) => {
      const [x, y] = xy(s, i, p), z = Z.ps + 8;
      ghostLayer.append(h('div', { class: 'ghost', style: { left: r1(x - z / 2), top: r1(y - z / 2), width: z, height: z, borderColor: cap ? 'var(--ink)' : 'var(--coral)' } }));
    };
    const dots = (s: number, ps: number[]) => ps.slice(0, -1).forEach((p, k) => {
      if (inHome(N, p)) return;
      const [x, y] = g.track[trackIndex(g, me, s, p)], dz = Z.hs * 0.5;
      pathLayer.append(h('div', { class: 'path-dot', style: { left: r1(x - dz / 2), top: r1(y - dz / 2), width: r1(dz), height: r1(dz), animation: `tocPath 1.1s ease-in-out ${((k + 1) * 0.07).toFixed(2)}s infinite` } }));
    });
    if (m.kind === 'exit') ghost(m.pawn.s, m.pawn.i, 0);
    else if (m.kind === 'step') {
      const ps = walk(view.pawns[m.pawn.s][m.pawn.i].p, m.steps);
      dots(m.pawn.s, ps);
      ghost(m.pawn.s, m.pawn.i, ps[ps.length - 1]);
    } else {
      const cur = new Map<string, number>();
      for (const part of m.parts) {
        const k = key(part.pawn);
        const ps = walk(cur.get(k) ?? view.pawns[part.pawn.s][part.pawn.i].p, part.steps);
        cur.set(k, ps[ps.length - 1]);
        dots(part.pawn.s, ps);
      }
      cur.forEach((p, k) => { const [s, i] = k.split('.').map(Number); ghost(s, i, p); });
    }
    return cap;
  };

  /** Aperçu du 7 : sur chaque bille et sur sa case d'arrivée, une étiquette « +n ». Gris si le partage ne joue pas. */
  const previewSeven = (parts: [string, number][], m: Move | null) => {
    const ok = !!m;
    const cap = ok && applyMove(view, m!).lastCaptures.length > 0;
    const edge = !ok ? 'var(--ink-3)' : cap ? 'var(--ink)' : 'var(--coral)';
    const tag = (x: number, y: number, text: string, color: string, arrival: boolean) =>
      ghostLayer.append(h('div', { class: 'seven-tag' + (arrival ? ' seven-tag--arrival' : ''), style: { left: r1(x), top: r1(y), borderColor: color } }, text));
    for (const [k, n] of parts) {
      const [s, i] = k.split('.').map(Number);
      const p0 = view.pawns[s][i].p;
      const ps = walk(p0, n);
      const [x0, y0] = xy(s, i, p0), [x1, y1] = xy(s, i, ps[ps.length - 1]), z = Z.ps + 8;
      ps.slice(0, -1).forEach((p, j) => {
        if (inHome(N, p)) return;
        const [x, y] = g.track[trackIndex(g, me, s, p)], dz = Z.hs * 0.5;
        pathLayer.append(h('div', { class: 'path-dot', style: { left: r1(x - dz / 2), top: r1(y - dz / 2), width: r1(dz), height: r1(dz), background: ok ? '' : 'var(--ink-3)', animation: `tocPath 1.1s ease-in-out ${((j + 1) * 0.07).toFixed(2)}s infinite` } }));
      });
      ghostLayer.append(h('div', { class: 'ghost', style: { left: r1(x1 - z / 2), top: r1(y1 - z / 2), width: z, height: z, borderColor: edge } }));
      const color = tint(s).c;
      tag(x0, y0 - Z.ps - 2, '+' + n, color, false);
      tag(x1, y1 - Z.ps / 2 - 12, '+' + n, ok ? color : 'var(--ink-3)', true);
    }
    return cap;
  };

  const commit = () => {
    if (giving() && sel !== null) {
      const card = myHand()[sel];
      clearSel();
      stopTimer();
      src.give(card);
      return;
    }
    const pl = plan();
    if (!pl.chosen) return;
    clearSel();
    stopTimer();
    src.play(pl.chosen);
  };

  /** « ton As », « ta Dame », « ton 8 »… */
  const cardName = (c: Card) => {
    const r = rankOf(c);
    return r === 'Q' ? 'ta Dame' : 'ton ' + (({ A: 'As', K: 'Roi', J: 'Valet', X: 'Joker' } as Record<string, string>)[r] ?? r);
  };
  const suggest = () => {
    if (!myTurn()) return;
    const m = botMove(view, () => 0.5, 0);
    if (!m) return;
    clearSel();
    const hand = myHand();
    if (m.kind === 'discard') {
      sel = Math.max(0, m.card ? hand.indexOf(m.card) : 0);
      tip = m.card ? 'Aucun coup possible : défausse cette carte.' : 'Aucun coup possible : tu passes la donne.';
      return render();
    }
    sel = hand.indexOf(m.card);
    if (rankOf(m.card) === 'X') jokerAs = m.as;
    if (m.kind === 'seven') {
      pick = m.parts[0].pawn;
      split = new Map(m.parts.map((p) => [key(p.pawn), p.steps]));
    } else {
      pick = m.pawn;
      if (m.kind === 'swap') target = m.target;
    }
    const after = applyMove(view, m);
    const victims = [...new Set(after.lastCaptures.filter((c) => teamOf(N, c.s) !== teamOf(N, me)).map((c) => nameOf(c.s)))];
    const home = m.kind !== 'seven' && inHome(N, after.pawns[m.pawn.s][m.pawn.i].p) && !inHome(N, view.pawns[m.pawn.s][m.pawn.i].p);
    let text = m.kind === 'exit' ? `Sors une bille avec ${cardName(m.card)}.`
      : m.kind === 'swap' ? `Échange ta bille avec celle de ${nameOf(m.target.s)}.`
        : m.kind === 'seven' ? (m.parts.length > 1 ? `Partage ton 7 : ${m.parts.map((p) => p.steps).join(' + ')}.` : 'Avance cette bille de 7.')
          : m.steps < 0 ? 'Recule cette bille de 4 : elle se rapproche de sa maison.' : `Avance cette bille de ${m.steps} avec ${cardName(m.card)}.`;
    if (home) text += ' Elle rentre à la maison !';
    if (victims.length) text += ` Ça renvoie ${victims.join(' et ')} dans sa réserve !`;
    tip = text;
    render();
  };

  // ---------- Minuteur de tour ----------
  let turnTimer = 0;
  let timerFor = '';
  const stopTimer = () => { clearTimeout(turnTimer); timerFor = ''; timerBar.style.animation = 'none'; timerBar.style.visibility = 'hidden'; };
  /** Un autre humain attend à la table ? Contre des robots seulement, personne n'attend : pas de minuteur. */
  // À ton rythme, jamais de minuteur : chacun joue quand il revient.
  const othersWaiting = () => !src.slow && src.players.some((p, k) => k !== me && !p.bot);
  const syncTimer = () => {
    const active = (myTurn() || giving()) && othersWaiting();
    // Un seul minuteur par échange, et un par tour de jeu.
    const id = view.phase === 'exchange' ? `ex|${view.dealNo}` : `play|${view.v}`;
    if (!active) return stopTimer();
    if (timerFor === id) return;
    timerFor = id;
    clearTimeout(turnTimer);
    timerBar.style.visibility = 'visible';
    timerBar.style.animation = 'none';
    void timerBar.offsetWidth;
    timerBar.style.animation = `tocShrink ${TURN_MS / 1000}s linear both`;
    turnTimer = window.setTimeout(() => {
      if (disposed) return;
      clearSel();
      if (giving()) src.give(botGift(view, me));
      else if (myTurn()) src.play(botMove(view, cryptoRng));
    }, TURN_MS);
  };

  // ---------- Rendu ----------
  const renderTop = () => {
    roundEl.textContent = `Manche ${Math.floor(view.dealNo / 3) + 1} · Donne ${(view.dealNo % 3) + 1}`;
    turnEl.textContent = view.phase === 'over' ? 'Partie terminée'
      : view.phase === 'deal' ? 'On distribue…'
        : view.phase === 'exchange' ? (view.exchange[me] ? 'On attend les autres…' : `Une carte pour ${nameOf(partner(N, me))}`)
          : view.turn === me ? `À toi de jouer, ${nick}` : `Tour de ${nameOf(view.turn)}`;
    const myTeam = teamOf(N, me);
    const teams = [myTeam, ...Array.from({ length: N / 2 }, (_, t) => t).filter((t) => t !== myTeam)];
    scoreEl.replaceChildren(...teams.map((t) => {
      const n = [t, t + N / 2].reduce((a, s) => a + view.pawns[s].filter((pw) => inHome(N, pw.p)).length, 0);
      return h('div', null,
        h('span', { style: { width: 10, height: 10, borderRadius: '50%', background: tint(t).c } }),
        h('span', { style: { width: 10, height: 10, borderRadius: '50%', background: tint(t + N / 2).c, marginLeft: -6, boxShadow: '0 0 0 1.5px #fff' } }),
        h('b', null, n));
    }));
  };

  const renderAvatars = () => {
    for (let s = 0; s < N; s++) {
      const active = view.phase === 'play' && view.turn === s;
      const e = avEls[s];
      e.root.style.transform = `scale(${active ? 1.14 : 1})`;
      e.pulse.hidden = !active;
      e.cards.textContent = String(view.hands[s]?.length ?? 0);
      e.root.classList.toggle('seat-av--off', !src.players[s].online && !src.players[s].bot && s !== me);
      rpads[s].classList.toggle('pad--glow', active);
    }
  };

  const renderDiscard = (thump = false) => {
    if (!shown) {
      discard.className = 'discard discard--empty';
      discard.replaceChildren();
      return;
    }
    const c = cardLook(shown);
    const col = shown.startsWith('X') ? 'var(--violet)' : c.red ? 'var(--card-red)' : 'var(--ink)';
    discard.className = 'discard' + (thump ? ' discard--thump' : '');
    discard.replaceChildren(h('b', { style: { color: col } }, c.r), h('span', { style: { color: col } }, c.s));
  };

  const renderHand = () => {
    const cards = myHand();
    const n = cards.length;
    const active = myTurn() || giving();
    hand.replaceChildren(...cards.map((card, i) => {
      const m = i - (n - 1) / 2, on = sel === i;
      const el = playingCard(card, {
        selected: on, ...view.variants,
        onclick: () => {
          if (!active) return toast('Patience, c’est pas ton tour !');
          if (sel === i) clearSel();
          else { clearSel(); sel = i; }
          setEmotes(false);
          render();
        },
      });
      el.style.left = r1(STAGE_W / 2 - 40 + m * 60) + 'px';
      el.style.top = (on ? 2 : r1(34 + m * m * 5)) + 'px';
      el.style.transform = `rotate(${on ? 0 : r1(m * 6)}deg)`;
      el.style.zIndex = String(on ? 20 : i + 1);
      el.style.opacity = active ? '1' : '.6';
      if (dealing) {
        el.classList.add('pcard--deal');
        el.style.animationDelay = (i * 0.1).toFixed(2) + 's';
      }
      return el;
    }));
  };

  const renderChoice = (pl: Plan) => {
    if (pl.jokerValues.length > 1) {
      choicePop.hidden = false;
      choicePop.replaceChildren(h('span', { class: 'pop__title' }, 'Joue ton Joker comme'),
        h('div', { class: 'chips' }, ...pl.jokerValues.map((r) =>
          h('button', { type: 'button', 'aria-pressed': String(jokerAs === r), onclick: () => { jokerAs = r; pick = null; target = null; split = new Map(); render(); } },
            RANK_SHORT[r] ?? r))));
      return;
    }
    choicePop.hidden = true;
  };

  const render = () => {
    renderTop();
    renderAvatars();
    renderHand();
    const pl = plan();
    // Billes jouables, bille choisie, cibles du Valet
    pawnEls.forEach(({ outer, inner }, k) => {
      const [s, i] = k.split('.').map(Number), r = { s, i };
      const isPick = !!pick && sameRef(pick, r) && pl.cands.length > 0;
      const isTarget = !!target && sameRef(target, r);
      const cand = pl.cands.some((c) => sameRef(c, r)) && (!pick || !!pl.sevenPawns.length);
      const tgt = pl.targets.some((t) => sameRef(t, r));
      inner.className = 'bille' + (isPick || (split.get(k) ?? 0) > 0 ? ' bille--sel' : '') + (isTarget ? ' bille--target' : '');
      outer.classList.toggle('pawn--pick', cand || tgt);
      outer.classList.toggle('pawn--cand', (cand && !isPick) || (tgt && !isTarget));
      outer.style.zIndex = String(Math.round(pawnEls.get(k)!.y) + (isPick ? 300 : 0));
    });
    const cap = preview(pl);
    renderChoice(pl);
    // Carte d'indice et bouton
    let t: string, sub: string, label = '';
    if (view.phase === 'over') { t = 'Partie terminée'; sub = 'Bien joué, tout le monde !'; }
    else if (view.phase === 'exchange') {
      if (view.exchange[me]) { t = 'Carte donnée'; sub = src.slow ? 'On attend les autres : ils donneront leur carte en revenant.' : 'On attend que tout le monde échange.'; }
      else if (sel === null) { t = 'Échange'; sub = `Choisis une carte à passer à ${nameOf(partner(N, me))}.`; }
      else { t = cardLook(myHand()[sel]).t; sub = `Elle part chez ${nameOf(partner(N, me))}, face cachée.`; label = 'Donner'; }
    } else if (!myTurn()) {
      const p = src.players[view.turn];
      if (src.slow && view.phase === 'play' && view.turn !== me && p && !p.bot && !p.online) {
        t = `On attend ${nameOf(view.turn)}`;
        sub = 'Tu seras prévenu·e quand ce sera ton tour.';
      } else {
        t = view.phase === 'play' && view.turn !== me ? `${nameOf(view.turn)} réfléchit…` : 'Beau coup…';
        sub = 'Prépare ton prochain coup.';
      }
    } else if (sel === null) { t = 'À ton tour !'; sub = 'Choisis une carte dans ta main.'; }
    else if (tip) { t = 'Astuce'; sub = tip; label = pl.chosen ? (pl.chosen.kind === 'discard' ? 'Défausser' : 'Jouer') : ''; }
    else {
      const c = cardLook(myHand()[sel], view.variants);
      if (pl.chosen?.kind === 'discard') {
        t = 'Aucun coup possible';
        sub = pl.chosen.card ? 'Défausse cette carte.' : 'Tu passes la donne.';
        label = 'Défausser';
      } else if (split.size && [...split.values()].some((n) => n > 0) && (pl.sevenPawns.length || pl.chosen?.kind === 'seven')) {
        const parts = [...split.values()].filter((n) => n > 0);
        t = parts.length > 1 ? `Le 7 · ${parts.map((n) => '+' + n).join(' et ')}` : 'Le 7 · +7';
        t += cap ? ' · capture !' : '';
        const left = 7 - parts.reduce((a, b) => a + b, 0);
        sub = left > 0 ? `Encore ${left} pas à placer : touche une bille.`
          : !pl.chosen ? 'Ce partage n’est pas possible. Touche une autre bille ou recommence.'
          : pl.sevenPawns.length ? 'Touche une bille pour lui donner un pas.' : c.rule;
        if (pl.chosen) label = 'Jouer';
      } else {
        t = c.t + (cap ? ' · capture !' : '');
        sub = pl.jokerValues.length > 1 && !jokerAs ? 'Choisis la carte que ton Joker remplace.'
          : !pl.chosen && pl.sevenPawns.length ? 'Touche la bille à avancer de 7, puis une autre pour partager.'
            : !pl.chosen && pl.cands.length > 1 && !pick ? 'Touche la bille à jouer.'
              : !pl.chosen && pl.targets.length > 1 ? 'Touche la bille à échanger.'
                : c.rule;
        if (pl.chosen) label = 'Jouer';
        if (!pl.moves.length) sub = 'Cette carte ne peut pas jouer.';
      }
    }
    hintT.textContent = t;
    hintS.textContent = sub;
    tipBtn.hidden = !(myTurn() && sel === null);
    resetSeven.hidden = !(myTurn() && [...split.values()].filter((n) => n > 0).length > 1);
    playBtn.hidden = !label;
    if (label && playBtn.textContent !== label) {
      playBtn.textContent = label;
      playBtn.style.animation = 'none';
      void playBtn.offsetWidth;
      playBtn.style.animation = '';
    }
    syncTimer();
  };

  // ---------- Animations des coups ----------
  const center2 = (s: number, i: number, p: number) => xy(s, i, p);
  const land = (s: number, i: number, p: number, label: string, n: number) => {
    const [x, y] = center2(s, i, p), c = tint(s).c;
    if (inHome(N, p)) sfx('maison');
    fx('board', { kind: 'ring', x, y, c, ms: 550 });
    fx('board', { kind: 'burst', x, y, c, ms: 650 });
    fx('board', { kind: 'float', x, y: y - 12, c, t: label, fs: Math.abs(n) >= 10 ? 26 : 20, ms: 950 });
    const inner = pawnEls.get(`${s}.${i}`)!.inner;
    inner.classList.remove('bille--land');
    void inner.offsetWidth;
    inner.classList.add('bille--land');
    setTimeout(() => inner.classList.remove('bille--land'), 440);
  };
  const flyTo = async (s: number, i: number, p: number, amt: number) => {
    place(s, i, p, 600, amt, 500);
    await sleep(300);
    unlift(s, i);
    await sleep(340);
  };
  const hop = async (s: number, i: number, from: number, steps: number, sp: number) => {
    let p = from;
    for (const next of walk(from, steps)) {
      const [x, y] = center2(s, i, p);
      fx('board', { kind: 'puff', x, y, c: tint(s).c, s: 12, ms: 380 });
      p = next;
      sfx('toc');
      place(s, i, p, Math.round(sp * 0.87), Z.lift, 500);
      await sleep(sp / 2);
      unlift(s, i);
      await sleep(sp / 2);
    }
    return p;
  };
  const flyCard = (seat: number, card: Card, prev: GameState) => {
    const c = cardLook(card), ds = N === 4 ? 1 : 0.72;
    let x0: number, y0: number, r0: number, s0: number;
    if (seat === me) {
      const hd = prev.hands[me], idx = Math.max(0, hd.indexOf(card)), m = idx - (hd.length - 1) / 2;
      [x0, y0, r0, s0] = [STAGE_W / 2 + m * 60, 616, 0, 1];
    } else {
      const [ax, ay] = g.avs[armOf(N, me, seat)];
      [x0, y0, r0, s0] = [ax + 16, ay + 82, -20, 0.35];
    }
    const col = card.startsWith('X') ? '#9b7bff' : c.red ? '#e5482a' : '#2b2a3d';
    fx('screen', { kind: 'card', x0, y0, x1: 16 + 180 + 34 * ds, y1: 262, r0, r1: 6, s0, s1: 0.68 * ds, r: c.r, su: c.s, col, ms: 460 });
    sfx('carte');
    setTimeout(() => { shown = card; renderDiscard(true); }, 450);
  };

  const animateMove = async (prev: GameState, next: GameState) => {
    if (!next.lastMove) return;
    const { seat, move } = next.lastMove;
    const mine = seat === me;
    const sp = mine ? 150 : 110;
    // La main et les compteurs passent tout de suite à l'état suivant ; les billes partent de l'état précédent.
    view = { ...prev, hands: next.hands, turn: next.turn, phase: prev.phase };
    clearSel();
    render();
    if (move.kind === 'discard') {
      if (move.card) flyCard(seat, move.card, prev);
      toast(mine ? (move.card ? 'Carte défaussée.' : 'Aucun coup : tu passes la donne.') : `${nameOf(seat)} ${move.card ? 'défausse' : 'passe la donne'}`);
      await sleep(700);
      return;
    }
    flyCard(seat, move.card, prev);
    if (mine) {
      const victim = next.lastCaptures.find((c) => teamOf(N, c.s) !== teamOf(N, me));
      toast(move.kind === 'exit' ? 'Un pion de sorti. En avant !'
        : move.kind === 'swap' ? (move.target.s === me ? 'Échange !' : `Échange ! Désolé, ${nameOf(move.target.s)}.`)
          : move.kind === 'step' && move.steps < 0 ? 'Recule pour mieux sauter !'
            : victim ? 'BOUM ! Bien visé.' : move.kind === 'step' && move.steps >= 10 ? 'Grosse avance !' : 'Beau coup !');
    } else if (Math.random() < 0.3 && src.local) bubble(seat, REPLIES[Math.floor(Math.random() * REPLIES.length)]);
    await sleep(380);
    if (move.kind === 'exit') {
      await flyTo(move.pawn.s, move.pawn.i, 0, 32);
      const [x, y] = center2(move.pawn.s, move.pawn.i, 0);
      fx('board', { kind: 'confetti', x, y, ms: 1000 });
      sfx('sortie');
      land(move.pawn.s, move.pawn.i, 0, 'SORTI !', 0);
    } else if (move.kind === 'step') {
      const p = await hop(move.pawn.s, move.pawn.i, prev.pawns[move.pawn.s][move.pawn.i].p, move.steps, sp);
      land(move.pawn.s, move.pawn.i, p, move.steps > 0 ? '+' + move.steps : String(move.steps), move.steps);
    } else if (move.kind === 'swap') {
      const a = move.pawn, b = move.target;
      const pa = next.pawns[a.s][a.i].p, pb = next.pawns[b.s][b.i].p;
      sfx('echange');
      await Promise.all([flyTo(a.s, a.i, pa, 26), flyTo(b.s, b.i, pb, 26)]);
      for (const [r, p] of [[a, pa], [b, pb]] as const) {
        const [x, y] = center2(r.s, r.i, p);
        fx('board', { kind: 'ring', x, y, c: tint(r.s).c, ms: 550 });
        fx('board', { kind: 'burst', x, y, c: tint(r.s).c, ms: 650 });
      }
      const [x, y] = center2(a.s, a.i, pa);
      fx('board', { kind: 'float', x, y: y - 14, c: '#6a4bd8', t: 'ÉCHANGE !', fs: 22, ms: 1000 });
    } else {
      const cur = new Map<string, number>();
      for (const part of move.parts) {
        const k = key(part.pawn);
        const from = cur.get(k) ?? prev.pawns[part.pawn.s][part.pawn.i].p;
        const p = await hop(part.pawn.s, part.pawn.i, from, part.steps, sp);
        cur.set(k, p);
        land(part.pawn.s, part.pawn.i, p, '+' + part.steps, part.steps);
        await sleep(180);
      }
    }
    // Captures : BOUM, tremblement, retour à la réserve.
    if (next.lastCaptures.length) {
      for (const v of next.lastCaptures) {
        const [x, y] = center2(v.s, v.i, prev.pawns[v.s][v.i].p);
        fx('board', { kind: 'confetti', x, y, ms: 1100 });
        fx('board', { kind: 'float', x, y: y - 22, c: '#2b2a3d', t: 'BOUM !', fs: 30, ms: 1100 });
      }
      board.classList.remove('board--shake');
      void board.offsetWidth;
      board.classList.add('board--shake');
      sfx('boum');
      // Une de tes billes renvoyée dans ta réserve : le téléphone vibre.
      if (next.lastCaptures.some((v) => v.s === me)) buzz(220);
      await sleep(200);
      const names = [...new Set(next.lastCaptures.map((v) => nameOf(v.s)))];
      setTimeout(() => toast(`Retour à la réserve, ${names.join(' et ')} !`, 1900), 100);
      await Promise.all(next.lastCaptures.map((v) => flyTo(v.s, v.i, -1, 36)));
    }
    await sleep(mine ? 500 : 350);
  };

  const animate = async (prev: GameState, next: GameState, reset: boolean) => {
    if (reset) {
      closeSheet();
      view = next;
      shown = next.lastCard;
      clearSel();
      syncPawns(next);
      renderDiscard();
      render();
      return;
    }
    const moved = !!next.lastMove && JSON.stringify(next.lastMove) !== JSON.stringify(prev.lastMove);
    if (moved) await animateMove(prev, next);
    const wasMyTurn = prev.phase === 'play' && prev.turn === me;
    // Le coup d'un autre (ex. un robot qui échange sa carte) ne doit pas effacer la sélection en cours.
    const sameHand = JSON.stringify(prev.hands[me]) === JSON.stringify(next.hands[me]);
    if (moved || prev.phase !== next.phase || !sameHand) clearSel();
    view = next;
    syncPawns(next);
    if (prev.phase === 'deal' && next.phase === 'exchange') {
      shown = '';
      renderDiscard();
      dealing = true;
      render();
      dealing = false;
      const size = next.hands[me].length;
      sfx('donne');
      if (next.dealNo === 0) fx('screen', { kind: 'banner', y: 262, t: 'C’EST PARTI !', ms: 1500 });
      else toast(`Nouvelle donne : ${size} cartes !`);
      await sleep(1300);
    } else if (prev.phase === 'exchange' && next.phase === 'play') {
      render();
      toast(`${nameOf(partner(N, me))} t’a passé une carte`);
      await sleep(600);
    }
    if (next.phase === 'play' && next.turn === me && (!wasMyTurn || moved)) {
      fx('screen', { kind: 'banner', y: 262, t: 'À TOI DE JOUER !', ms: 1500 });
      sfx('tour');
      buzz([60, 40, 60]);
    }
    if (next.phase === 'over' && prev.phase !== 'over') showEnd(next);
  };

  const queue: { prev: GameState; next: GameState; reset: boolean }[] = [];
  const pump = async () => {
    if (busy) return;
    busy = true;
    stopTimer();
    while (queue.length && !disposed) {
      // Retour dans l'app (ou gros retard) : on ne rejoue pas chaque coup en retard, on saute au dernier état.
      if (document.hidden || queue.length > 2) {
        const first = queue[0], last = queue[queue.length - 1];
        queue.length = 0;
        await animate(first.prev, last.next, true);
        if (last.next.phase === 'over' && first.prev.phase !== 'over') showEnd(last.next);
        continue;
      }
      const e = queue.shift()!;
      await animate(e.prev, e.next, e.reset);
    }
    busy = false;
    if (disposed) return;
    render();
    src.settled();
  };
  const unsub = src.subscribe((prev, reset) => {
    queue.push({ prev, next: src.state, reset });
    void pump();
  });
  const unsubEmote = src.onEmote?.((seat, t) => bubble(seat, t));

  // ---------- Pause et fin ----------
  let sheet: HTMLElement | null = null;
  const closeSheet = () => { sheet?.remove(); sheet = null; };
  const openSheet = (...kids: HTMLElement[]) => {
    closeSheet();
    sheet = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === sheet) closeSheet(); } }, h('div', { class: 'sheet', role: 'dialog' }, ...kids));
    root.append(sheet);
  };
  const openPause = () => openSheet(
    h('span', { class: 'sheet__title' }, 'Pause'),
    h('span', { class: 'sheet__text' }, src.slow ? 'Partie à ton rythme : elle t’attend sur l’accueil, reviens quand tu veux.' : 'Les autres t’attendent, fais vite !'),
    soundSettings(),
    button('Reprendre', 'primary', closeSheet, { size: 'md', block: true }),
    src.local ? button('Recommencer la donne', 'white', () => { closeSheet(); src.restartDeal(); }, { size: 'md', block: true }) : h('span'),
    button(src.slow ? 'Revenir à l’accueil' : 'Quitter la partie', src.slow ? 'white' : 'danger', () => { closeSheet(); o.onQuit(); }, { size: 'md', block: true }),
  );
  const showEnd = (st: GameState) => {
    const won = teamOf(N, me) === st.winner;
    sfx(won ? 'victoire' : 'defaite');
    if (won) buzz([80, 60, 80, 60, 200]);
    for (let k = 0; k < 3; k++) setTimeout(() => fx('board', { kind: 'confetti', x: 120 + k * 60, y: 160 + (k % 2) * 40, ms: 1200 }), k * 250);
    setTimeout(() => openSheet(
      h('span', { class: 'sheet__title' }, won ? 'Victoire !' : 'Partie perdue'),
      h('span', { class: 'sheet__text' }, `L’équipe ${TEAM_NAMES[st.winner]} a rentré toutes ses billes${won ? '. Bravo l’équipe !' : '. Revanche ?'}`),
      button('Revanche', 'primary', () => { closeSheet(); src.rematch(); }, { size: 'md', block: true }),
      button('Retour à l’accueil', 'white', () => { closeSheet(); o.onQuit(); }, { size: 'md', block: true }),
    ), 900);
  };

  // ---------- Démarrage ----------
  syncPawns(view);
  renderDiscard();
  render();
  requestAnimationFrame(fit);
  if (view.phase !== 'deal') src.settled();

  return {
    el: root,
    cleanup: () => {
      disposed = true;
      unsub();
      unsubEmote?.();
      stopTimer();
      clearTimeout(toastTimer);
      window.removeEventListener('resize', fit);
      src.leave();
    },
  };
}
