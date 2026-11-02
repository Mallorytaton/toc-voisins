// 06 Plateau de jeu : rendu de la maquette, sélection des coups, animations.
import type { GameSource, RematchVote, TableMsg } from '../../app/game-source';
import { draftProfile } from '../../app/profile';
import {
  type Card, type GameState, type Move, type PawnRef, type Rank, HOME_SIZE, applyMove, botGift, botMove, cryptoRng, homeEntry, inHome, isLap, legalMovesFor, partner, rankOf, sameRef, stepForward, teamOf, trackLen, DEAL_CYCLE, decksFor,
} from '../../engine';
import { type Fx, playFx } from '../board/fx';
import { armOf, geom, pawnXY, trackIndex } from '../board/geom';
import { h } from '../dom';
import { COL, EMOTES, SEAT_COLORS, TEAM_NAMES, cardLook } from '../kit/data';
import { avatar, bille, button, cardBack, pauseButton, playingCard } from '../kit/kit';
import { openRulesSheet } from './rules';
import { buzz, sfx, soundSettings } from '../sound';
import { type MascotMood, mascot } from '../mascot';
import { openTableSheet } from '../table-invite';
import { allowLandscape } from '../orientation';

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
  // Écran de table (tablette, sans place) : le plateau seul, vu depuis la place 0, sans main ni « à toi ».
  const watching = src.mySeat < 0;
  const me = watching ? 0 : src.mySeat;
  const g = geom(N);
  const L = trackLen(N);
  const Z = N === 4
    ? { hs: 13.5, ss: 16.5, rs: 13.5, ps: 17, av: 36, lift: 11 }
    : { hs: 10.5, ss: 13, rs: 10.5, ps: 13.5, av: 34, lift: 8 };
  const tint = (s: number) => COL[SEAT_COLORS[N][s]];
  const nick = draftProfile().nick || 'Toi';
  const nameOf = (s: number) => (s === me && !watching ? nick : src.players[s].name);

  let view: GameState = src.state;
  let shown: Card = view.lastCard;
  let busy = false;
  let dealing = false;
  let disposed = false;

  // ---------- Scène ----------
  const stage = h('div', { class: 'game__stage' });
  const frame = h('div', { class: 'game__frame' }, stage);
  const root = h('div', { class: 'game' }, frame);
  /** Contenu de l'écran de fin : mis à l'échelle de tout l'écran (son fond, lui, couvre tout l'écran). */
  let victoryInner: HTMLElement | null = null;

  // ---------- Pliants : deux volets ----------
  // La scène se coupe en deux régions : le haut (barre, plateau) et le bas (indice, minuteur, main).
  // Pliant à moitié plié : plateau en haut, main en bas, de part et d'autre de la pliure ;
  // pliant en livre, ou ouvert et plus large que haut : côte à côte.
  // Le bas est la même scène décalée : les coordonnées ne changent pas, rien n'est reconstruit.
  const SPLIT_Y = 456;
  /** Journal de la partie, affiché en permanence sur l'écran de table. */
  const tableJournal = h('div', { class: 'table-journal', hidden: true });
  root.append(tableJournal);
  const LOW_H = 760 - SPLIT_Y;
  /** Grand écran plus haut que large : consigne et cartes côte à côte, sur une rangée (scène deux fois plus large). */
  const ROW_Y = 446, ROW_H = 166, ROW_W = 2 * 393;
  /** Grand écran : la région du plateau descend jusqu'aux noms des persos du bas. */
  const BOARD_H = 474;
  /** Le chat suit la mise en page (rangé plus bas, une fois le chat construit). */
  let layoutHook: (P: ReturnType<typeof panes>) => void = () => {};
  /** Écran de table : le plateau seul, des noms au-dessus des avatars du haut à ceux du bas (sans barre ni main). */
  const TABLE_Y = 58;
  const TABLE_H = 488;
  const stage2 = h('div', { class: 'game__stage' });
  const frame2 = h('div', { class: 'game__frame', hidden: true }, stage2);
  root.append(frame2);
  /** Éléments du bas (indice, minuteur, main), rangés dans le second volet quand il y en a deux. */
  const lowEls: HTMLElement[] = [];
  let layout = '';
  type Box = { x: number; y: number; w: number; h: number };
  const probe = (css: string) => {
    const p = h('div');
    p.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;${css}`;
    document.body.append(p);
    const r = p.getBoundingClientRect(), cs = getComputedStyle(p);
    const out = { x: r.left, y: r.top, w: r.width, h: r.height, t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0 };
    p.remove();
    return out;
  };
  const segment = (i: number, j: number): Box =>
    probe(`left:env(viewport-segment-left ${i} ${j});top:env(viewport-segment-top ${i} ${j});width:env(viewport-segment-width ${i} ${j});height:env(viewport-segment-height ${i} ${j})`);
  const mqFlex = matchMedia('(vertical-viewport-segments: 2)');
  const mqBook = matchMedia('(horizontal-viewport-segments: 2)');
  const panes = (): { kind: string; a: Box; b?: Box; c?: Box; j?: Box } | null => {
    const W = root.clientWidth, H = root.clientHeight;
    const sa = probe('padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)');
    const { t, b } = sa;
    const clip = (x: Box): Box => { const y = Math.max(x.y, t), y2 = Math.min(x.y + x.h, H - b); return { x: x.x, y, w: x.w, h: y2 - y }; };
    // Écran de table : le plateau et le journal de la partie (à côté en largeur, dessous en hauteur).
    if (watching) {
      const full = clip({ x: 0, y: 0, w: W, h: H });
      if (W >= H) {
        const J = Math.min(400, Math.round(W * 0.32));
        return { kind: 'table', a: { ...full, w: full.w - J - 8 }, j: { x: full.x + full.w - J, y: full.y + 16, w: J - 16, h: full.h - 32 } };
      }
      const JH = Math.round(full.h * 0.3);
      return { kind: 'table', a: { ...full, h: full.h - JH }, j: { x: 16, y: full.y + full.h - JH + 4, w: W - 32, h: JH - 20 } };
    }
    // Manette en paysage : la barre et les billes à gauche, les cartes en grand à droite.
    if (manette() && W > H) {
      const [L, R, T, B] = [sa.l, sa.r, sa.t, sa.b];
      const w = W - L - R, hh = H - T - B, wa = Math.round(w * 0.44);
      return { kind: 'manette', a: { x: L, y: T, w: wa - 4, h: hh }, b: { x: L + wa + 4, y: T, w: w - wa - 4, h: hh } };
    }
    if (document.documentElement.dataset.rot) return null;
    // Pliant à moitié plié (ou posture inconnue) : un volet de chaque côté de la pliure.
    const posture = (navigator as Navigator & { devicePosture?: { type: string } }).devicePosture?.type;
    if (posture !== 'continuous' && mqFlex.matches) return { kind: 'flex', a: clip(segment(0, 0)), b: clip(segment(0, 1)) };
    if (posture !== 'continuous' && mqBook.matches) return { kind: 'book', a: clip(segment(0, 0)), b: clip(segment(1, 0)) };
    // Grand écran (pliant ouvert à plat, tablette) : tout l'écran, charnière comprise.
    if (matchMedia('(pointer: coarse)').matches && Math.min(W, H) >= 560) {
      const f = clip({ x: sa.l, y: 0, w: W - sa.l - sa.r, h: H });
      if (f.w >= f.h * 0.95) {
        // Plus large que haut : le plateau à gauche, toute la hauteur ; à droite le chat, puis la consigne et les cartes.
        const wb = Math.round(Math.min(400, Math.max(300, f.w * 0.38))), hb = Math.round(LOW_H * wb / STAGE_W);
        const chat = !!src.chat && f.h - hb > 220;
        return { kind: 'wide-side', a: { x: f.x, y: f.y, w: f.w - wb - 8, h: f.h },
          b: { x: f.x + f.w - wb, y: chat ? f.y + f.h - hb : f.y + Math.round((f.h - hb) / 2), w: wb, h: hb },
          c: chat ? { x: f.x + f.w - wb + 8, y: f.y + 10, w: wb - 16, h: f.h - hb - 18 } : undefined };
      }
      // Plus haut que large : le plateau en haut, toute la largeur ; dessous, la consigne et les cartes côte à côte.
      const hb = Math.round(ROW_H * Math.min(1.15, f.w / ROW_W)), top = f.y + Math.round(f.h * 0.4);
      return { kind: 'wide-stack', a: { x: f.x, y: f.y, w: f.w, h: f.h - hb }, b: { x: f.x, y: f.y + f.h - hb, w: f.w, h: hb },
        c: { x: f.x + 12, y: top, w: f.w - 24, h: f.y + f.h - hb - 8 - top } };
    }
    return null;
  };
  /** Montre la région [y0, y0 + hReg] de la scène `st`, centrée et à la plus grande échelle possible dans `fr`. */
  const showRegion = (st: HTMLElement, fr: HTMLElement, y0: number, hReg: number, wReg = STAGE_W) => {
    const w = fr.clientWidth, ht = fr.clientHeight;
    const s = Math.min(w / wReg, ht / hReg);
    st.style.transform = `translate(${(w - wReg * s) / 2}px,${(ht - hReg * s) / 2 - y0 * s}px) scale(${s})`;
  };
  const putFrame = (fr: HTMLElement, x: Box) => {
    fr.style.cssText = `inset:auto;left:${x.x}px;top:${x.y}px;width:${x.w}px;height:${x.h}px`;
  };
  const fit = () => {
    const P = panes();
    if (layout && (P?.kind === 'manette') !== (layout === 'manette')) requestAnimationFrame(() => { if (!disposed) render(); });
    const kind = P?.kind ?? 'phone';
    if (kind !== layout) {
      // Plier, déplier : les éléments du bas changent de volet, la partie continue (carte choisie comprise).
      (P?.b ? stage2 : stage).append(...lowEls);
      frame2.hidden = !P?.b;
      root.dataset.layout = kind;
      if (layout) {
        root.classList.remove('game--relayout');
        void root.offsetWidth;
        root.classList.add('game--relayout');
      }
      layout = kind;
    }
    tableJournal.hidden = !P?.j;
    if (P?.j) tableJournal.style.cssText = `left:${P.j.x}px;top:${P.j.y}px;width:${P.j.w}px;height:${P.j.h}px`;
    if (P) {
      putFrame(frame, P.a);
      const wide = P.kind === 'wide-side' || P.kind === 'wide-stack';
      if (P.kind === 'table') showRegion(stage, frame, TABLE_Y, TABLE_H - TABLE_Y);
      else showRegion(stage, frame, 0, wide ? BOARD_H : SPLIT_Y);
      stage2.classList.toggle('lowrow', P.kind === 'wide-stack');
      if (P.b) {
        putFrame(frame2, P.b);
        if (P.kind === 'wide-stack') showRegion(stage2, frame2, ROW_Y, ROW_H, ROW_W);
        else showRegion(stage2, frame2, SPLIT_Y, LOW_H);
      }
    } else {
      frame.style.cssText = '';
      const w = frame.clientWidth, ht = frame.clientHeight;
      const s = Math.min(w / STAGE_W, ht / STAGE_H);
      stage.style.transform = `translate(${(w - STAGE_W * s) / 2}px,${Math.max(0, (ht - STAGE_H * s) / 2)}px) scale(${s})`;
    }
    layoutHook(P);
    if (victoryInner) {
      const fr = victoryInner.parentElement!, w = fr.clientWidth, ht = fr.clientHeight;
      const s = Math.min(w / STAGE_W, ht / STAGE_H);
      victoryInner.style.transform = `translate(${(w - STAGE_W * s) / 2}px,${Math.max(0, (ht - STAGE_H * s) / 2)}px) scale(${s})`;
    }
  };
  allowLandscape(true);
  // Pendant une partie, la page ne défile pas (sinon l'iPhone peut la décaler en tournant).
  document.documentElement.classList.add('in-game');
  // iPhone : pendant une rotation, la taille passe par des valeurs intermédiaires ; on recale quand la mise en page
  // est stable (taille réelle de l'écran de jeu), puis encore un peu après la rotation.
  const sizeWatch = new ResizeObserver(() => { if (!disposed) fit(); });
  sizeWatch.observe(root);
  const settle = () => [120, 350, 800].forEach((ms) => setTimeout(() => {
    if (disposed) return;
    window.scrollTo(0, 0);
    fit();
  }, ms));
  window.addEventListener('orientationchange', settle);
  screen.orientation?.addEventListener?.('change', settle);
  mqFlex.addEventListener('change', fit);
  mqBook.addEventListener('change', fit);
  type Posture = EventTarget & { type: string };
  const posture = (navigator as Navigator & { devicePosture?: Posture }).devicePosture;
  posture?.addEventListener('change', fit);
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
  // Journal : les 4 derniers coups joués, pour savoir ce qui s'est passé (demandé par Mallory).
  const journal = h('div', { class: 'g-journal-pop', role: 'dialog', 'aria-label': 'Les 4 derniers coups', hidden: true });
  const journalBtn = h('button', { class: 'btn-round g-journal', type: 'button', 'aria-label': 'Derniers coups', 'aria-expanded': 'false', onclick: () => toggleJournal() });
  journalBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="4.5" cy="6" r="1.8" fill="currentColor"/><circle cx="4.5" cy="12" r="1.8" fill="currentColor"/><circle cx="4.5" cy="18" r="1.8" fill="currentColor"/></svg>';
  stage.append(h('div', { class: 'g-top' }, pauseButton(() => openPause()), rulesBtn, journalBtn, h('div', { class: 'g-top__mid' }, roundEl, turnEl), scoreEl), journal);

  // ---------- Plateau ----------
  const board = h('div', { class: 'board' });
  const pathLayer = h('div');
  const ghostLayer = h('div');
  const pawnLayer = h('div');
  const avLayer = h('div');
  const bubbleLayer = h('div');
  const fxBoard = h('div', { class: 'fx-layer', style: { zIndex: 1100 } });
  const discard = h('div', { class: 'discard' });
  /** Nombre de cartes restant dans la pioche, sur le paquet du centre */
  const deckCount = h('span', { class: 'pile__count', 'aria-label': 'Cartes dans la pioche' });
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
      h('div', { class: 'pad', style: { left: b.x, top: b.y, width: b.w, height: b.h, borderRadius: b.r, background: c.c, transform: `rotate(${b.rot}deg)` } });
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
      : hole(x, y, Z.hs, 'var(--hole-bg)', 'var(--hole-sh)'));
  });
  g.lanes.forEach((ln, arm) => {
    const c = tint((arm - armOf(N, me, 0) + N) % N);
    ln.forEach(([x, y]) => board.append(hole(x, y, Z.hs, c.c, 'var(--lane-sh)')));
    g.res[arm].forEach(([x, y]) => board.append(hole(x, y, Z.rs, 'var(--res-bg)', 'var(--res-sh)')));
  });
  board.append(pathLayer,
    h('div', { class: 'pile', style: { transform: `scale(${N === 4 ? 1 : 0.72})` } }, cardBack(), deckCount, discard),
    ghostLayer, pawnLayer, avLayer, bubbleLayer, fxBoard);
  stage.append(board);
  // Mode manette : une tablette sert de plateau ; à sa place, le téléphone montre les billes jouables, numérotées.
  const padPanel = h('div', { class: 'pad-panel', hidden: true });
  stage.append(padPanel);
  const fxScreen = h('div', { class: 'fx-layer', style: { zIndex: 38 } });
  stage.append(fxScreen);
  // BOUM : Toc surgit au bas du plateau, l'air ébahi.
  const tocPeek = () => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = h('div', { class: 'toc-peek', 'aria-hidden': 'true' }, mascot('surpris', 92));
    stage.append(el);
    const a = el.animate?.([
      { translate: '0 60px', opacity: 0 }, { translate: '0 0', opacity: 1, offset: 0.18 },
      { translate: '0 0', opacity: 1, offset: 0.82 }, { translate: '0 60px', opacity: 0 },
    ], { duration: 1700, easing: 'cubic-bezier(.3,1.4,.5,1)' });
    if (a) a.onfinish = () => el.remove();
    else setTimeout(() => el.remove(), 1700);
  };
  // Fin de partie en grand : tout l'écran aux couleurs de l'équipe gagnante.
  let victoryEl: HTMLElement | null = null;
  // Barre d'état de l'app installée : elle prend la couleur de l'écran de fin, puis retrouve la sienne.
  const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  let themeBefore: string | null = null;
  const setTheme = (col: string) => { if (!themeMeta) return; themeBefore ??= themeMeta.content; themeMeta.content = col; };
  /** Revanche en ligne : le bouton et qui est d'accord, mis à jour à chaque changement dans la salle. */
  let rematchUi: { btn: HTMLButtonElement; who: HTMLElement } | null = null;
  const renderRematch = () => {
    if (!rematchUi || !src.rematchVotes) return;
    const votes: RematchVote[] = src.rematchVotes(), ok = votes.filter((x) => x.ok).length, mine = votes.find((x) => x.me)?.ok;
    rematchUi.btn.textContent = mine ? `On attend les autres (${ok}/${votes.length})` : ok ? `Revanche (${ok}/${votes.length} d’accord)` : 'Revanche';
    rematchUi.btn.disabled = !!mine;
    rematchUi.who.replaceChildren(...votes.map((x) =>
      h('span', { class: 'victory__vote' + (x.ok ? ' victory__vote--ok' : '') }, `${x.ok ? '✓' : '…'} ${x.me ? 'Toi' : x.name}`)));
  };
  const closeVictory = () => {
    rematchUi = null;
    closeEndChat();
    victoryEl?.remove();
    victoryEl = null;
    victoryInner = null;
    if (themeMeta && themeBefore !== null) themeMeta.content = themeBefore;
    themeBefore = null;
  };
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
  const avEls: { root: HTMLElement; pulse: HTMLElement; spin: HTMLElement; cards: HTMLElement; chip: HTMLElement; meTag: HTMLElement | null }[] = [];
  for (let s = 0; s < N; s++) {
    const [x, y] = g.avs[armOf(N, me, s)];
    const size = Z.av, ring = tint(s).c, isMe = s === me && !watching;
    const pl = isMe ? { ...src.players[s], ...draftProfile() } : src.players[s];
    const pulse = h('div', { class: 'seat-av__pulse', style: { background: ring } });
    const spin = h('div', { class: 'seat-av__spin', style: { borderColor: ring } });
    const vert = Math.abs(x - 180) < 20;
    // Pastille du nombre de cartes : côté extérieur, à l'opposé du nom (au-dessus du plateau, pas sur ses trous).
    const cards = h('span', { class: 'seat-av__cards', style: { ...(x > 200 && !vert ? { right: '-8px' } : { left: '-8px' }), ...(y < 180 && !vert ? { top: 'auto', bottom: '-6px' } : {}) } });
    // Nom centré sous (ou sur) l'avatar ; aux coins, aligné sur le bord pour rester entier (avec « Commence », « Ensuite »).
    const across = x < 120 ? { left: '-4px' } : x > 273 ? { right: '-4px' } : { left: '50%', transform: 'translateX(-50%)' };
    const tag = vert && y < 180 ? { left: size + 8 + 'px', top: size / 2 - 9 + 'px' }
      : y < 180 ? { ...across, bottom: size + 2 + 'px' }
        : { ...across, top: size + 5 + 'px' };
    // À 6, les persos des côtés sont près des billes : l'étiquette passe sous le nom (moins large).
    const nameCls = 'seat-av__name' + (N === 6 && !vert ? ` seat-av__name--stack${x > 200 ? ' seat-av__name--end' : ''}` : '');
    // Qui commence la donne (pendant la donne et l'échange), puis qui joue après le joueur actif.
    const chip = h('i', { class: 'seat-av__chip', hidden: true });
    const meTag = isMe ? h('span', { class: nameCls, style: tag, hidden: true }, 'Toi', chip) : null;
    const rootAv = h('div', { class: 'seat-av', style: { left: r1(x - size / 2), top: r1(y - size / 2), width: size, height: size } },
      pulse,
      spin,
      h('div', { class: 'seat-av__disc', style: { boxShadow: `0 0 0 3px ${ring},0 6px 12px rgba(70,40,20,.25)` } }),
      h('div', { style: { position: 'absolute', inset: 0 } }, avatar(pl.char, pl.color, size)),
      cards,
      isMe ? meTag : h('span', { class: nameCls, style: tag }, pl.name, chip));
    avEls[s] = { root: rootAv, pulse, spin, cards, chip, meTag };
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
  const bubble = (s: number, t: string, ms = 2200, long = false) => {
    if (s < 0) return;
    const [x, y] = g.avs[armOf(N, me, s)];
    const b = h('div', { class: 'emote-bubble', style: { left: r1(Math.min(290, Math.max(70, x))), top: r1(y < 60 ? y + Z.av / 2 + 18 : y - Z.av / 2 - 44) } }, t);
    bubbleLayer.querySelectorAll(`[data-seat="${s}"]`).forEach((n) => n.remove());
    b.dataset.seat = String(s);
    bubbleLayer.append(b);
    if (long) b.classList.add('emote-bubble--chat');
    // Une bulle longue (message du chat) reste entière : on la recale dans la largeur de l'écran,
    // et au-dessus d'un perso elle grandit vers le haut.
    const half = b.offsetWidth / 2;
    if (half) b.style.left = `${r1(Math.min(393 - 8 - half, Math.max(8 + half, x)))}px`;
    if (long && y >= 60) b.style.top = `${r1(y - Z.av / 2 - 10 - b.offsetHeight)}px`;
    setTimeout(() => b.remove(), ms);
  };
  const emoteBtn = h('button', { class: 'btn-round btn-round--lg emote-btn', type: 'button', 'aria-label': 'Émotes', 'aria-expanded': 'false' },
    h('i', null, h('span'), h('span'), h('span')));
  const emotePop = h('div', { class: 'pop pop--emotes', hidden: true },
    ...EMOTES.map((t) => h('button', { type: 'button', onclick: () => sendEmote(t) }, t)));
  // Chat de table (en ligne) : toute la table voit la conversation ; les messages des autres passent aussi en bulle.
  const chatList = h('div', { class: 'table-chat__list', 'aria-live': 'polite' });
  const chatInput = h('input', { class: 'table-chat__input', type: 'text', maxlength: 140, placeholder: 'Écrire à la table…', 'aria-label': 'Message à la table', enterkeyhint: 'send', autocomplete: 'off' }) as HTMLInputElement;
  const chatForm = h('form', { class: 'table-chat__form' }, chatInput, h('button', { type: 'submit', class: 'table-chat__send' }, 'Envoyer'));
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = chatInput.value.trim();
    if (!t || !src.chat) return;
    src.chat(t);
    chatInput.value = '';
    chatBubble(me, t);
  });
  // Fermer : la croix, le bouton bulle, ou un toucher ailleurs sur l'écran.
  const chatClose = h('button', { class: 'table-chat__close', type: 'button', 'aria-label': 'Fermer le chat' }, '×');
  /** Message du chat en bulle sur le plateau : jusqu'à 90 caractères, sur plusieurs lignes, le temps de le lire. */
  const chatBubble = (s: number, t: string) => bubble(s, t.length > 90 ? t.slice(0, 89) + '…' : t, Math.min(9000, 3000 + t.length * 70), true);
  const chatPop = h('div', { class: 'pop pop--chat', hidden: true, role: 'dialog', 'aria-label': 'Chat de la table' },
    h('div', { class: 'table-chat__head' }, h('span', { class: 'pop__title' }, 'Chat de la table'), chatClose), chatList, !watching && chatForm);
  const chatBadge = h('span', { class: 'emote-btn__badge', hidden: true });
  // Tiroir du chat (parties en ligne) : replié, une barre sous les cartes (dernier message, « Écrire ») ;
  // ouvert, le chat à la place des cartes, jamais sur le plateau. Il se replie quand c'est ton tour.
  const drawerOn = !!src.chat && !watching;
  if (src.chat && !drawerOn) { emoteBtn.append(chatBadge); emoteBtn.setAttribute('aria-label', 'Émotes et chat de la table'); }
  const lastLine = h('div', { class: 'chat-drawer__last chat-drawer__last--empty' }, 'Chat de la table : écris aux autres');
  const drawerBadge = h('span', { class: 'emote-btn__badge chat-drawer__badge', hidden: true });
  const writeBtn = h('button', { class: 'chat-drawer__write', type: 'button' }, 'Écrire');
  const drawerBar = h('div', { class: 'chat-drawer__bar', role: 'button', tabindex: 0, 'aria-label': 'Ouvrir le chat de la table' },
    h('i', { class: 'chat-drawer__grip' }), lastLine, drawerBadge, writeBtn);
  const drawerStatus = h('span', { class: 'chat-drawer__status' });
  const drawerClose = h('button', { class: 'chat-drawer__close', type: 'button', 'aria-label': 'Replier le chat' }, h('i'));
  const drawerHead = h('div', { class: 'chat-drawer__head' }, h('b', null, 'Chat de la table'), drawerStatus, drawerClose);
  const drawerPanel = h('div', { class: 'chat-drawer__panel', hidden: true, role: 'dialog', 'aria-label': 'Chat de la table' },
    h('i', { class: 'chat-drawer__grip' }), drawerHead);
  const drawer = h('div', { class: 'chat-drawer', hidden: !drawerOn }, drawerBar, drawerPanel);
  if (drawerOn) drawerPanel.append(chatList, chatForm);
  let drawerOpen = false;
  // Grand écran : le chat sort de la scène. Plus large que haut, une colonne toujours ouverte ; plus haut que large,
  // une feuille qui s'ouvre depuis la barre, par-dessus le bas du plateau.
  const sideStatus = h('span', { class: 'chat-drawer__status' });
  const sideClose = h('button', { class: 'chat-drawer__close', type: 'button', 'aria-label': 'Replier le chat' }, h('i'));
  const sideChat = h('div', { class: 'side-chat', hidden: true, role: 'complementary', 'aria-label': 'Chat de la table' },
    h('div', { class: 'side-chat__head' }, h('b', null, 'Chat de la table'), sideStatus, sideClose));
  root.append(sideChat);
  const wideChat = () => layout === 'wide-side' || layout === 'wide-stack';
  /** Le chat est-il sous les yeux ? (sinon les messages qui arrivent comptent comme pas lus) */
  const chatVisible = () => (drawerOn ? layout === 'wide-side' || drawerOpen : !chatPop.hidden);
  /** Range la liste et le champ du chat là où il s'affiche selon la mise en page. */
  const homeChat = () => {
    if (!drawerOn) chatPop.append(chatList, chatForm);
    else if (wideChat()) sideChat.append(chatForm, chatList);
    else drawerPanel.append(chatList, chatForm);
  };
  const syncDrawer = () => {
    if (!drawerOn) return;
    const side = layout === 'wide-side', stack = layout === 'wide-stack';
    sideChat.hidden = !(side || (stack && drawerOpen));
    sideChat.classList.toggle('side-chat--sheet', stack);
    drawerPanel.hidden = side || stack || !drawerOpen;
    drawerBar.hidden = side || drawerOpen;
  };
  sideClose.addEventListener('click', () => setDrawer(false));
  const setDrawer = (open: boolean, write = false) => {
    if (!drawerOn) return;
    drawerOpen = open;
    syncDrawer();
    if (open) {
      unread = 0;
      showUnread();
      chatList.scrollTop = chatList.scrollHeight;
      if (write) { startTyping(); chatInput.focus({ preventScroll: true }); }
    } else {
      chatInput.blur();
      stopTyping();
    }
  };
  drawerBar.addEventListener('click', () => setDrawer(true));
  writeBtn.addEventListener('click', (e) => { e.stopPropagation(); setDrawer(true, true); });
  drawerClose.addEventListener('click', () => setDrawer(false));
  // Glisser vers le haut sur la barre ouvre, vers le bas sur l'en-tête replie.
  const swipe = (el: HTMLElement, dir: 1 | -1, act: () => void) => {
    let y0 = NaN;
    el.addEventListener('pointerdown', (e) => { y0 = e.clientY; });
    el.addEventListener('pointerup', (e) => { if ((e.clientY - y0) * dir > 24) act(); y0 = NaN; });
  };
  swipe(drawerBar, -1, () => setDrawer(true));
  swipe(drawerHead, 1, () => setDrawer(false));
  // Pendant la saisie, le chat monte en haut de l'écran, au-dessus du clavier (téléphone en portrait).
  // Pendant la saisie (téléphone, ou pliant tenu en hauteur) : le chat se cale dans la partie visible au-dessus du clavier.
  // L'iPhone fait glisser la page pour montrer le champ : on suit la zone visible (visualViewport), rien n'est coupé.
  // On déplace le panneau, jamais le champ (le déplacer lui ferait perdre le clavier).
  let typing = false;
  let chatBox: Box | undefined;
  const vv = window.visualViewport;
  const placeTyping = () => {
    if (!typing) return;
    const safeTop = probe('padding-top:env(safe-area-inset-top)').t;
    const vTop = vv?.offsetTop ?? 0, vH = vv?.height ?? innerHeight;
    // Clavier pas encore ouvert : on place déjà le champ assez haut pour que l'iPhone n'ait pas à faire glisser la page.
    const kbd = vH < innerHeight * 0.8;
    const top = Math.max(vTop + 8, safeTop + 4);
    const bottom = kbd ? Math.max(top + 140, vTop + vH - 8) : top + Math.min(330, innerHeight * 0.42);
    if (layout === 'wide-stack') {
      sideChat.style.top = `${Math.round(top)}px`;
      sideChat.style.height = `${Math.round(bottom - top)}px`;
      return;
    }
    const r = drawer.parentElement!.getBoundingClientRect(), k = r.width / STAGE_W;
    drawerPanel.style.top = `${(top - r.top) / k}px`;
    drawerPanel.style.height = `${(bottom - top) / k}px`;
  };
  const startTyping = () => {
    if (typing || !drawerOpen || !(layout === 'phone' || layout === 'wide-stack')) return;
    typing = true;
    drawer.classList.add('chat-drawer--typing');
    placeTyping();
    // Le clavier et le glissement de la page arrivent juste après : on recale.
    [100, 250, 500, 900].forEach((ms) => setTimeout(placeTyping, ms));
    chatList.scrollTop = chatList.scrollHeight;
  };
  function stopTyping() {
    if (!typing) return;
    typing = false;
    drawer.classList.remove('chat-drawer--typing');
    drawerPanel.style.top = drawerPanel.style.height = '';
    if (chatBox) sideChat.style.cssText = `left:${chatBox.x}px;top:${chatBox.y}px;width:${chatBox.w}px;height:${chatBox.h}px`;
  }
  vv?.addEventListener('resize', placeTyping);
  vv?.addEventListener('scroll', placeTyping);
  // L'iPhone peut aussi faire défiler toute la page : pendant la saisie, on la remet en place et on recale le chat.
  const onPageScroll = () => {
    if (!typing) return;
    if (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop) window.scrollTo(0, 0);
    placeTyping();
  };
  window.addEventListener('scroll', onPageScroll, true);
  chatInput.addEventListener('focus', startTyping);
  chatInput.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== chatInput) stopTyping(); }, 300));
  chatForm.addEventListener('submit', () => { if (drawerOpen) chatInput.focus(); });
  let unread = 0;
  const renderChat = (lines: TableMsg[]) => {
    chatList.replaceChildren(...(lines.length ? lines.slice(-40).map((m) => h('div', { class: 'table-chat__line' + (m.mine ? ' table-chat__line--me' : '') },
      h('b', { style: { color: m.seat >= 0 ? COL[SEAT_COLORS[N][m.seat]].c : 'var(--ink-2)' } }, m.mine ? 'Toi' : m.name), h('span', null, m.t)))
      : [h('span', { class: 'table-chat__empty' }, 'Personne n’a encore écrit. Lance la discussion !')]));
    chatList.scrollTop = chatList.scrollHeight;
    const last = lines[lines.length - 1];
    lastLine.classList.toggle('chat-drawer__last--empty', !last);
    lastLine.replaceChildren(...(last ? [h('b', { style: { color: last.seat >= 0 ? COL[SEAT_COLORS[N][last.seat]].d : 'var(--ink-2)' } }, last.mine ? 'Toi' : last.name), h('span', null, last.t)]
      : ['Chat de la table : écris aux autres']));
  };
  const setEmotes = (open: boolean) => {
    emotePop.hidden = !open;
    emoteBtn.setAttribute('aria-expanded', String(open));
    chatPop.hidden = !open || !src.chat || drawerOn;
    if (open && !drawerOn) { unread = 0; showUnread(); chatList.scrollTop = chatList.scrollHeight; }
  };
  /** Écran de fin : bouton « Discuter avec la table » et sa pastille. */
  const endBadge = h('span', { class: 'emote-btn__badge', hidden: true });
  const showUnread = () => {
    for (const b of [chatBadge, endBadge, drawerBadge]) { b.textContent = String(unread); b.hidden = !unread; }
  };
  // Après la partie, on continue de discuter : le chat s'ouvre par-dessus l'écran de fin (en haut, le clavier ne le cache pas).
  let endChat: HTMLElement | null = null;
  const closeEndChat = () => {
    if (!endChat) return;
    homeChat();
    endChat.remove();
    endChat = null;
  };
  const openEndChat = () => {
    if (endChat || !victoryInner) return;
    unread = 0;
    showUnread();
    endChat = h('div', { class: 'victory__chatsheet', role: 'dialog', 'aria-label': 'Chat de la table' },
      h('div', { class: 'table-chat__head' }, h('span', { class: 'pop__title' }, 'Chat de la table'),
        h('button', { class: 'table-chat__close', type: 'button', 'aria-label': 'Fermer le chat', onclick: closeEndChat }, '×')),
      chatList, chatForm);
    victoryInner.append(endChat);
    chatList.scrollTop = chatList.scrollHeight;
  };
  emoteBtn.addEventListener('click', () => setEmotes(!!emotePop.hidden));
  chatClose.addEventListener('click', () => setEmotes(false));
  const closeOutside = (e: Event) => {
    if (emotePop.hidden) return;
    const t = e.target as Node;
    if (!chatPop.contains(t) && !emotePop.contains(t) && !emoteBtn.contains(t)) setEmotes(false);
  };
  document.addEventListener('pointerdown', closeOutside, true);
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
  stage.append(toastBox, chatPop, emotePop, choicePop);

  // ---------- Barre d'action, minuteur, main ----------
  const hintT = h('b');
  const hintS = h('span');
  // « Une astuce ? » : propose un bon coup (le robot le choisit) sans le jouer à la place du joueur.
  const tipBtn = h('button', { class: 'g-tip', type: 'button', onclick: () => suggest() }, 'Une astuce ?');
  const resetSeven = h('button', { class: 'g-tip', type: 'button', onclick: () => { split = new Map(); render(); } }, 'Recommencer le partage');
  const playBtn = button('Jouer', 'primary', () => commit());
  playBtn.classList.add('g-play');
  // Initiation : Toc, la mascotte, remplace la bulle d'émotes et réagit à chaque leçon.
  const coach = h('div', { class: 'g-coach', 'aria-hidden': 'true' });
  let coachMood = '';
  const setCoach = (m: MascotMood) => {
    if (m === coachMood) return;
    coachMood = m;
    coach.replaceChildren(mascot(m, 64, 'buste'));
    coach.classList.remove('g-coach--pop');
    void coach.offsetWidth;
    coach.classList.add('g-coach--pop');
  };
  if (src.initiation) setCoach('content');
  const actions = h('div', { class: 'g-actions' }, src.initiation ? coach : emoteBtn, h('div', { class: 'g-hint', 'aria-live': 'polite' }, hintT, hintS, tipBtn, resetSeven), playBtn);
  const timerBar = h('div');
  const timerEl = h('div', { class: 'g-timer', 'aria-hidden': 'true' }, timerBar);
  const hand = h('div', { class: 'hand' });
  stage.append(actions, timerEl, hand);
  lowEls.push(actions, timerEl, hand, drawer);
  root.classList.toggle('with-drawer', drawerOn);
  layoutHook = (P) => {
    if (!drawerOn) return;
    chatBox = P?.c;
    if (P?.c && !typing) sideChat.style.cssText = `left:${P.c.x}px;top:${P.c.y}px;width:${P.c.w}px;height:${P.c.h}px`;
    const home = wideChat() ? sideChat : drawerPanel;
    if (!endChat && chatList.parentElement !== home) homeChat();
    if (layout === 'wide-side') { unread = 0; showUnread(); }
    syncDrawer();
  };

  // ---------- Sélection ----------
  let sel: number | null = null;
  let jokerAs: Rank | null = null;
  let pick: PawnRef | null = null;
  let target: PawnRef | null = null;
  let split = new Map<string, number>();
  /** Explication de l'astuce affichée tant que sa sélection est en place. */
  let tip: string | null = null;
  /** Bille devant sa maison : la rentrer, refaire un tour, ou défausser (si refaire un tour est le seul coup). */
  type Way = 'home' | 'lap' | 'discard';
  let way: Way | null = null;
  const clearSel = () => { sel = null; jokerAs = null; pick = null; target = null; split = new Map(); tip = null; way = null; };

  const myHand = () => (watching ? [] : view.hands[me] ?? []);
  const myTurn = () => !watching && !busy && view.phase === 'play' && view.turn === me;
  // L'échange se choisit même pendant l'animation de distribution.
  const giving = () => !watching && view.phase === 'exchange' && !view.exchange[me];

  interface Plan {
    moves: Move[];
    chosen: Move | null;
    cands: PawnRef[];
    targets: PawnRef[];
    jokerValues: Rank[];
    sevenPawns: PawnRef[];
    /** Plusieurs façons de jouer la même bille (devant sa maison) : le joueur choisit */
    ways?: Way[];
  }
  const decide = (opts: Move[], ms: Move[]): { chosen: Move | null; ways: Way[] } => {
    const by: Partial<Record<Way, Move>> = { home: opts.find((m) => !isLap(m)), lap: opts.find((m) => isLap(m)) };
    if (by.lap) by.discard = ms.find((m) => m.kind === 'discard');
    const ways = (['home', 'lap', 'discard'] as const).filter((w) => by[w]);
    if (ways.length <= 1) return { chosen: ways.length ? by[ways[0]]! : null, ways: [] };
    return { chosen: way && by[way] ? by[way]! : null, ways };
  };
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
      const same = play.filter((m) => m.kind === 'seven' && m.parts.map((p) => [key(p.pawn), p.steps] as const).sort().map(([k, n]) => `${k},${n}`).join(',') === want);
      const { chosen, ways } = decide(same, ms);
      return { moves: ms, chosen, cands, targets: [], jokerValues, ways, sevenPawns: play.some((m) => m.kind === 'seven' && m.parts.length > 1) ? cands : [] };
    }
    if (!pick) return { moves: ms, chosen: null, cands, targets: [], jokerValues, sevenPawns: [] };
    const mine = play.filter((m): m is Exclude<typeof m, { kind: 'seven' }> => m.kind !== 'seven' && sameRef(m.pawn, pick!));
    if (mine[0]?.kind === 'swap') {
      const targets = mine.map((m) => (m.kind === 'swap' ? m.target : m.pawn));
      if (!target && targets.length === 1) target = targets[0];
      const chosen = target ? mine.find((m) => m.kind === 'swap' && sameRef(m.target, target!)) ?? null : null;
      return { moves: ms, chosen, cands, targets, jokerValues, sevenPawns: [] };
    }
    const { chosen, ways } = decide(mine, ms);
    return { moves: ms, chosen, cands, targets: [], jokerValues, ways, sevenPawns: [] };
  };

  const onPawn = (r: PawnRef) => {
    const pl = plan();
    tip = null; // le joueur choisit lui-même : l'explication de l'astuce ne vaut plus
    if (pl.targets.some((t) => sameRef(t, r))) target = r;
    else if (pl.cands.some((c) => sameRef(c, r))) {
      if (pl.sevenPawns.length && pick) giveStep(r, pl);
      else {
        pick = r;
        target = null;
        split = new Map();
        way = null;
      }
    } else return;
    render();
  };

  /**
   * Partage du 7. Une nouvelle bille touchée : on passe directement au partage jouable le plus proche
   * (ex. ta dernière bille +2 et les 5 autres pas pour ton partenaire), au lieu d'ajouter les pas un à un.
   * Une bille déjà dans le partage : elle gagne un pas, pris sur la bille qui en a le plus.
   * Si on touche une nouvelle bille alors que le partage est au maximum de billes (deux, en règle de base),
   * elle prend la place de celle qui a le moins de pas.
   */
  const giveStep = (r: PawnRef, pl: Plan) => {
    const k = key(r);
    const cur = new Map([...split].filter(([, n]) => n > 0));
    if (!cur.has(k)) {
      const near = pl.moves
        .filter((m): m is Extract<Move, { kind: 'seven' }> => m.kind === 'seven' && m.parts.some((p) => sameRef(p.pawn, r)))
        .map((m) => {
          const parts = new Map(m.parts.map((p) => [key(p.pawn), p.steps] as const));
          // Écart avec le partage en cours (une bille retirée compte tous ses pas).
          const dist = [...cur].reduce((a, [kk, n]) => a + Math.abs((parts.get(kk) ?? 0) - n), 0);
          return { parts, dist, mine: parts.get(k) ?? 0 };
        })
        .sort((a, b) => a.dist - b.dist || b.mine - a.mine)[0];
      if (near) {
        split = near.parts;
        return;
      }
    }
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
  const walk = (p: number, steps: number, lap = false) => {
    const out: number[] = [];
    for (let k = 0; k < Math.abs(steps); k++) out.push((p = steps > 0 ? (lap && p === homeEntry(N) ? 0 : stepForward(N, p)) : (p - 1 + L) % L));
    return out;
  };

  /** Écran de table : le coup que prépare le joueur dont c'est le tour (envoyé par son téléphone). */
  const aimedMove = (): Move | null => {
    const raw = view.phase === 'play' ? src.aims?.[view.turn]?.m : '';
    if (!raw) return null;
    try { return JSON.parse(raw) as Move; } catch { return null; }
  };
  /** Écran de table : le partage du 7 en cours sur le téléphone du joueur, même incomplet (« s.i:n,… »). */
  const aimedSplit = (): [string, number][] => {
    const raw = view.phase === 'play' ? src.aims?.[view.turn]?.sp : '';
    return (raw ? raw.split(',') : []).map((x) => x.split(':')).filter((x) => x.length === 2 && Number(x[1]) > 0)
      .map(([k, n]) => [k, Number(n)] as [string, number]);
  };
  /** Le coup prend-il une bille ? Sur la tablette, la main du joueur n'est pas connue : on y met la carte jouée. */
  const captures = (m: Move) => {
    try {
      const st = watching ? { ...view, hands: view.hands.map((hd, k) => (k === view.turn ? [m.card] : hd ?? [])) } : view;
      return applyMove(st, m).lastCaptures.length > 0;
    } catch { return false; }
  };

  const preview = (pl: Plan) => {
    pathLayer.replaceChildren();
    ghostLayer.replaceChildren();
    const m = watching ? aimedMove() : pl.chosen;
    const sevenSplit = watching ? aimedSplit() : [...split].filter(([, n]) => n > 0);
    if (sevenSplit.length && (!m || m.kind === 'seven')) return previewSeven(sevenSplit, m);
    if (m?.kind === 'swap') {
      // Valet : une ligne animée relie les deux billes qui vont s'échanger, avant de confirmer.
      const [x1, y1] = xy(m.pawn.s, m.pawn.i, view.pawns[m.pawn.s][m.pawn.i].p);
      const [x2, y2] = xy(m.target.s, m.target.i, view.pawns[m.target.s][m.target.i].p);
      const len = Math.hypot(x2 - x1, y2 - y1), ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      pathLayer.append(
        h('div', { class: 'swap-line', style: { left: r1(x1), top: r1(y1), width: r1(len), transform: `rotate(${r1(ang)}deg)` } }),
        h('div', { class: 'swap-mid', style: { left: r1((x1 + x2) / 2), top: r1((y1 + y2) / 2) } }, '⇄'));
      const z = Z.ps + 10;
      for (const [x, y] of [[x1, y1], [x2, y2]]) ghostLayer.append(h('div', { class: 'ghost ghost--swap', style: { left: r1(x - z / 2), top: r1(y - z / 2), width: z, height: z } }));
      return false;
    }
    if (!m || m.kind === 'discard') return false;
    const cap = captures(m);
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
      const ps = walk(view.pawns[m.pawn.s][m.pawn.i].p, m.steps, m.lap);
      dots(m.pawn.s, ps);
      ghost(m.pawn.s, m.pawn.i, ps[ps.length - 1]);
    } else {
      const cur = new Map<string, number>();
      for (const part of m.parts) {
        const k = key(part.pawn);
        const ps = walk(cur.get(k) ?? view.pawns[part.pawn.s][part.pawn.i].p, part.steps, part.lap);
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
    const cap = ok && captures(m!);
    const edge = !ok ? 'var(--ink-3)' : cap ? 'var(--ink)' : 'var(--coral)';
    const tag = (x: number, y: number, text: string, color: string, arrival: boolean) =>
      ghostLayer.append(h('div', { class: 'seven-tag' + (arrival ? ' seven-tag--arrival' : ''), style: { left: r1(x), top: r1(y), borderColor: color } }, text));
    for (const [k, n] of parts) {
      const [s, i] = k.split('.').map(Number);
      const p0 = view.pawns[s][i].p;
      const ps = walk(p0, n, m?.kind === 'seven' && m.parts.some((p) => key(p.pawn) === k && p.lap));
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

  // ---------- Pioche : un vrai paquet, mélangé à chaque manche, donnes de 5, 4 puis 4 cartes ----------
  /** Cartes restant dans la pioche (comme sur la table) et taille de la prochaine donne (null : nouvelle manche, paquet remélangé). */
  const deckLeft = () => {
    const k = view.dealNo % DEAL_CYCLE.length;
    const total = (52 + view.variants.jokers) * decksFor(N);
    // Avant la distribution (« On distribue… »), la donne en cours n'est pas encore sortie du paquet.
    const dealt = DEAL_CYCLE.slice(0, view.phase === 'deal' ? k : k + 1).reduce((a, b) => a + b, 0) * N;
    const nextK = (k + 1) % DEAL_CYCLE.length;
    return { left: Math.max(0, total - dealt), next: view.phase === 'deal' ? DEAL_CYCLE[k] : nextK === 0 ? null : DEAL_CYCLE[nextK] };
  };
  const deckText = () => {
    const { left, next } = deckLeft();
    return `Pioche : ${left} carte${left > 1 ? 's' : ''} · ${next === null ? 'ensuite : nouveau paquet mélangé' : `${view.phase === 'deal' ? 'donne de' : 'prochaine donne :'} ${next} cartes`}`;
  };

  // ---------- Journal des derniers coups ----------
  /** Le texte du moteur (« @2 avance un pion de 5 et renvoie à la base @1 ») dit avec les mots de l'app. */
  const logText = (text: string, seat: number) => text
    .replace(new RegExp(`^@${seat} `), '')
    // Les parenthèses du moteur : le partage du 7 (« 4 + 3 ») est gardé, le nom de la carte (déjà montrée) retiré.
    .replace(/ \(([^)]*)\)/g, (_, inner: string) => (inner.includes('+') ? ` : ${inner}` : ''))
    .replace(/ et renvoie à la base (.*)$/, ' : BOUM sur $1')
    .replace(/un autre de ses pions/g, 'une autre de ses billes').replace(/un de ses pions/g, 'une de ses billes')
    .replace(/un pion/g, 'une bille').replace(/ses pions/g, 'ses billes').replace(/pion/g, 'bille')
    .replace(/@(\d+)/g, (_, k: string) => nameOf(Number(k)));
  const journalRows = (count: number) => {
    const moves = view.log.filter((e) => e.card || /défausse/.test(e.text)).slice(-count).reverse();
    return moves.length ? moves.map((e) => {
        const c = e.card ? cardLook(e.card, view.variants) : null;
        return h('div', { class: 'g-journal-row' },
          h('i', { style: { background: tint(e.seat).c } }),
          h('span', { class: 'g-journal-text' }, h('b', null, nameOf(e.seat)), ' ' + logText(e.text, e.seat)),
          c && h('span', { class: 'g-journal-card', style: { color: c.red ? '#e5482a' : '#2b2a3d' } }, c.r + c.s));
      }) : [h('span', { class: 't-body' }, 'Aucun coup pour l’instant.')];
  };
  const renderJournal = () => {
    if (journal.hidden) return;
    journal.replaceChildren(h('span', { class: 't-label' }, 'Les 4 derniers coups'), h('span', { class: 'g-deck-line' }, deckText()), ...journalRows(4));
  };
  const toggleJournal = (open = journal.hidden) => {
    journal.hidden = !open;
    journalBtn.setAttribute('aria-expanded', String(open));
    renderJournal();
  };
  // Un toucher ailleurs referme le journal.
  const closeJournalOutside = (e: Event) => {
    if (!journal.hidden && !journal.contains(e.target as Node) && !journalBtn.contains(e.target as Node)) toggleJournal(false);
  };
  document.addEventListener('pointerdown', closeJournalOutside, true);

  // ---------- Initiation : une leçon au moment où elle sert ----------
  interface Lesson { id: string; mood: MascotMood; title: string; text: () => string; ranks: () => string[]; when: () => boolean }
  const reserve = () => view.pawns[me].some((pw) => pw.p < 0);
  const onTrack = () => view.pawns[me].filter((pw) => pw.p >= 0 && !inHome(N, pw.p)).length;
  const has = (r: string) => myHand().some((c) => rankOf(c) === r);
  const myMoves = () => myHand().flatMap((c) => legalMovesFor(view, me, c));
  const homeBefore = () => view.pawns[me].filter((pw) => inHome(N, pw.p)).length;
  const LESSONS: Lesson[] = [
    {
      id: 'echange', mood: 'concentre', title: 'L’échange', ranks: () => (has('9') ? ['9'] : []), when: () => giving(),
      text: () => `Passe une carte à ${nameOf(partner(N, me))}, face cachée.${has('9') ? ' Garde l’As, le Roi et le 7 : donne le 9.' : ' Garde tes As, Rois et 7.'}`,
    },
    {
      id: 'sortir', mood: 'content', title: 'Sortir une bille', ranks: () => ['A', 'K'], when: () => myTurn() && reserve() && (has('A') || has('K')),
      text: () => 'L’As et le Roi sortent une bille de ta réserve sur ta case de départ. Touche l’As, puis Jouer.',
    },
    {
      id: 'boum', mood: 'surpris', title: 'BOUM !', when: () => myTurn() && myMoves().some((m) => m.kind !== 'discard' && applyMove(view, m).lastCaptures.some((c) => teamOf(N, c.s) !== teamOf(N, me))),
      ranks: () => myMoves().filter((m) => m.kind !== 'discard' && applyMove(view, m).lastCaptures.some((c) => teamOf(N, c.s) !== teamOf(N, me))).map((m) => rankOf(m.card)),
      text: () => 'Une de tes cartes tombe pile sur une bille adverse : elle retourne dans sa réserve !',
    },
    {
      id: 'maison', mood: 'vainqueur', title: 'Rentrer à la maison', when: () => myTurn() && myMoves().some((m) => m.kind !== 'discard' && applyMove(view, m).pawns[me].filter((pw) => inHome(N, pw.p)).length > homeBefore()),
      ranks: () => myMoves().filter((m) => m.kind !== 'discard' && applyMove(view, m).pawns[me].filter((pw) => inHome(N, pw.p)).length > homeBefore()).map((m) => rankOf(m.card)),
      text: () => 'Au compte exact, ta bille entre dans ta maison. Les 4 rentrées, tu joues celles de ton partenaire.',
    },
    {
      id: 'sept', mood: 'concentre', title: 'Le 7 se partage', ranks: () => ['7'], when: () => myTurn() && has('7') && onTrack() >= 2,
      text: () => 'Touche le 7, puis tes deux billes : chacune reçoit une part des 7 pas.',
    },
    {
      id: 'quatre', mood: 'concentre', title: 'Le 4 recule', ranks: () => ['4'], when: () => myTurn() && has('4') && onTrack() >= 1,
      text: () => 'Le 4 fait reculer de 4 trous. Juste après ton départ, ça te rapproche de ta maison !',
    },
    {
      id: 'valet', mood: 'surpris', title: 'Le Valet échange', ranks: () => ['J'], when: () => myTurn() && myMoves().some((m) => m.kind === 'swap'),
      text: () => 'Le Valet échange une de tes billes avec une autre bille du parcours, même adverse.',
    },
    {
      id: 'avancer', mood: 'content', title: 'Avancer', ranks: () => [], when: () => myTurn() && myMoves().some((m) => m.kind === 'step' && m.steps > 0 && !['7', '4'].includes(rankOf(m.card))),
      text: () => 'Les autres cartes avancent d’autant de trous : le 9 de 9, la Dame de 12.',
    },
    {
      id: 'defausse', mood: 'surpris', title: 'Aucun coup possible', ranks: () => [], when: () => myTurn() && myMoves().every((m) => m.kind === 'discard'),
      text: () => 'Aucune carte ne peut jouer : tu passes, et tu défausses.',
    },
  ];
  const learned = new Set<string>();
  let lesson: Lesson | null = null;
  let lessonNo = 0;
  let lessonFor = '';
  /**
   * La leçon à montrer maintenant (une seule à la fois), recalculée à chaque nouvel état et quand ton tour
   * commence vraiment (après les animations). Une leçon compte comme vue dès qu'elle s'affiche.
   */
  const currentLesson = () => {
    if (!src.initiation) return null;
    const active = myTurn() || giving();
    const id = `${view.v}|${view.phase}|${myHand().join()}|${active}`;
    if (id !== lessonFor) {
      lessonFor = id;
      lesson = active ? LESSONS.find((l) => !learned.has(l.id) && l.when()) ?? null : null;
      if (lesson) {
        learned.add(lesson.id);
        lessonNo = learned.size;
        if (lessonNo === LESSONS.length) setTimeout(() => toast('Dernière leçon : tu connais toutes les règles !', 2200), 300);
      }
    }
    return lesson;
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
    deckCount.textContent = String(deckLeft().left);
    turnEl.textContent = view.phase === 'over' ? 'Partie terminée'
      : view.phase === 'deal' ? 'On distribue…'
        : view.phase === 'exchange' ? (watching ? 'Échange des cartes…' : view.exchange[me] ? 'On attend les autres…' : `Une carte pour ${nameOf(partner(N, me))}`)
          : view.turn === me && !watching ? `À toi de jouer, ${nick}` : `Tour de ${nameOf(view.turn)}`;
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

  /** Le joueur qui jouera après le joueur actif (le suivant qui a encore des cartes), ou -1. */
  const nextSeat = () => {
    for (let k = 1; k < N; k++) {
      const s = (view.turn + k) % N;
      if (view.hands[s]?.length) return s;
    }
    return -1;
  };

  const renderAvatars = () => {
    const starting = view.phase === 'deal' || view.phase === 'exchange';
    const upNext = view.phase === 'play' ? nextSeat() : -1;
    for (let s = 0; s < N; s++) {
      const active = view.phase === 'play' && view.turn === s;
      const e = avEls[s];
      const label = starting && s === view.turn ? 'Commence' : starting && s === view.dealer ? 'Distribue' : s === upNext ? 'Ensuite' : '';
      e.chip.textContent = label;
      e.chip.hidden = !label;
      e.chip.classList.toggle('seat-av__chip--first', label === 'Commence');
      if (e.meTag) e.meTag.hidden = !label;
      e.root.classList.toggle('seat-av--next', !!label);
      e.root.style.transform = `scale(${active ? 1.14 : 1})`;
      e.pulse.hidden = !active;
      // À qui le tour : un anneau tourne autour du joueur actif, les autres pâlissent un peu.
      e.spin.hidden = !active;
      e.root.classList.toggle('seat-av--turn', active);
      e.root.classList.toggle('seat-av--wait', view.phase === 'play' && !active);
      e.cards.textContent = String(view.hands[s]?.length ?? 0);
      e.root.classList.toggle('seat-av--off', !src.players[s].online && !src.players[s].bot && (watching || s !== me));
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
    // Cartes injouables : elles pâlissent, sauf si aucune carte ne se joue (il faut alors défausser).
    const playable = new Set(myTurn() ? myMoves().filter((m) => m.kind !== 'discard').map((m) => m.card) : []);
    hand.replaceChildren(...cards.map((card, i) => {
      const dead = playable.size > 0 && !playable.has(card);
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
      el.style.top = (on ? 0 : r1(34 + m * m * 6)) + 'px';
      el.style.transform = `rotate(${on ? 0 : r1(m * 7)}deg)`;
      el.style.zIndex = String(on ? 20 : i + 1);
      el.style.opacity = !active ? '.6' : dead && !on ? '.55' : '1';
      el.classList.toggle('pcard--dead', active && dead && !on);
      const ls = sel === null ? currentLesson() : null;
      if (ls && ls.ranks().includes(rankOf(card))) el.classList.add('pcard--coach');
      if (dealing) {
        el.classList.add('pcard--deal');
        el.style.animationDelay = (i * 0.1).toFixed(2) + 's';
      }
      return el;
    }));
  };

  const WAY_LABEL: Record<Way, string> = { home: 'Rentrer à la maison', lap: 'Refaire un tour', discard: 'Défausser' };
  const renderChoice = (pl: Plan) => {
    if ((pl.ways?.length ?? 0) > 1) {
      choicePop.hidden = false;
      choicePop.replaceChildren(h('span', { class: 'pop__title' }, 'Ta bille est devant sa maison'),
        h('div', { class: 'chips' }, ...pl.ways!.map((w) =>
          h('button', { type: 'button', 'aria-pressed': String(way === w), onclick: () => { way = w; render(); } },
            w === 'discard' && !view.variants.discardOne ? 'Défausser ma main' : WAY_LABEL[w]))));
      return;
    }
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

  // ---------- Mode manette et écran de table ----------
  // Mode manette : le téléphone tourné en paysage ne montre que les cartes et les billes à choisir ; en portrait, le plateau.
  const manette = () => !watching && matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600
    && root.clientWidth > root.clientHeight;
  const rankName = (r: string) => (r === 'X' ? 'Joker' : RANK_SHORT[r as Rank] ?? r);
  /** Billes à choisir : les cibles du Valet une fois sa bille choisie, sinon les billes jouables. */
  const padList = (pl: Plan) => (pick && pl.targets.length ? pl.targets : pl.cands);
  const padHint = () => giving() ? `Choisis en bas la carte à passer à ${nameOf(partner(N, me))}.`
    : view.phase === 'exchange' ? 'On attend les autres…'
      : view.phase !== 'play' ? 'Distribution des cartes…'
        : !myTurn() ? `Tour de ${nameOf(view.turn)}…`
          : sel === null ? 'À toi de jouer : choisis une carte en bas.' : 'Pas de bille à choisir avec cette carte : touche le bouton en bas.';
  let lastAim = 'null';
  const renderPad = (pl: Plan) => {
    // Le téléphone dit à la tablette ce qu'il prépare (même s'il montre le plateau).
    if (src.setAim && src.tableOn && !watching) {
      const ready = pl.chosen && pl.chosen.kind !== 'discard' ? JSON.stringify(pl.chosen) : '';
      const sp = [...split].filter(([, n]) => n > 0).map(([k, n]) => `${k}:${n}`).join(',');
      const a = myTurn() && sel !== null ? { card: rankOf(myHand()[sel]), n: padList(pl).map(key).join(','), pick: pick ? key(pick) : '', m: ready, sp } : null;
      const sig = JSON.stringify(a);
      if (sig !== lastAim) {
        lastAim = sig;
        src.setAim(a);
      }
    }
    // Écran de table : les billes possibles du joueur dont c'est le tour portent un numéro, la bille choisie brille.
    if (watching) {
      const aim = view.phase === 'play' ? src.aims?.[view.turn] : undefined;
      const nums = aim?.n ? aim.n.split(',') : [];
      pawnEls.forEach(({ outer }, k) => {
        const i = nums.indexOf(k);
        outer.dataset.num = i >= 0 ? String(i + 1) : '';
        outer.classList.toggle('pawn--aim', !!aim?.pick && aim.pick === k);
      });
      if (aim?.card) turnEl.textContent = `Tour de ${nameOf(view.turn)} · ${rankName(aim.card)}`;
      // La barre du haut est cachée sur la tablette : la manche et le score passent en tête du journal.
      tableJournal.replaceChildren(
        h('div', { class: 'table-journal__top' }, h('span', { class: 't-label' }, roundEl.textContent ?? ''), scoreEl.cloneNode(true) as HTMLElement),
        h('span', { class: 'g-deck-line' }, deckText()),
        h('span', { class: 'table-journal__turn' }, view.phase === 'over' ? 'Partie terminée' : turnEl.textContent ?? ''),
        h('span', { class: 't-label' }, 'Journal de la partie'), ...journalRows(8));
    }
    const on = manette();
    root.classList.toggle('game--manette', on);
    padPanel.hidden = !on;
    if (!on) return;
    const list = padList(pl);
    // Sans les numéros sur la tablette, le bouton dit où est la bille (et à qui elle est, si ce n'est pas la sienne).
    const where = (r: PawnRef) => {
      const p = view.pawns[r.s][r.i].p;
      // Distance jusqu'à la meilleure place de sa maison : le trou libre le plus au fond qu'elle peut atteindre
      // (on n'y saute pas de bille). Les trous de maison sont L + 1 à L + 4.
      const home = view.pawns[r.s].map((pw) => pw.p).filter((q) => inHome(N, q) && q > p);
      const best = (home.length ? Math.min(...home) : L + HOME_SIZE + 1) - 1;
      const d = inHome(N, p) ? best - p : best - L + (L - 1 - p);
      const spot = p < 0 ? 'Réserve' : inHome(N, p) ? (d > 0 ? `Maison · encore ${d} case${d > 1 ? 's' : ''}` : 'Maison')
        : best <= L ? 'entrée de la maison bloquée' : `à ${d} case${d > 1 ? 's' : ''} du fond de la maison`;
      return (r.s === me ? '' : `${nameOf(r.s)} · `) + spot;
    };
    padPanel.replaceChildren(
      h('div', { class: 'pad-panel__head' },
        h('span', { class: 'pad-panel__title' }, src.tableOn ? 'Le plateau est sur la tablette' : 'Mode cartes')),
      h('span', { class: 'pad-panel__hint' }, list.length
        ? (pick && pl.targets.length ? 'Touche la bille à échanger' : 'Touche la bille à jouer') + (src.tableOn ? ' : même numéro sur la tablette.' : '.')
        : padHint()),
      h('div', { class: 'pad-pawns' }, ...list.map((r, k) => {
        const steps = split.get(key(r)) ?? 0;
        const chosen = (!!pick && sameRef(pick, r)) || steps > 0 || (!!target && sameRef(target, r));
        return h('button', { class: 'pad-pawn' + (chosen ? ' pad-pawn--on' : ''), type: 'button', onclick: () => onPawn(r) },
          h('b', null, String(k + 1)), bille(SEAT_COLORS[N][r.s], { size: 30 }),
          h('span', null, where(r) + (steps ? ` · +${steps}` : '')));
      })),
      h('span', { class: 'pad-panel__turn' }, 'Tourne le téléphone en portrait pour revoir le plateau.'));
  };
  // Changement dans la salle (tablette qui arrive ou part, visée d'un joueur) : on redessine.
  const offRoom = src.onRoom?.(() => { if (!disposed) render(); });

  const rematchBox = () => {
    const btn = button('Revanche', 'white', () => src.voteRematch?.(), { size: 'md', block: true }) as HTMLButtonElement;
    const who = h('div', { class: 'victory__votes', 'aria-live': 'polite' });
    rematchUi = { btn, who };
    return h('div', { class: 'victory__rematch' }, btn, who);
  };
  const render = () => {
    renderRematch();
    if (drawerOn) drawerStatus.textContent = sideStatus.textContent = view.phase === 'play' ? (view.turn === me ? '· À toi de jouer' : `· ${nameOf(view.turn)} réfléchit…`)
      : view.phase === 'exchange' ? '· Échange des cartes' : '';
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
    renderPad(pl);
    // Carte d'indice et bouton
    let t: string, sub: string, label = '';
    if (view.phase === 'over') { t = 'Partie terminée'; sub = 'Bien joué, tout le monde !'; }
    else if (view.phase === 'exchange') {
      if (!view.exchange[me] && sel === null && currentLesson()) {
        const ls = currentLesson()!;
        setCoach(ls.mood);
        t = `Leçon ${lessonNo} sur ${LESSONS.length} · ${ls.title}`;
        sub = ls.text();
      } else if (view.exchange[me]) {
        t = 'Carte donnée';
        sub = src.slow ? 'On attend les autres : ils donneront leur carte en revenant.'
          : `On attend les autres. Ensuite, ${view.turn === me ? 'c’est toi qui commences' : nameOf(view.turn) + ' commence'}.`;
      }
      // Pendant le choix de la carte, on sait déjà qui ouvrira la donne.
      else if (sel === null) { t = 'Échange'; sub = `Choisis une carte pour ${nameOf(partner(N, me))}. Ensuite, ${view.turn === me ? 'c’est toi qui commences' : nameOf(view.turn) + ' commence'}.`; }
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
    } else if (sel === null && currentLesson()) {
      const ls = currentLesson()!;
      setCoach(ls.mood);
      t = `Leçon ${lessonNo} sur ${LESSONS.length} · ${ls.title}`;
      sub = ls.text();
    } else if (sel === null) { t = 'À ton tour !'; sub = 'Choisis une carte dans ta main.'; }
    else if (tip) { t = 'Astuce'; sub = tip; label = pl.chosen ? (pl.chosen.kind === 'discard' ? 'Défausser' : 'Jouer') : ''; }
    else {
      const c = cardLook(myHand()[sel], view.variants);
      if (pl.chosen?.kind === 'discard') {
        t = 'Aucun coup possible';
        sub = pl.chosen.card ? 'Défausse cette carte.' : 'Tu passes la donne.';
        label = 'Défausser';
      } else if (!pl.chosen && (pl.ways?.length ?? 0) > 1) {
        t = 'Devant ta maison';
        sub = pl.ways!.includes('home') ? 'Rentre ta bille ou refais un tour : choisis à droite.' : 'Elle ne peut pas rentrer : refais un tour, ou défausse.';
      } else if (split.size && [...split.values()].some((n) => n > 0) && (pl.sevenPawns.length || pl.chosen?.kind === 'seven')) {
        const parts = [...split.values()].filter((n) => n > 0);
        t = `Le 7 · ${parts.map((n) => '+' + n).join(' et ')}`;
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
        // Carte injouable : on dit pourquoi pour le 7 (règle la plus souvent mal comprise).
        if (!pl.moves.length)
          sub = rankOf(myHand()[sel]) !== '7' ? 'Cette carte ne peut pas être jouée pour l’instant.'
            : view.variants.sevenAnyPawns ? 'Le 7 se joue en entier : pas assez de pas possibles ici.'
              : 'Le 7 se joue en entier, sur deux billes au plus : pas possible ici.';
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
    renderJournal();
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
  const hop = async (s: number, i: number, from: number, steps: number, sp: number, lap = false) => {
    let p = from;
    for (const next of walk(from, steps, lap)) {
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
    if (seat === me && !watching) {
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
    const mine = seat === me && !watching;
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
      const p = await hop(move.pawn.s, move.pawn.i, prev.pawns[move.pawn.s][move.pawn.i].p, move.steps, sp, move.lap);
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
        const p = await hop(part.pawn.s, part.pawn.i, from, part.steps, sp, part.lap);
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
        fx('board', { kind: 'ring', x, y, c: '#fff', ms: 650 });
        fx('board', { kind: 'sticker', x: Math.min(290, Math.max(70, x)), y: Math.max(50, y - 34), t: 'BOUM !', ms: 1300 });
      }
      tocPeek();
      board.classList.remove('board--shake');
      void board.offsetWidth;
      board.classList.add('board--shake');
      sfx('boum');
      // Une de tes billes renvoyée dans ta réserve : le téléphone vibre.
      if (!watching && next.lastCaptures.some((v) => v.s === me)) buzz(220);
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
      closeVictory();
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
    const wasMyTurn = !watching && prev.phase === 'play' && prev.turn === me;
    let opened = false;
    // Le coup d'un autre (ex. un robot qui échange sa carte) ne doit pas effacer la sélection en cours.
    const sameHand = JSON.stringify(prev.hands[me]) === JSON.stringify(next.hands[me]);
    if (moved || prev.phase !== next.phase || !sameHand) clearSel();
    view = next;
    syncPawns(next);
    if (prev.phase === 'deal' && next.phase === 'exchange') {
      if (drawerOpen && document.activeElement !== chatInput) setDrawer(false);
      shown = '';
      renderDiscard();
      dealing = true;
      render();
      dealing = false;
      const size = next.hands[me].length;
      sfx('donne');
      if (next.dealNo === 0) fx('screen', { kind: 'banner', y: 262, t: 'C’EST PARTI !', ms: 1500 });
      else toast(!watching && next.dealer === me ? `Tu distribues ${size} cartes` : `${nameOf(next.dealer)} distribue ${size} cartes`);
      await sleep(1300);
    } else if (prev.phase === 'exchange' && next.phase === 'play') {
      render();
      if (!watching) {
        toast(`${nameOf(partner(N, me))} t’a passé une carte`, 1000);
        await sleep(1050);
      }
      // Qui ouvre la donne, en grand pour toute la table.
      const first = nameOf(next.turn);
      const mine = !watching && next.turn === me;
      fx('screen', { kind: 'banner', y: 262, t: mine ? 'TU COMMENCES !' : `${(first.length > 9 ? first.slice(0, 8) + '…' : first).toUpperCase()} COMMENCE !`, ms: 1700 });
      opened = true;
      if (!mine) await sleep(500);
    }
    if (!watching && next.phase === 'play' && next.turn === me && (!wasMyTurn || moved)) {
      if (drawerOpen && document.activeElement !== chatInput) setDrawer(false);
      if (!opened) fx('screen', { kind: 'banner', y: 262, t: 'À TOI DE JOUER !', ms: 1500 });
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
  const unsubChat = src.onChat?.((lines, fresh) => {
    renderChat(lines);
    for (const m of fresh) {
      chatBubble(m.seat, m.t);
      if (!chatVisible() && !endChat) { unread++; showUnread(); }
    }
  });

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
    h('span', { class: 'sheet__text' }, watching ? 'Écran de table : la partie continue sur les téléphones des joueurs.'
      : src.slow ? 'Partie à ton rythme : elle t’attend sur l’accueil, reviens quand tu veux.' : 'Les autres t’attendent, fais vite !'),
    soundSettings(),
    button('Reprendre', 'primary', closeSheet, { size: 'md', block: true }),
    src.local ? button('Recommencer la donne', 'white', () => { closeSheet(); src.restartDeal(); }, { size: 'md', block: true }) : h('span'),
    !src.local && !watching ? button('Afficher le plateau sur une tablette', 'white', () => { closeSheet(); openTableSheet(src.code); }, { size: 'md', block: true }) : h('span'),
    button(watching ? 'Fermer l’écran de table' : src.slow ? 'Revenir à l’accueil' : 'Quitter la partie', src.slow || watching ? 'white' : 'danger', () => { closeSheet(); o.onQuit(); }, { size: 'md', block: true }),
    src.canDelete ? button('Supprimer la partie', 'text', () => openSheet(
      h('span', { class: 'sheet__title' }, 'Supprimer la partie ?'),
      h('span', { class: 'sheet__text' }, 'Elle s’arrête pour tout le monde et disparaît de vos listes. C’est définitif.'),
      button('Supprimer la partie', 'danger', () => { closeSheet(); src.deleteGame?.().catch(() => toast('Suppression impossible pour l’instant.')); }, { size: 'md', block: true }),
      button('Annuler', 'text', () => openPause()),
    )) : h('span'),
  );
  const showVictory = (st: GameState, won: boolean) => {
    closeVictory();
    const t = st.winner, c = tint(t);
    const plOf = (k: number) => (k === me ? { ...src.players[k], ...draftProfile() } : src.players[k]);
    // Gains : seulement pour les parties en ligne (comme awardGame).
    const reward = src.local || watching ? '' : won ? '+150 XP · +100 pièces' : '+60 XP · +20 pièces';
    // Chiffres : les siens, ou ceux de l'équipe gagnante sur l'écran de table.
    const who = watching ? [t, t + N / 2] : [me];
    const total = (a: number[]) => who.reduce((x, k) => x + (a[k] ?? 0), 0);
    const boums = total(st.stats.captures), outs = total(st.stats.exits);
    const confetti = Array.from({ length: 18 }, (_, i) => h('i', { style: {
      left: `${(i * 37) % 100}%`, background: ['#ffc93c', '#fff', '#2ec4a0', '#4a7dff', '#ff6fae'][i % 5],
      animationDelay: `-${((i * 0.37) % 2.6).toFixed(2)}s`, animationDuration: `${(2.2 + (i % 4) * 0.3).toFixed(1)}s`,
    } }));
    // Le fond (couleur, rayons, confettis) couvre tout l'écran, encoche et bas compris ;
    // le contenu suit l'échelle de la scène, comme le plateau.
    victoryInner = h('div', { class: 'victory__inner' },
      h('span', { class: 'victory__kicker' }, won ? `Équipe ${TEAM_NAMES[t]}` : `L’équipe ${TEAM_NAMES[t]} gagne`),
      h('span', { class: 'victory__title' }, won ? 'Victoire !' : 'Partie perdue'),
      h('div', { class: 'victory__toc' }, mascot(won ? 'vainqueur' : 'surpris', 150)),
      h('div', { class: 'victory__team' }, ...[t, t + N / 2].flatMap((k, i) => [
        i ? h('span', { style: { opacity: 0.75 } }, '&') : null, avatar(plOf(k).char, plOf(k).color, 32), h('span', null, nameOf(k))])),
      h('div', { class: 'victory__card' },
        reward ? h('div', { class: 'victory__reward' }, h('span', null, won ? 'Bravo l’équipe !' : 'Revanche ?'), h('b', null, reward)) : null,
        h('div', { class: 'victory__chips' },
          h('span', null, `${boums} BOUM`),
          h('span', null, `${outs} bille${outs > 1 ? 's' : ''} sortie${outs > 1 ? 's' : ''}`),
          h('span', null, `${Math.floor(st.dealNo / 3) + 1} manche${st.dealNo >= 3 ? 's' : ''}`))),
      h('div', { style: { flex: 1 } }),
      watching ? button('Fermer', 'white', closeVictory, { size: 'md', block: true })
        // En ligne, la revanche part quand tout le monde a dit oui.
        : src.voteRematch ? rematchBox()
          : button('Revanche', 'white', () => { closeVictory(); src.rematch(); }, { size: 'md', block: true }),
      !watching && src.chat ? h('button', { class: 'victory__chat', type: 'button', onclick: openEndChat }, 'Discuter avec la table', endBadge) : null,
      watching ? null : button('Retour à l’accueil', 'text', () => { closeVictory(); o.onQuit(); }));
    victoryEl = h('div', { class: 'victory' + (won ? '' : ' victory--lost'), role: 'dialog', 'aria-label': won ? 'Victoire' : 'Partie perdue', style: { '--vc': c.c, '--vd': c.d } },
      won && h('span', { class: 'victory__rays' }),
      won && h('span', { class: 'victory__confetti' }, ...confetti),
      h('div', { class: 'victory__frame' }, victoryInner));
    root.append(victoryEl);
    renderRematch();
    fit();
    setTheme(won ? c.c : '#4a4862');
  };
  const showEnd = (st: GameState) => {
    const won = watching || teamOf(N, me) === st.winner;
    if (src.initiation) setCoach(won ? 'vainqueur' : 'surpris');
    sfx(won ? 'victoire' : 'defaite');
    if (won && !watching) buzz([80, 60, 80, 60, 200]);
    for (let k = 0; k < 3; k++) setTimeout(() => fx('board', { kind: 'confetti', x: 120 + k * 60, y: 160 + (k % 2) * 40, ms: 1200 }), k * 250);
    setTimeout(() => showVictory(st, won), 900);
  };

  // ---------- Démarrage ----------
  syncPawns(view);
  renderDiscard();
  render();
  requestAnimationFrame(fit);
  if (view.phase !== 'deal') src.settled();
  if (src.initiation)
    openSheet(
      mascot('content', 150),
      h('span', { class: 'sheet__title' }, 'Salut, moi c’est Toc !'),
      h('span', { class: 'sheet__text' }, `Tu joues avec ${nameOf(partner(N, me))}, en face de toi, contre deux robots. Le but : faire le tour du plateau avec tes 4 billes et les rentrer dans ta maison avant l’autre équipe.`),
      h('span', { class: 'sheet__text' }, 'Pour cette partie d’initiation, je t’explique chaque carte au moment où elle sert, juste à côté de ta main.'),
      button('C’est parti !', 'primary', closeSheet, { size: 'md', block: true }));

  return {
    el: root,
    cleanup: () => {
      disposed = true;
      closeVictory();
      offRoom?.();
      allowLandscape(false);
      document.documentElement.classList.remove('in-game');
      sizeWatch.disconnect();
      window.removeEventListener('orientationchange', settle);
      screen.orientation?.removeEventListener?.('change', settle);
      if (lastAim !== 'null') src.setAim?.(null);
      document.removeEventListener('pointerdown', closeJournalOutside, true);
      unsub();
      unsubEmote?.();
      unsubChat?.();
      vv?.removeEventListener('resize', placeTyping);
      vv?.removeEventListener('scroll', placeTyping);
      window.removeEventListener('scroll', onPageScroll, true);
      document.removeEventListener('pointerdown', closeOutside, true);
      stopTimer();
      clearTimeout(toastTimer);
      window.removeEventListener('resize', fit);
      mqFlex.removeEventListener('change', fit);
      mqBook.removeEventListener('change', fit);
      posture?.removeEventListener('change', fit);
      src.leave();
    },
  };
}
