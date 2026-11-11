// 06 Plateau de jeu : rendu de la maquette, sélection des coups, animations.
import type { GameSource, RematchVote, TableMsg } from '../../app/game-source';
import { draftProfile } from '../../app/profile';
import { noteCapture, rivalOf } from '../../app/rivaux';
import {
  type Card, type GameState, type Move, type PawnRef, type Rank, type SevenPart, HOME_SIZE, applyMove, botGift, botMove, cryptoRng, homeEntry, homeIndex, inHome, isLap, leavesHome, legalMovesFor, occupant, partner, rankOf, sameRef, squareOf, stepForward, teamOf, trackLen, DEAL_CYCLE, decksFor,
} from '../../engine';
import { type Fx, playFx } from '../board/fx';
import { FLAT, SEATED, type Tilt, armOf, geom, pawnXY, planeShift, projector, seatedAvs, shiftCss, tilted, trackIndex } from '../board/geom';
import { paintedGeom } from '../board/painted';
import { askRelief, relief, reliefAvailable, reliefOn, setReliefPref } from '../board/relief';
import { criOf, lookOf } from '../../app/shop';
import { deNom, h, toast as pageToast } from '../dom';
import { COL, EMOTES, SEAT_COLORS, TEAM_BG, TEAM_INK, TEAM_NAMES, cardLook } from '../kit/data';
import { ICONS, avatar, bille, billeSkin, button, cardBack, icon, pauseButton, playingCard, segmented, suitIcon } from '../kit/kit';
import { type Humeur, setHumeur } from '../kit/perso';
import { boomFx } from '../board/boom';
import { openRulesSheet } from './rules';
import { music, musicTension, sfx, soundSettings } from '../sound';
import { type Haptic, canTick, haptic, tickUnder } from '../haptics';
import { type MascotMood, mascot } from '../mascot';
import { openTableSheet } from '../table-invite';
import { allowLandscape } from '../orientation';
import { type Pose, type Shape, closedFoldable, noteOpened, panes as foldPanes, pose as foldPose, shapeOf, watchFold } from '../fold';
import { type Planche, type PlancheActor, type PlancheCase, burstEl, plancheDouble, plancheEl, sharePlanche } from '../planche';
import { GAINS } from '../../app/progress';

const REPLIES = ['Aïe !', 'Tu vas voir…', 'Hahaha', 'Pas mal du tout', 'Sérieux ?'];
const TURN_MS = 30_000;
const STAGE_W = 393;
const STAGE_H = 750;
/** Le cadre du plateau (360 × 360) dans la scène */
const BOARD_X = 16;
const BOARD_Y = 70;
/** Le haut de la rangée d'actions (chat, consigne, bouton) dans la scène */
const ACTIONS_Y = 424;
/** Largeur d'une carte de la main */
const CARD_W = 98;
/** Épaisseur de la dalle du plateau, dans les unités du plan (elle se voit sur une douzaine de pixels, de sa place) */
const SLAB = 19;
/** Plateau en relief : de combien le regard tourne (gauche, droite) et monte ou descend, en degrés, téléphone incliné à fond */
const LOOK_YAW = 7, LOOK_PITCH = 5;
const VIEW_KEY = 'toc.vue';
const BOUM_KEY = 'toc.boum';
/** Réglage « Vue du plateau » : inclinée depuis sa place (par défaut), ou de dessus. */
const viewPref = (): 'inclinee' | 'plat' => { try { return localStorage.getItem(VIEW_KEY) === 'plat' ? 'plat' : 'inclinee'; } catch { return 'inclinee'; } };
/** Vue de dessus sur un téléphone : le plateau entier, dans la même place que la vue inclinée. */
const FLAT_PHONE: Tilt = { deg: 0, dist: 1400, k: 0.84 };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const r1 = (n: number) => Math.round(n * 10) / 10;
const key = (r: PawnRef) => `${r.s}.${r.i}`;
const JOKER_ORDER: Rank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
const RANK_SHORT: Partial<Record<Rank, string>> = { K: 'R', Q: 'D', J: 'V' };
/** Petits pictos du partage du 7 : maison, refaire un tour, bille prise. */
const SV_ICONS = {
  home: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.3 1 5.7h1.5v5h2.7V7.9h1.6v2.8h2.7v-5H11Z" fill="currentColor"/></svg>',
  lap: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M9.7 6.5A3.8 3.8 0 1 1 8.6 3.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M9.5 1v2.8H6.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cap: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 .4 7.3 3.9 11 3.4 8.6 6.2 10.6 9.4 7 8.6 6 12 5 8.6 1.4 9.4 3.4 6.2 1 3.4 4.7 3.9Z" fill="currentColor"/></svg>',
};
/** Trous de la maison, du bout du bras vers le centre */
const HOME_HOLES = ['1er trou', '2e trou', '3e trou', 'fond'];

export function gameScreen(src: GameSource, o: { onQuit: () => void }): { el: HTMLElement; cleanup: () => void } {
  const N = src.state.n as 4 | 6;
  // Écran de table (tablette, sans place) : le plateau seul, vu depuis la place 0, sans main ni « à toi ».
  const watching = src.mySeat < 0;
  const me = watching ? 0 : src.mySeat;
  // ---------- Retour haptique (src/ui/haptics.ts) ----------
  // Jamais sur l'écran de table : posé au milieu des joueurs, il n'est dans la main de personne.
  /** Un geste du joueur, ou un évènement qui le concerne (son tour, la donne, la fin). */
  const tap = (name: Haptic) => { if (!watching) haptic(name); };
  /** Le coup en cours d'animation se sent-il dans la main ? (pas un coup rejoué à la fin) ; mine : c'est toi qui le joues. */
  let felt = { on: false, mine: false };
  /** Un instant du coup animé : pour celui qui le joue, et (also) pour celui dont une bille est concernée. */
  const feel = (name: Haptic, also = false) => { if (felt.on && (felt.mine || also)) haptic(name); };
  /** iPhone : le tic du toucher sous chaque bouton redessiné avec la partie (arrivées du 7, choix, manette). */
  const equip = () => {
    if (canTick()) for (const box of [ghostLayer, choicePop, padPanel]) box.querySelectorAll<HTMLElement>('button').forEach((b) => tickUnder(b));
  };
  // Plateau peint (boutique, à 4) : la photo du plateau, tournée pour que sa couleur soit en bas.
  const pg = !watching && N === 4 && lookOf(draftProfile().look).plateau === 'peint' ? paintedGeom(SEAT_COLORS[4][me]) : null;
  /** Le plateau dans son plan (trous, fonds teintés) ; `g`, plus bas, donne les mêmes positions vues à l'écran. */
  const flat = pg ? pg.g : geom(N);
  const L = trackLen(N);
  const Z = N === 4
    ? { hs: 12, ss: 15, rs: 12, ps: pg ? 17 : 16.5, av: pg ? 32 : 50, lift: 11 }
    : { hs: 10.5, ss: 13, rs: 10.5, ps: 13.5, av: 34, lift: 8 };
  // Vue du plateau : inclinée, comme assis à sa place, ou de dessus (réglage dans la pause).
  // L'écran de table, posé à plat au milieu des joueurs, reste vu de dessus.
  const tiltFor = (): Tilt => (watching ? FLAT : viewPref() === 'plat' ? FLAT_PHONE : SEATED);
  let proj = projector(tiltFor());
  /** La vue de la maquette : à 4, depuis sa place, sur le plateau dessiné. */
  const mockView = () => N === 4 && !!tiltFor().deg && !pg && !watching;
  /** Vue de sa place : les billes dépassent un peu de leurs trous, comme sur la maquette (elles restent lisibles au fond). */
  const pawnBoost = () => (tiltFor().deg && !pg ? (N === 4 ? 1.2 : 1.1) : 1);
  // Pliants (src/ui/fold.ts) : la tenue en cours ('' hors pliant) et la forme de la double page.
  let fold: Exclude<Pose, 'phone'> | '' = '';
  let foldShape: Shape = 'duo';
  /** Ce que la case du plateau montre de la scène, dans le repère du plateau : les persos et les bulles n'en sortent pas. */
  const PHONE_VIS = { x0: -BOARD_X, x1: 360 + BOARD_X, y0: -BOARD_Y, y1: STAGE_H - BOARD_Y };
  let vis = PHONE_VIS;
  /** Échelle de la scène dans la case du plateau (pliants). */
  let foldScale = 1;
  /**
   * Où se tiennent les persos : dans les coins du plateau (téléphone, livre, clapet), dans les marges de la case
   * (double page), ou nulle part quand chacun a sa fiche à côté du plateau (double page large, chevalet).
   */
  const avMode = (): 'coins' | 'marges' | 'fiches' =>
    (fold === 'open' ? (foldShape === 'wide' ? 'fiches' : 'marges') : fold === 'tent' ? 'fiches' : 'coins');
  /** Double page : les marges de la case, de part et d'autre du plateau (repère du plateau). */
  const MARGIN_L = -26, MARGIN_R = 386;
  /**
   * Double page : les persos quittent le plateau pour les marges de la case, comme sur la maquette. À 4 : un adversaire
   * de chaque côté, le partenaire au fond, juste à gauche de la pliure. Vue de dessus, le plateau monte jusqu'en haut
   * de la case : le partenaire passe dans la marge de gauche.
   */
  const marginAvs = (avs: [number, number][]): [number, number][] => avs.map(([x, y], arm): [number, number] => {
    if (N === 4) return ((tiltFor().deg ? [[149, 53], [MARGIN_R, 135], [x, y], [MARGIN_L, 189]] : [[MARGIN_L, 66], [MARGIN_R, 135], [x, y], [MARGIN_L, 222]]) as [number, number][])[arm];
    return x < 120 ? [MARGIN_L, y] : x > 240 ? [MARGIN_R, y] : [Math.abs(x - 180) < 34 ? 146 : x, y];
  });
  /**
   * Les positions vues à l'écran. Vue inclinée : les persos passent au fond et dans le coin proche (seatedAvs).
   * À 6, ton perso quitte le bout de son bras pour le coin proche, à gauche, comme à 4 : le milieu du bord reste
   * libre pour les messages de la partie.
   */
  /** Où se tiennent les persos, dans le plan du plateau (avant projection). */
  const planeAvs = (): [number, number][] => {
    const t = tiltFor();
    let avs = t.deg && !pg ? seatedAvs(flat) : flat.avs;
    if (N === 6 && !watching) avs = avs.map((p, k): [number, number] => (k === N / 2 ? (t.deg ? [24, 360] : [17, 357]) : p));
    return avs;
  };
  const seen = () => {
    const t = tilted({ ...flat, avs: planeAvs() }, tiltFor());
    return avMode() === 'marges' ? { ...t, avs: marginAvs(t.avs) } : t;
  };
  let g = seen();
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

  // ---------- Mise en page ----------
  // Téléphone : la scène entière, à l'échelle de l'écran. Téléphone couché (manette) : la scène coupée en deux régions,
  // le haut (barre, billes à choisir) et le bas (consigne, minuteur, main), dans deux volets : le bas est la même scène
  // décalée, les coordonnées ne changent pas, rien n'est reconstruit. Écran de table : le plateau et le journal.
  // Pliants et tablettes (src/ui/fold.ts) : la grille de la maquette « TOC sur pliants », où la scène ne garde que le
  // plateau (voir « Pliants : l'album ouvert », plus bas).
  const SPLIT_Y = 416;
  /** Journal de la partie, affiché en permanence sur l'écran de table. */
  const tableJournal = h('div', { class: 'table-journal', hidden: true });
  root.append(tableJournal);
  const LOW_H = 760 - SPLIT_Y;
  /** Écran de table : le plateau seul, des noms au-dessus des avatars du haut à ceux du bas (sans barre ni main). */
  const TABLE_Y = 26;
  const TABLE_H = 470;
  const stage2 = h('div', { class: 'game__stage' });
  const frame2 = h('div', { class: 'game__frame', hidden: true }, stage2);
  root.append(frame2);
  /** Éléments du bas (indice, minuteur, main), rangés dans le second volet quand il y en a deux. */
  const lowEls: HTMLElement[] = [];
  let layout = '';
  /** Le chat suit la mise en page (rangé plus bas, une fois le chat construit). */
  let layoutHook: () => void = () => {};
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
  /** La grille des pliants : montée plus bas, une fois les éléments de la partie créés. */
  let foldUi: { mount: (on: boolean) => void; fit: (p: Exclude<Pose, 'phone'>) => void } | null = null;
  const isFold = (k: string): k is Exclude<Pose, 'phone'> => k === 'open' || k === 'book' || k === 'tent' || k === 'flip';
  const panes = (): { kind: string; a?: Box; b?: Box; j?: Box } | null => {
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
    // Pliant (grand ouvert, en livre, en chevalet, à clapet) ou tablette : la grille s'occupe de tout.
    const p = foldPose();
    return p === 'phone' ? null : { kind: p };
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
      // Plier, déplier, tourner : les éléments changent de place, la partie continue (carte choisie comprise).
      const ended = !!victoryEl && layout !== '';
      if (ended) closeVictory();
      if (isFold(kind) !== isFold(layout)) foldUi?.mount(isFold(kind));
      // L'écran de fin se remontre à la nouvelle taille.
      if (ended) requestAnimationFrame(() => { if (!disposed && lastEnd && !victoryEl && view.phase === 'over') showVictory(lastEnd.st, lastEnd.won); });
      if (!isFold(kind)) (P?.b ? stage2 : stage).append(...lowEls);
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
    if (isFold(kind)) foldUi?.fit(kind);
    else if (P?.a) {
      putFrame(frame, P.a);
      if (P.kind === 'table') showRegion(stage, frame, TABLE_Y, TABLE_H - TABLE_Y);
      else showRegion(stage, frame, 0, SPLIT_Y);
      if (P.b) {
        putFrame(frame2, P.b);
        showRegion(stage2, frame2, SPLIT_Y, LOW_H);
      }
    } else {
      frame.style.cssText = '';
      const w = frame.clientWidth, ht = frame.clientHeight;
      const s = Math.min(w / STAGE_W, ht / STAGE_H);
      stage.style.transform = `translate(${(w - STAGE_W * s) / 2}px,${Math.max(0, (ht - STAGE_H * s) / 2)}px) scale(${s})`;
    }
    layoutHook();
    if (victoryInner && !victoryInner.dataset.pli) {
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
  // On plie, on déplie, on redimensionne : la mise en page suit.
  const unwatchFold = watchFold(() => { if (!disposed) fit(); });

  // Le fond de la case est le sol sur lequel le plateau est posé : ses rayons et ses trames le suivent (plateau en relief).
  const ground = h('div', { class: 'g-case__sol' }, h('i'), h('b'), h('b'));
  // Décor : deux trames de points dans les coins, et la case de BD derrière le plateau (ses rayons partent du centre).
  stage.append(
    h('div', { class: 'g-dots', style: { left: -150, top: 470 } }),
    h('div', { class: 'g-dots', style: { right: -170, top: -150 } }),
    h('div', { class: 'g-case', 'aria-hidden': 'true' }, ground),
  );

  // ---------- Barre du haut ----------
  // La manche et la donne : un récitatif jaune à cheval sur le coin de la case. Le toucher montre les derniers coups.
  const roundEl = h('button', { class: 'g-round', type: 'button', 'aria-expanded': 'false', onclick: () => toggleJournal() });
  // À qui le tour : la consigne et les persos le montrent ; ce texte reste pour les lecteurs d'écran et l'écran de table.
  const turnEl = h('span', { class: 'g-top__turn', role: 'status' });
  const scoreEl = h('div', { class: 'g-score', role: 'img' });
  /** Vue du plateau (inclinée ou de dessus) : rien n'est reconstruit, les billes et les persos se replacent. */
  const retilt = () => {
    proj = projector(tiltFor());
    g = seen();
    applyTilt();
    placeAvatars();
    syncPawns(view);
    applyLean(lean[0], lean[1]);
    render();
  };
  // Journal : les 4 derniers coups joués, pour savoir ce qui s'est passé (demandé par Mallory).
  const journal = h('div', { class: 'g-journal-pop', role: 'dialog', 'aria-label': 'Les 4 derniers coups', hidden: true });
  const journalBtn = roundEl;
  // La barre, comme sur la maquette : la pause à gauche, le score des équipes à droite (à 6, il a trois cases et se resserre).
  // Les règles et les derniers coups sont aussi dans la pause.
  const gTop = h('div', { class: 'g-top' + (N === 6 ? ' g-top--six' : '') }, pauseButton(() => openPause()), turnEl, scoreEl);
  stage.append(gTop, roundEl, journal);

  // ---------- Plateau ----------
  const board = h('div', { class: 'board' });
  const pathLayer = h('div');
  const ghostLayer = h('div');
  const pawnLayer = h('div');
  const avLayer = h('div');
  // Les bulles vivent hors du plateau (au-dessus du panneau d'aide aussi), dans son repère : voir .g-bubbles.
  const bubbleLayer = h('div', { class: 'g-bubbles' });
  const fxBoard = h('div', { class: 'fx-layer', style: { zIndex: 1100 } });
  const discard = h('div', { class: 'discard' });
  /** Nombre de cartes restant dans la pioche, sur le paquet du centre */
  const deckCount = h('span', { class: 'pile__count', 'aria-label': 'Cartes dans la pioche' });
  const center = N === 4 ? (pg ? { x: 95, s: 170 } : { x: 105, s: 150 }) : { x: 122, s: 116 };
  // Le plan du plateau (bois, feutre, trous, pioche) est incliné d'un bloc par le navigateur ;
  // les billes, les persos et les effets restent debout, posés aux positions vues à l'écran (g).
  const plane = h('div', { class: 'board__plane' },
    h('div', { class: 'board__wood' }),
    h('div', { class: 'board__center', style: { left: center.x, top: center.x, width: center.s, height: center.s } }));
  if (pg) {
    // La photo porte déjà les trous, les maisons et les réserves : on ne dessine que les billes par-dessus.
    board.classList.add('board--painted');
    plane.append(h('div', { class: 'board__photo', style: { backgroundImage: `url(${import.meta.env.BASE_URL}plateaux/peint.jpg)`, transform: `rotate(${pg.turn}deg)` } }));
  }
  const rpads: HTMLElement[] = [];
  flat.arms.forEach((am, arm) => {
    const s = (arm - armOf(N, me, 0) + N) % N; // place assise sur ce bras
    const c = tint(s);
    const pad = (b: typeof am.rpad) =>
      h('div', { class: 'pad', style: { left: b.x, top: b.y, width: b.w, height: b.h, borderRadius: b.r, background: c.c, transform: `rotate(${b.rot}deg)` } });
    const rp = pad(am.rpad);
    rpads[s] = rp;
    plane.append(rp, pad(am.lpad));
  });
  /** Un trou du plateau. kind : départ (blanc, cerclé de la couleur du joueur), maison ou réserve (à sa couleur). */
  const hole = (x: number, y: number, z: number, kind = '', c?: { c: string; d: string; l: string }) =>
    h('div', { class: 'hole' + (kind ? ' hole--' + kind : ''), style: { left: r1(x - z / 2), top: r1(y - z / 2), width: z, height: z, ...(c ? { '--c': c.c, '--d': c.d, '--l': c.l } : {}) } });
  flat.track.forEach(([x, y], i) => {
    const arm = Math.floor(i / 16), st = i % 16 === flat.sj;
    const c = tint((arm - armOf(N, me, 0) + N) % N);
    plane.append(st ? hole(x, y, Z.ss, 'start', c) : hole(x, y, Z.hs));
  });
  flat.lanes.forEach((ln, arm) => {
    const c = tint((arm - armOf(N, me, 0) + N) % N);
    ln.forEach(([x, y]) => plane.append(hole(x, y, Z.hs, 'home', c)));
    flat.res[arm].forEach(([x, y]) => plane.append(hole(x, y, Z.rs, 'res', c)));
  });
  // Les ombres des billes, à plat sur le bois : elles restent au sol quand la bille se soulève ou s'envole.
  const shadeLayer = h('div', { class: 'board__shades', 'aria-hidden': 'true' });
  // Sur le bois : la défausse (une carte à plat) et l'ombre de la pioche. La pioche elle-même est un paquet en volume.
  const pileOf = (...kids: HTMLElement[]) => h('div', { class: 'pile', style: { transform: `scale(${N === 4 ? (pg ? 1 : 0.88) : 0.72})` } }, ...kids);
  plane.append(shadeLayer, pileOf(h('b', { class: 'pback-ombre' }), discard));
  // La pioche en volume : des cartes empilées au-dessus du bois (leurs tranches), la carte « TOC » et son compteur tout en haut.
  const deck = h('div', { class: 'board__deck', 'aria-hidden': 'true' },
    ...[1, 3, 5].map((j) => h('i', { style: { '--j': j } }, pileOf(h('b', { class: 'pback-tranche' })))),
    h('i', { style: { '--j': 7 } }, pileOf(cardBack(), deckCount)));
  // La dalle en volume : sa tranche (des couches empilées sous le bois), son contour d'encre et son ombre sur le sol.
  // Chaque couche reprend la perspective du plan, un peu plus bas : la tranche se découvre vraiment quand le regard tourne.
  const slab = h('div', { class: 'board__slab', 'aria-hidden': 'true' },
    h('i', { class: 'board__slab-ombre', style: { '--j': SLAB } }), h('i', { class: 'board__slab-encre', style: { '--j': SLAB } }),
    ...Array.from({ length: 10 }, (_, k) => h('i', { style: { '--j': SLAB - 2 * k } })));
  // Les marques posées à plat (trajets, arrivées) suivent le plan par une seule déformation, depuis le coin du cadre.
  pathLayer.style.transformOrigin = ghostLayer.style.transformOrigin = '0 0';
  // Tout le plateau passe dans une « caméra » : pendant le partage du 7, elle se rapproche des arrivées.
  const cam = h('div', { class: 'board__cam' }, slab, plane, deck, pathLayer, ghostLayer, pawnLayer, avLayer, fxBoard);
  board.append(cam);
  stage.append(board, bubbleLayer);
  const applyTilt = () => {
    const t = tiltFor();
    plane.style.transform = proj.css;
    board.classList.toggle('board--flat', !t.deg);
    // Hors de la vue de la maquette (vue de dessus, plateau peint), le récitatif de la manche remonte au-dessus de la case :
    // les persos y sont dans les coins du plateau, et leurs étiquettes passent juste dessous.
    root.classList.toggle('game--coins', !t.deg || !!pg);
    // La perspective du plan, pour les couches en volume (la tranche de la dalle, la pioche) qui la reprennent.
    for (const [k, v] of [['--pitch', t.deg + 'deg'], ['--yaw', '0deg'], ['--k', String(t.k)], ['--dist', t.dist + 'px']]) cam.style.setProperty(k, v);
  };
  applyTilt();
  let zoomed = '';
  /** Mise en scène d'un BOUM en cours : la caméra lui appartient, le reste de l'écran n'y touche pas. */
  let staged = false;
  let zoomTimer = 0;
  /** Rapproche la caméra de la zone b du plateau (null : tout le plateau). */
  const zoomTo = (b: { x: number; y: number; w: number } | null) => {
    const sig = b ? `${r1(b.x)},${r1(b.y)},${r1(b.w)}` : '';
    if (sig === zoomed) return;
    const was = !!zoomed;
    zoomed = sig;
    clearTimeout(zoomTimer);
    // Le plateau est découpé à sa taille pendant le zoom ; le découpage part de loin pour ne rien couper d'un coup.
    if (b) {
      const k = 360 / b.w;
      if (!was) {
        board.style.clipPath = 'inset(-160px round 44px)';
        void board.offsetWidth;
      }
      board.classList.add('board--zoom');
      board.style.clipPath = 'inset(-4px -12px -8px -12px round 28px)';
      cam.style.transform = `translate(${r1(-b.x * k)}px, ${r1(-b.y * k)}px) scale(${k.toFixed(3)})`;
    } else {
      cam.style.transform = '';
      board.style.clipPath = 'inset(-160px round 44px)';
      zoomTimer = window.setTimeout(() => {
        board.style.clipPath = '';
        board.classList.remove('board--zoom');
      }, 520);
    }
  };
  // Mode manette : une tablette sert de plateau ; à sa place, le téléphone montre les billes jouables, numérotées.
  const padPanel = h('div', { class: 'pad-panel', hidden: true });
  stage.append(padPanel);
  const fxScreen = h('div', { class: 'fx-layer', style: { zIndex: 38 } });
  // Fin de partie serrée : le cadre de la case rougit et bat avec le cœur de la musique (sous le plateau, qui passe devant).
  stage.append(h('div', { class: 'g-tense', 'aria-hidden': 'true' }), fxScreen);
  // BOUM : Toc surgit au bas du plateau, l'air ébahi.
  const tocPeek = () => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = h('div', { class: 'toc-peek', 'aria-hidden': 'true' }, mascot('surpris', 84, 'buste'));
    (fold ? stageTop : stage).append(el);
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
    // Libellés courts : le bouton partage sa ligne avec « Partager ». Qui est d'accord est écrit juste dessous.
    rematchUi.btn.textContent = mine ? `En attente… ${ok}/${votes.length}` : ok ? `Revanche (${ok}/${votes.length})` : 'Revanche !';
    rematchUi.btn.disabled = !!mine;
    rematchUi.who.replaceChildren(...votes.map((x) =>
      h('span', { class: 'victory__vote' + (x.ok ? ' victory__vote--ok' : '') }, `${x.ok ? '✓' : '…'} ${x.me ? 'Toi' : x.name}`)));
  };
  /** L'écran de fin en double page est affiché : il a emprunté la table (messages, réactions) à la grille de la partie. */
  let victorySpread = false;
  /** La dernière fin de partie montrée, pour la remontrer à la bonne taille si on plie ou déplie devant elle. */
  let lastEnd: { st: GameState; won: boolean } | null = null;
  const closeVictory = () => {
    rematchUi = null;
    closeEndChat();
    victoryEl?.remove();
    victoryEl = null;
    victoryInner = null;
    if (victorySpread) {
      victorySpread = false;
      // La table retourne à sa place dans la grille de la partie.
      if (fold) requestAnimationFrame(() => { if (!disposed) fit(); });
    }
    if (themeMeta && themeBefore !== null) themeMeta.content = themeBefore;
    themeBefore = null;
  };
  /** Les bandeaux (« À toi de jouer ! ») passent sous le plateau, sur la consigne ; sur un pliant, en travers du plateau. */
  const bannerY = () => (fold ? BOARD_Y + 196 : 452);
  const fx = (layer: 'board' | 'screen', it: Fx) => {
    if (it.kind === 'float') it = { ...it, x: Math.min(300, Math.max(60, it.x)), y: Math.max(40, it.y) };
    playFx(layer === 'board' ? fxBoard : fxScreen, it);
  };

  // ---------- Billes ----------
  /** Ce que porte un joueur (boutique) : soi-même d'après son profil, les autres d'après la salle. */
  const lookOfSeat = (s: number) => (s === me && !watching ? draftProfile().look : src.players[s]?.look);
  /** Une bille : son élément, son ombre sur le bois, sa position à l'écran (regard droit devant) et dans le plan du plateau. */
  type PawnEl = { outer: HTMLElement; inner: HTMLElement; shade: HTMLElement; y: number; fx: number; fy: number };
  const pawnEls = new Map<string, PawnEl>();
  const xy = (s: number, i: number, p: number) => pawnXY(g, me, s, i, p);
  for (let s = 0; s < N; s++)
    for (let i = 0; i < 4; i++) {
      const inner = billeSkin(bille(SEAT_COLORS[N][s], { size: Z.ps }), lookOfSeat(s)?.bille);
      const outer = tickUnder(h('div', { class: 'pawn', style: { width: Z.ps, height: Z.ps } }, inner));
      outer.addEventListener('click', () => onPawn({ s, i }));
      const shade = h('i', { class: 'pawn-shade' });
      pawnEls.set(`${s}.${i}`, { outer, inner, shade, y: 0, fx: 0, fy: 0 });
      pawnLayer.append(outer);
      shadeLayer.append(shade);
    }
  /** Le regard en cours sur le plateau (plateau en relief), de -1 à 1 : 0, 0 droit devant. */
  let lean: [number, number] = [0, 0];
  /** L'inclinaison du plateau vue avec ce regard. */
  const leanTilt = (): Tilt => { const t = tiltFor(); return { ...t, deg: t.deg + lean[1] * LOOK_PITCH, yaw: lean[0] * LOOK_YAW }; };
  /** Décale une bille de sa place de repos à sa place vue avec le regard en cours (elle reste debout, face à nous). */
  const leanPawn = (e: PawnEl, live: ReturnType<typeof projector> | null) => {
    if (!live) { e.outer.style.transform = ''; return; }
    // On suit le milieu de la bille, un peu au-dessus du bois : debout sur son trou, elle bouge un rien plus que son ombre.
    const h0 = Z.ps * 0.9, [x0, y0, s0] = proj.at(e.fx, e.fy, h0), [x1, y1, s1] = live.at(e.fx, e.fy, h0);
    e.outer.style.transform = `translate(${r1(x1 - x0)}px, ${r1(y1 - y0)}px) scale(${(s1 / s0).toFixed(4)})`;
  };
  /** Place une bille sur la progression p (durée de transition en ms, soulèvement en px). */
  const place = (s: number, i: number, p: number, dur = 0, lift = 0, extraZ = 0) => {
    const e = pawnEls.get(`${s}.${i}`)!;
    const [x, y] = xy(s, i, p);
    e.y = y;
    [e.fx, e.fy] = pawnXY(flat, me, s, i, p);
    // Son ombre, à plat sur le bois, du côté opposé à la lumière : elle suit la bille au sol, pas son soulèvement.
    const d = Z.ps * pawnBoost(), sw = d * 0.95, sh = d * (tiltFor().deg ? 0.66 : 0.86);
    e.shade.style.transition = dur ? `left ${dur}ms ease-out, top ${dur}ms ease-out` : 'none';
    e.shade.style.width = r1(sw) + 'px';
    e.shade.style.height = r1(sh) + 'px';
    e.shade.style.left = r1(e.fx + d * 0.36 - sw / 2) + 'px';
    e.shade.style.top = r1(e.fy + d * 0.3 - sh / 2) + 'px';
    if (lean[0] || lean[1]) leanPawn(e, projector(leanTilt()));
    e.outer.style.transition = dur ? `left ${dur}ms ease-out, top ${dur}ms ease-out, translate ${Math.round(dur / 2)}ms ease-out, scale ${dur}ms ease-out` : 'none';
    e.outer.style.left = r1(x - Z.ps / 2) + 'px';
    e.outer.style.top = r1(y - Z.ps * 0.62) + 'px';
    // Plus une bille est loin, plus elle est petite (vue inclinée).
    e.outer.style.scale = (proj.scaleAtY(y) * pawnBoost()).toFixed(3);
    e.outer.style.translate = lift ? `0 ${-lift}px` : '0 0';
    e.outer.style.zIndex = String(Math.round(y) + extraZ);
  };
  const unlift = (s: number, i: number) => { pawnEls.get(`${s}.${i}`)!.outer.style.translate = '0 0'; };
  const syncPawns = (st: GameState) => st.pawns.forEach((row, s) => row.forEach((pw, i) => place(s, i, pw.p)));

  // ---------- Persos ----------
  // Chaque joueur est une bille à visage, posée autour du plateau là où elle ne cache aucun trou.
  // Son humeur suit la partie : elle réfléchit à son tour, panique quand on la vise, enrage quand on la renvoie.
  type SeatEl = { root: HTMLElement; pulse: HTMLElement; spin: HTMLElement; cards: HTMLElement; chip: HTMLElement; face: HTMLElement; char: typeof src.players[number]['char']; color: typeof src.players[number]['color']; flip: boolean };
  const avEls: SeatEl[] = [];
  for (let s = 0; s < N; s++) {
    const size = Z.av, isMe = s === me && !watching;
    const pl = isMe ? { ...src.players[s], ...draftProfile() } : src.players[s];
    const pulse = h('div', { class: 'seat-av__pulse' });
    const spin = h('div', { class: 'seat-av__spin' });
    // L'étiquette : le nom et le nombre de cartes en main (« Mimi · 4 »). Dessous, une pastille : qui commence la donne
    // (pendant la donne et l'échange), puis qui joue après le joueur actif.
    const cards = h('span');
    const chip = h('i', { class: 'seat-av__chip', hidden: true });
    const name = h('span', { class: 'seat-av__name' }, pl.name, cards);
    const face = avatar(pl.char, pl.color, size);
    // Ton perso n'est pas dessiné sur ton téléphone, comme sur la maquette : la consigne te parle (« À toi, Frédo ! »).
    const rootAv = h('div', { class: 'seat-av', hidden: isMe, style: { width: size, height: size, '--c': tint(s).c, '--d': tint(s).d } },
      pulse, spin, face, h('div', { class: 'seat-av__tags' }, name, chip));
    avEls[s] = { root: rootAv, pulse, spin, cards, chip, face, char: pl.char, color: pl.color, flip: false };
    avLayer.append(rootAv);
  }
  /** Le haut et le bas des trous à l'écran (repère du plateau) : les noms et les bulles restent au-dessus ou en dessous. */
  const holesSpan = (): [number, number] => {
    const ys = [...g.track, ...g.lanes.flat(), ...g.res.flat()].map((p) => p[1]);
    return [Math.min(...ys) - 8, Math.max(...ys) + 8];
  };
  /** Pose les persos autour du plateau ; leur nom va du côté où il ne couvre aucun trou. */
  const placeAvatars = () => {
    const [, bot] = holesSpan();
    for (let s = 0; s < N; s++) {
      const [x0, y] = g.avs[armOf(N, me, s)], e = avEls[s], size = Z.av;
      const mode = avMode();
      // Jamais hors de ce qu'on voit : un perso posé dans un coin reste entier (plateau peint, vue inclinée).
      // Double page : il reste dans sa marge, même quand elle est étroite.
      const x = watching ? x0 : mode === 'marges' ? Math.min(vis.x1 - 21, Math.max(vis.x0 + 21, x0)) : Math.min(vis.x1 - size / 2 - 5, Math.max(vis.x0 + size / 2 + 5, x0));
      e.root.style.left = r1(x - size / 2) + 'px';
      e.root.style.top = r1(y - size / 2) + 'px';
      const isMe = s === me && !watching;
      // Au fond : le nom au-dessus du perso, dans la bande libre au-dessus du plateau. Sur les côtés proches :
      // à côté, vers le milieu (à 6, dessous : les persos des côtés sont au bout d'un bras).
      // Vue de la maquette : l'étiquette du partenaire part à sa gauche (sa bulle part à droite) ; celles des adversaires
      // se posent au-dessus d'eux, hors du plateau (dessous, elles couvriraient deux trous).
      const side = mode === 'marges' ? (x < 60 ? 'over-start' : x > 300 ? 'over-end' : 'left')
        : mockView() ? (x < 110 ? 'over-start' : x > 250 ? 'over-end' : 'left')
        // Tout en haut à gauche (vue de dessus), l'étiquette part à droite du perso : au-dessus, le récitatif de la manche
        // la cacherait ; dessous, elle couvrirait la réserve.
        : y < 150 ? (x < 110 ? (y - size / 2 < 40 ? 'right' : 'over-start') : x > 250 ? 'over-end' : 'right')
          : N === 6 && !isMe ? (x < 110 ? 'under-start' : x > 250 ? 'under-end' : 'under') : x < 110 ? 'right' : x > 250 ? 'left' : 'under';
      // Dans les coins proches (toi compris), l'étiquette part sur le côté, descendue sous la dernière rangée de trous.
      const low = y >= 150 && (side === 'right' || side === 'left');
      e.root.dataset.side = low ? side + '-low' : side;
      if (low) e.root.style.setProperty('--tag-top', r1(Math.max(size / 2 - 11, bot + 3 - (y - size / 2))) + 'px');
      // Les persos de droite regardent vers le plateau.
      const flip = x > 200;
      if (flip !== e.flip) { e.flip = flip; e.face.dataset.humeur = ''; }
    }
  };
  placeAvatars();

  // ---------- Le plateau en relief ----------
  // Incliner le téléphone change le point de vue : on regarde le plateau d'un peu plus à gauche, à droite, de plus haut
  // ou de plus bas. Le plan (bois, trous, ombres) reprend sa perspective, la tranche de la dalle se découvre, les billes
  // et les persos se replacent debout, le sol de la case suit : le plateau reste posé, il ne glisse pas sur son fond.
  const applyLean = (x: number, y: number) => {
    lean = [x, y];
    const rest = !x && !y;
    const t0 = tiltFor(), t1 = leanTilt(), live = rest ? null : projector(t1);
    // En mouvement, plus de transition sur le plan : il suit le capteur image par image, comme les billes.
    board.classList.toggle('board--live', !rest);
    plane.style.transform = (live ?? proj).css;
    cam.style.setProperty('--pitch', t1.deg.toFixed(2) + 'deg');
    cam.style.setProperty('--yaw', (t1.yaw ?? 0).toFixed(2) + 'deg');
    pathLayer.style.transform = ghostLayer.style.transform = rest ? '' : shiftCss(planeShift(t0, t1));
    // Le sol est sous la dalle : le coin du cadre du plateau, vu depuis l'intérieur de la case (bord de 3 px).
    ground.style.transform = rest ? '' : shiftCss(planeShift(t0, t1, -SLAB, [BOARD_X - 8, BOARD_Y - 81]));
    pawnEls.forEach((e) => leanPawn(e, live));
    // Le reflet des billes glisse un peu avec le regard.
    pawnLayer.style.setProperty('--hx', rest ? '0%' : r1(x * 9) + '%');
    pawnLayer.style.setProperty('--hy', rest ? '0%' : r1(-y * 8) + '%');
    const avs = planeAvs();
    for (let s = 0; s < N; s++) {
      // Dans les marges de la double page, les persos ne sont pas posés sur le plateau : ils ne le suivent pas.
      if (!live || avMode() !== 'coins') { avEls[s].root.style.translate = ''; continue; }
      const [ax, ay] = avs[armOf(N, me, s)], [x0, y0] = proj.at(ax, ay), [x1, y1] = live.at(ax, ay);
      // Un perso collé au bord de l'écran y reste : il ne sort pas du cadre en suivant le plateau.
      const left = parseFloat(avEls[s].root.style.left) || 0, lo = 3 + vis.x0 - left, hi = vis.x1 - Z.av - 3 - left;
      avEls[s].root.style.translate = `${r1(Math.min(Math.max(hi, 0), Math.max(Math.min(lo, 0), x1 - x0)))}px ${r1(y1 - y0)}px`;
    }
  };
  // Pas sur l'écran de table : posé à plat au milieu des joueurs, il ne bouge pas.
  const tilt3d = watching ? null : relief(applyLean);
  tilt3d?.sync();

  // ---------- Toast, émotes, choix ----------
  const toastBox = h('div');
  let toastTimer = 0;
  const toast = (t: string, ms = 1700) => {
    clearTimeout(toastTimer);
    toastBox.replaceChildren(h('div', { class: 'g-toast', role: 'status' }, t));
    toastTimer = window.setTimeout(() => toastBox.replaceChildren(), ms);
  };
  /** Ponctuation française : pas de « ! », « ? » ou « : » seul en début de ligne dans un message. */
  const typo = (t: string) => t.replace(/ (?=[!?:;»])/g, ' ').replace(/« /g, '« ');
  /**
   * Bulle d'un joueur. Elle ne couvre jamais les trous : pour les persos du fond, elle part sur le côté, dans la bande
   * au-dessus du plateau ; pour les autres (toi compris), elle se pose sous le plateau, sur une seule ligne.
   * Un message du chat tient sur deux lignes au fond ; le texte entier reste dans la barre du chat.
   */
  const bubble = (s: number, t: string, ms = 2200, long = false) => {
    if (s < 0) return;
    // Une réaction s'ajoute au fil de la table des pliants (les messages du chat y arrivent par ailleurs).
    if (!long) pushEmote(s, t);
    const mine = s === me && !watching;
    const mode = avMode();
    // Pliant : ton message est dans le fil de la table, sous ton pouce (ton perso n'est pas à l'écran) ;
    // quand les joueurs ont leur fiche, la bulle se pose sous les fiches.
    if (fold && mine) return;
    if (fold && mode === 'fiches') return foldBubble(s, t, ms);
    const [x, y] = g.avs[armOf(N, me, s)], half = Z.av / 2;
    const far = y < 180 && !mine;
    const b = h('div', { class: 'emote-bubble' + (long ? ' emote-bubble--chat' + (far ? '' : ' emote-bubble--line') : ''), 'data-seat': String(s), style: { '--c': tint(s).c } }, typo(t));
    bubbleLayer.querySelectorAll(`[data-seat="${s}"]`).forEach((n) => n.remove());
    bubbleLayer.append(b);
    const w = b.offsetWidth || 120, ht = b.offsetHeight || 34;
    const [top, bot] = holesSpan();
    // Repère du cadre du plateau : sur téléphone, l'écran va de -BOARD_X + 6 à 360 + BOARD_X - 6.
    const lo = vis.x0 + 6, hi = vis.x1 - 6 - w;
    let left: number, y0: number, tail: string;
    if (mode === 'marges') {
      // Double page : la bulle se pose au-dessus des étiquettes du perso, dans sa marge. Celle du partenaire, au fond,
      // part à sa gauche, par-dessus son étiquette : elle ne passe pas sur la pliure.
      const beside = avEls[s].root.dataset.side === 'left';
      left = beside ? x - half * 0.78 - 9 - w : x < 180 ? lo : hi;
      y0 = beside ? y - ht / 2 : Math.max(vis.y0 + 2, y - 56 - ht);
      tail = beside ? 'right' : x < 180 ? 'down' : 'down-end';
    } else if (mine) {
      // Ton perso n'est pas à l'écran : ta bulle sort du bouton du chat, au coin sous le plateau, sur une seule ligne.
      left = lo;
      y0 = ACTIONS_Y - BOARD_Y - ht - 6;
      tail = 'down';
    } else if (far) {
      // Dans les coins du fond, la bulle se cale contre le bord de l'écran, par-dessus le nom de celui qui parle :
      // elle ne masque ni les trous, ni le perso d'à côté. Au milieu du fond, elle part à droite du perso.
      left = x < 150 ? lo : x > 210 ? hi : x + half + 9;
      y0 = Math.max(60 - BOARD_Y, Math.min(y - ht / 2, top - 4 - ht));
      tail = x < 150 ? 'down' : x > 210 ? 'down-end' : 'left';
    } else {
      // Ton perso occupe déjà le coin sous le plateau : sa bulle part à sa droite, et celles des voisins s'écartent de lui.
      const own = y + half > bot;
      const meAv = watching ? null : g.avs[armOf(N, me, me)];
      const corner = !mine && meAv && meAv[1] + half > bot ? meAv[0] + half + 9 : lo;
      left = x < 180 ? Math.max(own ? x + half + 9 : x - half, corner) : x + half - w;
      y0 = own ? Math.max(bot + 2, y - ht / 2) : bot + 4;
      tail = own ? 'left' : x < 180 ? 'up' : 'up-end';
    }
    b.style.left = `${r1(Math.min(hi, Math.max(lo, left)))}px`;
    b.style.top = `${r1(y0)}px`;
    b.dataset.tail = tail;
    setTimeout(() => b.remove(), ms);
  };
  const emoteBtn = h('button', { class: 'btn-round btn-round--lg emote-btn', type: 'button', 'aria-label': 'Émotes', 'aria-expanded': 'false' },
    icon(ICONS.chat, 24, 2.8));
  tickUnder(emoteBtn);
  const emotePop = h('div', { class: 'pop pop--emotes', hidden: true },
    // Les émojis seuls (sans texte) s'affichent en plus grand.
    ...EMOTES.map((t) => tickUnder(h('button', { type: 'button', class: /\p{L}/u.test(t) ? undefined : 'pop__emoji', onclick: () => sendEmote(t) }, t))));
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
  const chatBubble = (s: number, t: string) => bubble(s, t.length > 44 ? t.slice(0, 43) + '…' : t, Math.min(7000, 2600 + t.length * 60), true);
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
  /** Le chat est-il sous les yeux ? (sinon les messages qui arrivent comptent comme pas lus) Sur un pliant, toujours : la table a sa place. */
  const chatVisible = () => (fold ? true : drawerOn ? drawerOpen : !chatPop.hidden);
  /** Range la liste et le champ du chat là où ils s'affichent selon la mise en page. */
  const homeChat = () => {
    if (!drawerOn) return void chatPop.append(chatList, chatForm);
    drawerPanel.append(chatList, chatForm);
    // Pliant : le fil de la table y est redessiné à sa façon ; seul le champ de saisie change de place.
    if (fold) pliSaisie.append(chatForm);
  };
  const syncDrawer = () => {
    if (!drawerOn) return;
    drawerPanel.hidden = !!fold || !drawerOpen;
    drawerBar.hidden = !!fold || drawerOpen;
  };
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
  // Pendant la saisie, sur téléphone : le chat monte en haut de l'écran, dans la partie visible au-dessus du clavier.
  // L'iPhone fait glisser la page pour montrer le champ : on suit la zone visible (visualViewport), rien n'est coupé.
  // On déplace le panneau, jamais le champ (le déplacer lui ferait perdre le clavier).
  let typing = false;
  const vv = window.visualViewport;
  /** Pliant : pendant la saisie, toute la grille tient dans la partie de l'écran que le clavier laisse libre. */
  const foldTyping = () => {
    const on = !!fold && document.activeElement === chatInput;
    const vTop = vv?.offsetTop ?? 0, vH = vv?.height ?? innerHeight;
    const kbd = on && vH < innerHeight - 60;
    root.classList.toggle('game--ecrit', kbd);
    // (l'écran de fin en double page suit la même règle)
    for (const box of [pli, victorySpread ? victoryInner : null]) {
      if (!box) continue;
      box.style.top = kbd ? `${Math.round(vTop)}px` : '';
      box.style.height = kbd ? `${Math.round(vH)}px` : '';
    }
    fit();
  };
  const placeTyping = () => {
    if (fold) return foldTyping();
    if (!typing) return;
    const safeTop = probe('padding-top:env(safe-area-inset-top)').t;
    const vTop = vv?.offsetTop ?? 0, vH = vv?.height ?? innerHeight;
    // Clavier pas encore ouvert : on place déjà le champ assez haut pour que l'iPhone n'ait pas à faire glisser la page.
    const kbd = vH < innerHeight * 0.8;
    const top = Math.max(vTop + 8, safeTop + 4);
    const bottom = kbd ? Math.max(top + 140, vTop + vH - 8) : top + Math.min(330, innerHeight * 0.42);
    const r = drawer.parentElement!.getBoundingClientRect(), k = r.width / STAGE_W;
    drawerPanel.style.top = `${(top - r.top) / k}px`;
    drawerPanel.style.height = `${(bottom - top) / k}px`;
  };
  const startTyping = () => {
    if (typing || !drawerOpen || layout !== 'phone') return;
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
  }
  vv?.addEventListener('resize', placeTyping);
  vv?.addEventListener('scroll', placeTyping);
  // L'iPhone peut aussi faire défiler toute la page : pendant la saisie, on la remet en place et on recale le chat.
  const onPageScroll = () => {
    if (!typing && !(fold && document.activeElement === chatInput)) return;
    if (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop) window.scrollTo(0, 0);
    placeTyping();
  };
  window.addEventListener('scroll', onPageScroll, true);
  chatInput.addEventListener('focus', () => (fold ? foldTyping() : startTyping()));
  chatInput.addEventListener('blur', () => setTimeout(() => {
    if (document.activeElement === chatInput) return;
    stopTyping();
    if (fold) foldTyping();
  }, 300));
  chatForm.addEventListener('submit', () => { if (drawerOpen) chatInput.focus(); });
  let unread = 0;
  const renderChat = (lines: TableMsg[]) => {
    chatList.replaceChildren(...(lines.length ? lines.slice(-40).map((m) => h('div', { class: 'table-chat__line' + (m.mine ? ' table-chat__line--me' : '') },
      h('b', { style: { color: m.seat >= 0 ? COL[SEAT_COLORS[N][m.seat]].c : 'var(--ink-2)' } }, m.mine ? 'Toi' : m.name), h('span', null, typo(m.t))))
      : [h('span', { class: 'table-chat__empty' }, 'Personne n’a encore écrit. Lance la discussion !')]));
    chatList.scrollTop = chatList.scrollHeight;
    chatFeed = lines.map((m) => ({ seat: m.seat, name: m.name, t: m.t, at: m.at, mine: m.mine }));
    renderFeed();
    const last = lines[lines.length - 1];
    lastLine.classList.toggle('chat-drawer__last--empty', !last);
    lastLine.replaceChildren(...(last ? [h('b', { style: { color: last.seat >= 0 ? COL[SEAT_COLORS[N][last.seat]].d : 'var(--ink-2)' } }, last.mine ? 'Toi' : last.name), h('span', null, typo(last.t))]
      : ['Chat de la table : écris aux autres']));
  };
  const setEmotes = (open: boolean) => {
    emotePop.hidden = !open;
    emoteBtn.setAttribute('aria-expanded', String(open));
    chatPop.hidden = !open || !src.chat || drawerOn;
    // Pliant : le bouton ouvre aussi de quoi écrire à la table (en livre, le champ est toujours là).
    const plume = open && !!fold && drawerOn;
    root.classList.toggle('game--plume', plume);
    if (plume && fold !== 'book') requestAnimationFrame(() => chatInput.focus({ preventScroll: true }));
    else if (!open && fold && fold !== 'book') chatInput.blur();
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
    if (!chatPop.contains(t) && !emotePop.contains(t) && !emoteBtn.contains(t) && !pliSaisie.contains(t)) setEmotes(false);
  };
  document.addEventListener('pointerdown', closeOutside, true);
  const sendEmote = (t: string) => {
    tap('touche');
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
  const tipBtn = tickUnder(h('button', { class: 'g-tip', type: 'button', onclick: () => suggest() }, 'Une astuce ?'));
  const resetSeven = tickUnder(h('button', { class: 'g-tip', type: 'button', onclick: () => { tap('touche'); chain = []; pick = null; render(); } }, 'Recommencer le partage'));
  const playBtn = tickUnder(button('Jouer !', 'primary', () => commit()));
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
  const hintEl = h('div', { class: 'g-hint', 'aria-live': 'polite' }, hintT, hintS, tipBtn, resetSeven);
  const actions = h('div', { class: 'g-actions' }, src.initiation ? coach : emoteBtn, hintEl, playBtn);
  // Minuteur : une mèche qui brûle vers la bombe ; l'étincelle suit le bout de la mèche.
  const timerBar = h('div', null, h('i', { class: 'g-timer__spark' }));
  /** Les secondes qui restent, au bout de la mèche */
  const timerLeft = h('span', { class: 'g-timer__left' });
  const timerEl = h('div', { class: 'g-timer', 'aria-hidden': 'true', hidden: true }, timerBar, timerLeft);
  const hand = h('div', { class: 'hand' });
  /** Étoile jaune derrière la carte choisie */
  const handHalo = h('div', { class: 'hand__halo', 'aria-hidden': 'true', hidden: true });
  stage.append(actions, timerEl, hand);
  lowEls.push(actions, timerEl, hand, drawer);
  root.classList.toggle('with-drawer', drawerOn);
  layoutHook = () => {
    if (!drawerOn) return;
    const home = fold ? pliSaisie : drawerPanel;
    if (!endChat && chatForm.parentElement !== home) homeChat();
    if (fold) { unread = 0; showUnread(); }
    syncDrawer();
  };

  // ---------- Pliants : l'album ouvert (maquette « TOC sur pliants ») ----------
  // Sur un pliant ou une tablette, la scène ne garde que le plateau : elle est posée dans une case de la grille, à son
  // échelle. Le reste quitte la scène pour les autres cases, à taille réelle : l'en-tête (pause, score, manche), les
  // fiches des joueurs, le fil des coups, les bavards (la table : messages et réactions) et la main (consigne, mèche,
  // cartes, « Jouer ! »). Chaque tenue range ces blocs à sa façon (game-fold.css) :
  //   grand ouvert : le plateau à cheval sur la pliure, les bavards sous le pouce gauche, la main sous le pouce droit ;
  //   en livre     : une page de chaque côté, rien sur la pliure ;
  //   en chevalet  : le plateau debout dans le volet du haut, la main à plat dans celui du bas ;
  //   à clapet     : pareil, sur un écran de téléphone.
  /** Les trois réactions sous le pouce (les autres sont derrière le bouton rond). */
  const QUICK = ['Bien joué !', 'Oh là là !', 'Aïe…'];
  const pliCase = h('div', { class: 'pli__case', 'aria-hidden': 'true' }, h('i'), h('b'), h('b'), h('u'));
  const pliTete = h('div', { class: 'pli__tete' });
  const pliPlateau = h('div', { class: 'pli__plateau' });
  const pliJoueurs = h('div', { class: 'pli__joueurs' });
  /** La bulle du dernier qui a parlé, sous les fiches (chevalet) */
  const pliBulle = h('div', { class: 'pli__bulle', hidden: true });
  const pliFilTitre = h('span', { class: 'pli__titre' });
  const pliCoups = h('div', { class: 'pli__coups' });
  const pliFil = h('div', { class: 'pli__fil' }, pliFilTitre, pliCoups);
  type FoldTab = 'table' | 'fil';
  let foldTab: FoldTab = 'table';
  /** Chevalet, clapet : le fil des coups s'ouvre en fenêtre depuis l'étiquette de la manche. */
  let filOpen = false;
  const tabBtn = (id: FoldTab, label: string) => h('button', { class: 'pli__onglet', type: 'button', 'aria-pressed': String(id === foldTab), onclick: () => { tap('touche'); foldTab = id; syncFoldTab(); } }, label);
  const tabTable = tabBtn('table', 'La table'), tabFil = tabBtn('fil', 'Le fil des coups');
  const pliCompte = h('span', { class: 'pli__compte' });
  const pliOnglets = h('div', { class: 'pli__onglets' }, tabTable, tabFil, pliCompte);
  const pliFeed = h('div', { class: 'pli__feed', role: 'log', 'aria-label': 'La table' });
  const pliBoite = h('div', { class: 'pli__boite' }, pliFeed);
  const pliPuces = h('div', { class: 'pli__puces', hidden: !!src.initiation },
    ...QUICK.map((t) => tickUnder(h('button', { class: 'pli__puce', type: 'button', onclick: () => sendEmote(t) }, t))));
  const pliSaisie = h('div', { class: 'pli__saisie' });
  const pliBavards = h('div', { class: 'pli__bavards' }, pliOnglets, pliBoite, pliPuces, pliSaisie);
  const pliRecit = h('div', { class: 'pli__recit' });
  const pliCartes = h('div', { class: 'pli__cartes' });
  const pliActions = h('div', { class: 'pli__actions' });
  const pliMain = h('div', { class: 'pli__main' }, pliRecit, pliCartes, pliActions);
  /** Ce qui passe par-dessus toute la grille (carte qui vole, bandeaux, messages, moments forts) : une seconde scène, calée sur la première. */
  const stageTop = h('div', { class: 'game__stage' });
  const pliDessus = h('div', { class: 'pli__dessus' }, stageTop);
  const pli = h('div', { class: 'pli', hidden: true }, h('i', { class: 'pli__pliure', 'aria-hidden': 'true' }), pliCase, pliTete, pliJoueurs, pliPlateau, pliFil, pliBavards, pliMain, pliDessus);
  root.append(pli);

  // La table : les messages du chat (en ligne) et les réactions, du plus ancien au plus récent.
  interface FeedLine { seat: number; name: string; t: string; at: number; mine: boolean }
  let chatFeed: FeedLine[] = [];
  const emoteFeed: FeedLine[] = [];
  const pushEmote = (s: number, t: string) => {
    emoteFeed.push({ seat: s, name: nameOf(s), t, at: Date.now(), mine: s === me && !watching });
    if (emoteFeed.length > 24) emoteFeed.shift();
    renderFeed();
  };
  const renderFeed = () => {
    if (!fold) return;
    const lines = [...chatFeed, ...emoteFeed].sort((a, b) => a.at - b.at).slice(-24);
    pliFeed.replaceChildren(...(lines.length
      ? lines.map((m) => h('div', { class: 'pli__msg' },
        m.seat >= 0 ? avatar(avEls[m.seat].char, avEls[m.seat].color, 30, m.mine ? 'malin' : 'content') : h('i'),
        h('span', null, h('b', null, m.mine ? 'Toi' : m.name), ' ' + typo(m.t))))
      : [h('span', { class: 'pli__vide' }, src.chat ? 'La table est bien calme. Lance la discussion !' : 'Les réactions de la table s’affichent ici.')]));
    pliFeed.scrollTop = pliFeed.scrollHeight;
    const here = src.players.filter((p, k) => k === me || p.bot || p.online).length;
    pliCompte.textContent = `${here} à table · ${lines.length} message${lines.length > 1 ? 's' : ''}`;
  };
  let bulleTimer = 0;
  /** Chevalet : la bulle de celui qui parle, sous les fiches (jamais sur le plateau). */
  const foldBubble = (s: number, t: string, ms: number) => {
    clearTimeout(bulleTimer);
    pliBulle.replaceChildren(h('b', { style: { color: tint(s).d } }, nameOf(s)), ' ' + typo(t.length > 44 ? t.slice(0, 43) + '…' : t));
    pliBulle.hidden = false;
    bulleTimer = window.setTimeout(() => { pliBulle.hidden = true; }, ms);
  };

  // Les fiches des joueurs (double page large, livre, chevalet) : dans l'ordre du tour, à partir de celui qui joue après toi.
  const ficheEls = new Map<number, { root: HTMLElement; face: HTMLElement; cards: HTMLElement; dots: HTMLElement; chip: HTMLElement }>();
  for (let k = 1; k < N; k++) {
    const s = (me + k) % N;
    const face = avatar(avEls[s].char, avEls[s].color, 44);
    const cards = h('span', { class: 'pli__fiche-cartes' });
    const dots = h('span', { class: 'pli__fiche-billes' }, h('i'), h('i'), h('i'), h('i'));
    const chip = h('em', { hidden: true });
    const rootF = h('div', { class: 'pli__fiche', style: { '--c': tint(s).c, '--d': tint(s).d, '--l': tint(s).l } }, face, h('div', null, h('b', null, nameOf(s)), cards, dots, chip));
    ficheEls.set(s, { root: rootF, face, cards, dots, chip });
    pliJoueurs.append(rootF);
  }
  pliJoueurs.append(pliBulle);

  // Le fil des coups : les derniers coups joués, puis à qui le tour.
  let filKey = '';
  const renderFil = () => {
    if (!fold) return;
    const round = `Manche ${Math.floor(view.dealNo / 3) + 1} · Donne ${(view.dealNo % 3) + 1}`;
    pliFilTitre.textContent = fold === 'book' ? `${round} · Le fil des coups` : 'Le fil des coups';
    const moves = view.log.filter((e) => e.card || /défausse/.test(e.text)).slice(-(fold === 'book' ? 3 : 4));
    const turn = view.phase === 'play' ? view.turn : -1;
    const key = [fold, foldShape, view.dealNo, view.phase, turn, ...moves.map((e) => `${e.seat}${e.card}${e.text}`)].join('|');
    if (key === filKey) return;
    filKey = key;
    pliCoups.replaceChildren(
      ...moves.map((e) => {
        const c = e.card ? cardLook(e.card, view.variants) : null;
        return h('div', { class: 'pli__coup' },
          avatar(avEls[e.seat].char, avEls[e.seat].color, 28),
          h('span', null, h('b', null, nameOf(e.seat)), ' ' + logText(e.text, e.seat)),
          c && h('em', { style: { color: c.k === 'X' ? 'var(--violet-d)' : c.red ? 'var(--card-red)' : 'var(--ink)' } }, c.r));
      }),
      ...(moves.length ? [] : [h('span', { class: 'pli__vide' }, 'Aucun coup pour l’instant.')]),
      ...(turn >= 0 ? [h('div', { class: 'pli__coup pli__coup--tour' },
        avatar(avEls[turn].char, avEls[turn].color, 28, 'concentre'),
        h('span', null, turn === me && !watching ? 'À toi de jouer !' : `${nameOf(turn)} réfléchit…`))] : []),
      h('span', { class: 'pli__pioche' }, deckText()));
  };
  /** Qui montre le fil des coups : un onglet des bavards (double page), une fenêtre (chevalet, clapet), sinon il a sa place. */
  const syncFoldTab = () => {
    const tabs = fold === 'open' && foldShape === 'duo', pop = fold === 'tent' || fold === 'flip';
    const fil = tabs && foldTab === 'fil';
    tabTable.setAttribute('aria-pressed', String(!fil));
    tabFil.setAttribute('aria-pressed', String(fil));
    tabFil.hidden = !tabs;
    pliFeed.hidden = fil;
    pliFil.hidden = tabs ? !fil : pop && !filOpen;
    pliFil.classList.toggle('pli__fil--fenetre', pop);
    roundEl.setAttribute('aria-expanded', String(tabs ? fil : pop && filOpen));
  };
  /** L'étiquette de la manche (ou « Derniers coups », dans la pause) montre le fil des coups. */
  const foldJournal = (open?: boolean) => {
    if (fold === 'open' && foldShape === 'duo') foldTab = open ?? foldTab !== 'fil' ? 'fil' : 'table';
    else filOpen = open ?? !filOpen;
    syncFoldTab();
  };

  // La main sur un pliant : des cartes à plat, en rangées, dans un cadre mis à l'échelle de sa case.
  const HAND_GAP = 12, HAND_LIFT = 22, CARD_H = 142;
  const handGrid = (n: number) => {
    // Trois volets : la main tient dans le volet de droite, sur deux rangées.
    const per = fold === 'open' && foldShape === 'trio' ? 3 : Math.max(5, n);
    const rows = Math.max(1, Math.ceil(n / per));
    return { per, rows, bw: per * CARD_W + (per - 1) * HAND_GAP, bh: rows * CARD_H + (rows - 1) * HAND_GAP + HAND_LIFT };
  };
  /** Le coin haut gauche de la carte i d'une main de n cartes (repère du cadre de la main) ; `on` : la carte choisie, qui sort du rang. */
  const handSpot = (i: number, n: number, on = false): [number, number] => {
    const { per, bw } = handGrid(n);
    const row = Math.floor(i / per), inRow = Math.min(per, n - row * per);
    const x0 = (bw - (inRow * CARD_W + (inRow - 1) * HAND_GAP)) / 2;
    return [x0 + (i - row * per) * (CARD_W + HAND_GAP), row * (CARD_H + HAND_GAP) + (on ? 0 : HAND_LIFT)];
  };
  let handRows = 1;
  const fitHand = () => {
    const { bw, bh, rows } = handGrid(myHand().length);
    handRows = rows;
    // Plié à l'horizontale, la main tient dans le volet du bas : sur un écran court, les cartes rapetissent plutôt que de déborder.
    const low = fold === 'flip' || fold === 'tent' ? root.clientHeight - (foldPanes(fold)?.[1].y ?? root.clientHeight / 2) : 0;
    const room = fold === 'flip' ? low - 302 : fold === 'tent' ? low - 170 : Infinity;
    const k = Math.max(0.4, Math.min(pliCartes.clientWidth / bw, room / (bh + 6), fold === 'tent' ? 1.05 : 0.8));
    hand.style.width = bw + 'px';
    hand.style.height = bh + 'px';
    hand.style.setProperty('--hk', k.toFixed(4));
    // La rangée réserve la place de la main à son échelle (l'étoile de la carte choisie dépasse un peu au-dessus, comme sur la maquette).
    pli.style.setProperty('--ch', Math.round((bh + 6) * k) + 'px');
    hand.style.left = r1(Math.max(0, (pliCartes.clientWidth - bw * k) / 2)) + 'px';
    hand.style.top = Math.round(6 * k) + 'px';
  };
  /** Un point de l'écran, dans le repère de la scène. */
  const toStage = (cx: number, cy: number): [number, number] => {
    const r = stage.getBoundingClientRect(), k = r.width / STAGE_W || 1;
    return [(cx - r.left) / k, (cy - r.top) / k];
  };
  /**
   * La région de la scène que montre la case du plateau : largeur, hauteur et hauteur de son milieu (unités de la scène).
   * Dans les coins : comme sur le téléphone, le partenaire au-dessus du bord du fond. Dans les marges : le plateau et de
   * quoi loger un perso de chaque côté. Avec les fiches : le plateau seul.
   */
  const foldRegion = () => {
    const seated = !!tiltFor().deg;
    if (avMode() === 'coins') return { w: STAGE_W, h: seated ? 328 : 340, cy: BOARD_Y + (seated ? 176 : 180) };
    if (avMode() === 'fiches') return { w: 372, h: seated ? 292 : 322, cy: BOARD_Y + (seated ? 208 : 181) };
    return { w: 470, h: seated ? 300 : 326, cy: BOARD_Y + (seated ? 195 : 181) };
  };
  const mountFold = (on: boolean) => {
    pli.hidden = !on;
    root.classList.toggle('game--pli', on);
    if (on) {
      pliTete.append(gTop, roundEl);
      pliPlateau.append(frame);
      pliRecit.append(...(src.initiation ? [coach] : []), hintEl);
      pliActions.append(tipBtn, resetSeven, playBtn);
      pliCartes.append(hand);
      pliMain.insertBefore(timerEl, pliCartes);
      pliMain.append(choicePop);
      stageTop.append(fxScreen, toastBox);
      if (!src.initiation) pliPuces.append(emoteBtn, emotePop);
      frame.style.cssText = '';
      toggleJournal(false);
      setDrawer(false);
      return;
    }
    // On referme le pliant : tout retourne dans la scène, à ses cotes de téléphone.
    fold = '';
    foldScale = 1;
    vis = PHONE_VIS;
    filOpen = false;
    delete root.dataset.avs;
    root.classList.remove('game--ecrit', 'game--plume');
    pli.style.top = pli.style.height = '';
    root.prepend(frame);
    stage.append(gTop, roundEl, fxScreen, toastBox, emotePop, choicePop);
    hintEl.append(tipBtn, resetSeven);
    actions.append(src.initiation ? coach : emoteBtn, hintEl, playBtn);
    pliBavards.append(pliBoite, pliPuces, pliSaisie);
    for (const p of ['width', 'height', 'left', 'top', '--hk']) hand.style.removeProperty(p);
    handHalo.style.top = '';
    root.style.removeProperty('--u');
    root.style.removeProperty('--bas');
    roundEl.setAttribute('aria-expanded', 'false');
    setEmotes(false);
    homeChat();
    retilt();
  };
  const fitFold = (p: Exclude<Pose, 'phone'>) => {
    const shape: Shape = p === 'open' ? shapeOf(root.clientWidth, root.clientHeight) : 'duo';
    const changed = p !== fold || shape !== foldShape;
    fold = p;
    foldShape = shape;
    pli.dataset.tenue = p;
    pli.dataset.forme = shape;
    pli.style.setProperty('--teams', String(N / 2));
    root.dataset.avs = avMode();
    // Ce téléphone montre la double page : refermé, il saura dire « Déplie-moi ».
    if (p !== 'flip') noteOpened();
    // Plié : chaque volet a sa place de part et d'autre de la pliure, rien d'important dessus.
    const two = foldPanes(p);
    root.style.setProperty('--pa', two ? `${Math.round(p === 'book' ? two[0].x + two[0].w : two[0].y + two[0].h)}px` : '50%');
    root.style.setProperty('--pb', two ? `${Math.round(p === 'book' ? two[1].x : two[1].y)}px` : '50%');
    const filHome = p === 'open' && shape === 'duo' ? pliBoite : p === 'open' && shape === 'trio' ? pliMain : pli;
    if (pliFil.parentElement !== filHome) {
      if (filHome === pliMain) pliMain.insertBefore(pliFil, pliActions);
      else filHome.append(pliFil);
    }
    // Chevalet : les réactions, le dernier message et le champ de saisie rejoignent la main, dans le volet du bas ;
    // le bouton rond s'y range au bout du dernier message.
    // (Tant que l'écran de fin en double page est affiché, la table y reste.)
    const low = p === 'tent' ? pliMain : pliBavards;
    if (!victorySpread && pliBoite.parentElement !== low) low.append(pliBoite, pliPuces, pliSaisie);
    const btnHome = p === 'tent' && !victorySpread ? pliBoite : pliPuces;
    if (!src.initiation && emoteBtn.parentElement !== btnHome) btnHome.append(emoteBtn, emotePop);
    if (changed) filOpen = false;
    syncFoldTab();
    fitHand();
    const cw = pliPlateau.clientWidth, ch = pliPlateau.clientHeight;
    if (!cw || !ch) return;
    const R = foldRegion();
    const S = Math.min(cw / R.w, ch / R.h);
    const tx = cw / 2 - (STAGE_W / 2) * S, ty = ch / 2 - R.cy * S;
    foldScale = S;
    stage.style.transform = stageTop.style.transform = `translate(${r1(tx)}px,${r1(ty)}px) scale(${S.toFixed(4)})`;
    root.style.setProperty('--u', (1 / S).toFixed(4));
    root.style.setProperty('--bas', r1((ch - ty) / S) + 'px');
    vis = { x0: -tx / S - BOARD_X, x1: (cw - tx) / S - BOARD_X, y0: -ty / S - BOARD_Y, y1: (ch - ty) / S - BOARD_Y };
    if (changed) {
      filKey = '';
      retilt();
      renderFeed();
    } else {
      g = seen();
      placeAvatars();
    }
  };
  foldUi = { mount: mountFold, fit: fitFold };

  // ---------- Sélection ----------
  let sel: number | null = null;
  let jokerAs: Rank | null = null;
  let pick: PawnRef | null = null;
  let target: PawnRef | null = null;
  /** Partage du 7 en cours : les mouvements déjà choisis, dans l'ordre où ils seront joués. */
  let chain: SevenPart[] = [];
  /** Explication de l'astuce affichée tant que sa sélection est en place. */
  let tip: string | null = null;
  /**
   * Bille devant sa maison : la rentrer, refaire un tour, ou défausser (si refaire un tour est le seul coup).
   * Bille dans sa maison, avec le 4 : la faire ressortir, ou défausser (si c'est le seul coup).
   */
  type Way = 'home' | 'lap' | 'out' | 'discard';
  let way: Way | null = null;
  const clearSel = () => { sel = null; jokerAs = null; pick = null; target = null; chain = []; tip = null; way = null; };

  const myHand = () => (watching ? [] : view.hands[me] ?? []);
  const myTurn = () => !watching && !busy && view.phase === 'play' && view.turn === me;
  // L'échange se choisit même pendant l'animation de distribution.
  const giving = () => !watching && view.phase === 'exchange' && !view.exchange[me];

  /** Une arrivée possible d'une bille pendant le partage du 7. */
  interface SevenDest {
    part: SevenPart;
    /** Progression d'arrivée */
    p: number;
    kind: 'track' | 'home' | 'lap';
    /** Place de la bille prise à l'arrivée, -1 si aucune */
    victim: number;
  }
  interface SevenPlan {
    /** Billes qui peuvent commencer le partage */
    firsts: PawnRef[];
    /** Billes qui peuvent prendre les pas restants */
    next: PawnRef[];
    /** Arrivées à toucher : celles de la bille choisie, ou l'autre façon de jouer la dernière bille */
    dests: SevenDest[];
    /** Pas encore à placer */
    left: number;
  }
  interface Plan {
    moves: Move[];
    chosen: Move | null;
    cands: PawnRef[];
    targets: PawnRef[];
    jokerValues: Rank[];
    /** Partage du 7 (null pour les autres cartes) */
    seven: SevenPlan | null;
    /** Plusieurs façons de jouer la même bille (devant sa maison) : le joueur choisit */
    ways?: Way[];
  }
  const decide = (opts: Move[], ms: Move[]): { chosen: Move | null; ways: Way[] } => {
    const by: Partial<Record<Way, Move>> = {
      home: opts.find((m) => !isLap(m) && !leavesHome(view, m)), lap: opts.find((m) => isLap(m)), out: opts.find((m) => leavesHome(view, m)),
    };
    // La défausse n'est permise que si tous les coups sont facultatifs (refaire un tour, ressortir de sa maison).
    if (by.lap || by.out) by.discard = ms.find((m) => m.kind === 'discard');
    const ways = (['home', 'lap', 'out', 'discard'] as const).filter((w) => by[w]);
    if (ways.length <= 1) return { chosen: ways.length ? by[ways[0]]! : null, ways: [] };
    return { chosen: way && by[way] ? by[way]! : null, ways };
  };
  const empty: Plan = { moves: [], chosen: null, cands: [], targets: [], jokerValues: [], seven: null };

  // ---------- Partage du 7 : on touche la bille, puis la case où elle arrive ----------
  type SevenMove = Extract<Move, { kind: 'seven' }>;
  const samePart = (a: SevenPart, b: SevenPart) => sameRef(a.pawn, b.pawn) && a.steps === b.steps && !!a.lap === !!b.lap;
  const partOf = (o: SevenPart): SevenPart => (o.lap ? { pawn: o.pawn, steps: o.steps, lap: true } : { pawn: o.pawn, steps: o.steps });
  const uniqRefs = (rs: PawnRef[]) => rs.filter((r, k) => rs.findIndex((x) => sameRef(x, r)) === k);
  /** Où arrive une bille du 7, et ce qu'elle y fait. */
  const sevenDest = (o: SevenPart): SevenDest => {
    const ps = walk(view.pawns[o.pawn.s][o.pawn.i].p, o.steps, !!o.lap);
    const p = ps[ps.length - 1];
    const hit = p >= 0 && p < L ? occupant(N, view.pawns, squareOf(N, o.pawn.s, p), o.pawn) : null;
    return { part: partOf(o), p, kind: inHome(N, p) ? 'home' : o.lap ? 'lap' : 'track', victim: hit ? hit.s : -1 };
  };
  const planSeven = (sevens: SevenMove[]): SevenPlan & { cands: PawnRef[] } => {
    const withPre = (pre: SevenPart[]) => sevens.filter((m) => pre.every((q, k) => !!m.parts[k] && samePart(m.parts[k], q)));
    /** Mouvements possibles juste après `pre` (sans doublon). */
    const optsAt = (pre: SevenPart[]) => {
      const out: SevenPart[] = [];
      for (const m of withPre(pre)) {
        const o = m.parts[pre.length];
        if (o && !out.some((x) => samePart(x, o))) out.push(o);
      }
      return out;
    };
    if (chain.length && !withPre(chain).length) chain = [];
    // Un seul partage possible : il est déjà prêt.
    if (!chain.length && sevens.length === 1) {
      chain = sevens[0].parts.map(partOf);
      pick = null;
    }
    const left = 7 - chain.reduce((a, q) => a + q.steps, 0);
    const firsts = uniqRefs(sevens.map((m) => m.parts[0].pawn));
    const next = left > 0 && chain.length ? uniqRefs(optsAt(chain).map((o) => o.pawn)) : [];
    let raw: SevenPart[] = [];
    if (left > 0 && pick) raw = optsAt(chain).filter((o) => sameRef(o.pawn, pick!));
    else if (!left && chain.length) {
      // Partage complet : l'autre façon de jouer la dernière bille (rentrer ou refaire un tour) reste à toucher.
      const last = chain[chain.length - 1];
      raw = optsAt(chain.slice(0, -1)).filter((o) => sameRef(o.pawn, last.pawn) && o.steps === last.steps && !samePart(o, last));
    }
    return { firsts, next, left, dests: raw.map(sevenDest), cands: uniqRefs([...firsts, ...next, ...chain.map((q) => q.pawn)]) };
  };
  /** Complète le partage tant qu'il n'y a pas de vrai choix : une seule arrivée, ou la seule bille qui peut finir. */
  const settleSeven = () => {
    for (let guard = 0; guard < 8; guard++) {
      const sv = plan().seven;
      if (!sv || !sv.left) return;
      if (!pick) {
        if (!chain.length || sv.next.length !== 1) return;
        pick = sv.next[0];
        continue;
      }
      const ds = sv.dests;
      if (ds.length === 1) {
        chain = [...chain, ds[0].part];
        pick = null;
        continue;
      }
      // Les pas restants finissent le 7 de plusieurs façons (rentrer ou refaire un tour) : la maison d'abord,
      // l'autre façon reste à toucher sur le plateau.
      if (chain.length && ds.length && ds.every((d) => d.part.steps === sv.left)) {
        chain = [...chain, (ds.find((d) => d.kind !== 'lap') ?? ds[0]).part];
        pick = null;
      }
      return;
    }
  };
  /** « rentre au 2e trou de la maison », « refait un tour, prend la bille de Coco »… */
  const destText = (d: SevenDest) => {
    const p0 = view.pawns[d.part.pawn.s][d.part.pawn.i].p;
    const what = d.kind === 'home' ? `${inHome(N, p0) ? 'va' : 'rentre'} au ${HOME_HOLES[homeIndex(N, d.p)]} de la maison`
      : d.kind === 'lap' ? 'refait un tour' : `avance de ${d.part.steps}`;
    const whose = d.part.pawn.s === me ? '' : `(bille ${deNom(nameOf(d.part.pawn.s))}) `;
    return whose + what + (d.victim < 0 ? '' : `, prend ${d.victim === me ? 'ta bille' : 'la bille ' + deNom(nameOf(d.victim))}`);
  };
  const svIcon = (k: keyof typeof SV_ICONS) => {
    const el = h('span', { class: 'sv-ic' });
    el.innerHTML = SV_ICONS[k];
    return el;
  };
  const tintVars = (s: number) => ({ '--c': tint(s).c, '--d': tint(s).d, '--l': tint(s).l });
  /** Étiquette d'un mouvement du 7 : son numéro d'ordre, maison ou tour, les pas, une étoile s'il prend une bille. */
  const sevenChip = (d: SevenDest, n: number) =>
    h('span', { class: `sv-chip sv-chip--${d.kind}`, style: tintVars(d.part.pawn.s) },
      h('i', null, String(n)), d.kind === 'track' ? null : svIcon(d.kind), '+' + d.part.steps, d.victim >= 0 ? svIcon('cap') : null);

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
      const sv = planSeven(play.filter((m): m is SevenMove => m.kind === 'seven'));
      const chosen = sv.left ? null
        : play.find((m) => m.kind === 'seven' && m.parts.length === chain.length && m.parts.every((q, k) => samePart(q, chain[k]))) ?? null;
      return { moves: ms, chosen, cands: sv.cands, targets: [], jokerValues, seven: sv };
    }
    if (!pick) return { moves: ms, chosen: null, cands, targets: [], jokerValues, seven: null };
    const mine = play.filter((m): m is Exclude<typeof m, { kind: 'seven' }> => m.kind !== 'seven' && sameRef(m.pawn, pick!));
    if (mine[0]?.kind === 'swap') {
      const targets = mine.map((m) => (m.kind === 'swap' ? m.target : m.pawn));
      if (!target && targets.length === 1) target = targets[0];
      const chosen = target ? mine.find((m) => m.kind === 'swap' && sameRef(m.target, target!)) ?? null : null;
      return { moves: ms, chosen, cands, targets, jokerValues, seven: null };
    }
    const { chosen, ways } = decide(mine, ms);
    return { moves: ms, chosen, cands, targets: [], jokerValues, ways, seven: null };
  };

  const onPawn = (r: PawnRef) => {
    const pl = plan();
    tip = null; // le joueur choisit lui-même : l'explication de l'astuce ne vaut plus
    if (pl.targets.some((t) => sameRef(t, r))) target = r;
    else if (pl.seven) {
      // Le 7 : s'il reste des pas, la bille touchée les prend ; sinon elle commence un nouveau partage.
      // Dans les deux cas, on montre ensuite ses arrivées possibles.
      const sv = pl.seven;
      if (sv.left && chain.length && sv.next.some((c) => sameRef(c, r))) pick = r;
      else if (sv.firsts.some((c) => sameRef(c, r))) {
        chain = [];
        pick = r;
      } else return;
      settleSeven();
    } else if (pl.cands.some((c) => sameRef(c, r))) {
      pick = r;
      target = null;
      way = null;
    } else return;
    tap('bille');
    render();
  };

  /** Une arrivée du 7 touchée : la bille y va, et les pas restants vont à l'autre bille quand il n'y a pas de doute. */
  const onDest = (d: SevenDest) => {
    const sv = plan().seven;
    if (!sv) return;
    tip = null;
    // Partage déjà complet : c'est l'autre façon de jouer la dernière bille.
    chain = sv.left ? [...chain, d.part] : [...chain.slice(0, -1), d.part];
    pick = null;
    tap('bille');
    settleSeven();
    render();
  };

  /** Progressions successives d'un pion qui fait `steps` pas (négatif = recule). */
  const walk = (p: number, steps: number, lap = false) => {
    const out: number[] = [];
    // À reculons, une bille en maison redescend vers son 1er trou puis ressort par le trou d'entrée.
    const back = (q: number) => (inHome(N, q) ? (q === L + 1 ? homeEntry(N) : q - 1) : (q - 1 + L) % L);
    for (let k = 0; k < Math.abs(steps); k++) out.push((p = steps > 0 ? (lap && p === homeEntry(N) ? 0 : stepForward(N, p)) : back(p)));
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
  /** Places dont le coup renverrait une bille. Sur la tablette, la main du joueur n'est pas connue : on y met la carte jouée. */
  const victimsOf = (m: Move): number[] => {
    try {
      const st = watching ? { ...view, hands: view.hands.map((hd, k) => (k === view.turn ? [m.card] : hd ?? [])) } : view;
      return applyMove(st, m).lastCaptures.map((c) => c.s);
    } catch { return []; }
  };
  const captures = (m: Move) => victimsOf(m).length > 0;

  const preview = (pl: Plan) => {
    pathLayer.replaceChildren();
    ghostLayer.replaceChildren();
    if (!watching && pl.seven) return previewChain(pl);
    const m = watching ? aimedMove() : pl.chosen;
    const sevenSplit = watching ? aimedSplit() : [];
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

  /**
   * Partage du 7 sur son téléphone : chemin et arrivée de chaque bille déjà placée (numérotée dans l'ordre du coup),
   * et les arrivées encore à toucher (pleine : maison, pointillés : refaire un tour).
   */
  const previewChain = (pl: Plan) => {
    const sv = pl.seven!;
    chain.forEach((q, n) => {
      const d = sevenDest(q);
      const ps = walk(view.pawns[q.pawn.s][q.pawn.i].p, q.steps, !!q.lap);
      ps.slice(0, -1).forEach((p, j) => {
        if (inHome(N, p)) return;
        const [x, y] = g.track[trackIndex(g, me, q.pawn.s, p)], dz = Z.hs * 0.5;
        pathLayer.append(h('div', { class: 'path-dot', style: { left: r1(x - dz / 2), top: r1(y - dz / 2), width: r1(dz), height: r1(dz), animation: `tocPath 1.1s ease-in-out ${((j + 1) * 0.07).toFixed(2)}s infinite` } }));
      });
      const [x, y] = xy(q.pawn.s, q.pawn.i, d.p), z = Z.ps + 8;
      ghostLayer.append(
        h('div', { class: 'ghost', style: { left: r1(x - z / 2), top: r1(y - z / 2), width: z, height: z, borderColor: d.victim >= 0 ? 'var(--ink)' : tint(q.pawn.s).c } }),
        h('div', { class: `seven-pill seven-pill--${d.kind}`, style: { left: r1(x), top: r1(y - Z.ps / 2 - 13), ...tintVars(q.pawn.s) } },
          h('i', null, String(n + 1)), d.kind === 'track' ? null : svIcon(d.kind), '+' + q.steps, d.victim >= 0 ? svIcon('cap') : null));
    });
    const dz = Z.hs + 6;
    for (const d of sv.dests) {
      const [x, y] = xy(d.part.pawn.s, d.part.pawn.i, d.p);
      ghostLayer.append(h('button', {
        class: `dest-tag dest-tag--${d.kind}${d.victim >= 0 ? ' dest-tag--cap' : ''}`, type: 'button',
        style: { left: r1(x - dz / 2), top: r1(y - dz / 2), width: dz, height: dz, ...tintVars(d.part.pawn.s) },
        'aria-label': `${d.part.steps} pas : ${destText(d)}`, onclick: () => onDest(d),
      }, '+' + d.part.steps));
    }
    // Rentrer et refaire un tour se côtoient : on nomme la maison, au bout de son couloir.
    const homeD = sv.dests.find((d) => d.kind === 'home');
    if (homeD && sv.dests.some((d) => d.kind === 'lap')) {
      const s = homeD.part.pawn.s, ln = g.lanes[armOf(N, me, s)];
      const [ax, ay] = ln[0], [bx, by] = ln[HOME_SIZE - 1], len = Math.hypot(bx - ax, by - ay) || 1;
      ghostLayer.append(h('div', { class: 'home-label', style: { left: r1(bx + ((bx - ax) / len) * 28), top: r1(by + ((by - ay) / len) * 28), ...tintVars(s) } }, svIcon('home'), 'Maison'));
    }
    return pl.chosen ? captures(pl.chosen) : false;
  };
  /** La zone du plateau à montrer de près pendant le partage du 7 (null : tout le plateau). */
  const sevenFocus = (pl: Plan) => {
    if (watching || !pl.seven || (!pick && !chain.length) || manette()) return null;
    const pts: number[][] = [];
    const at = (r: PawnRef, p: number) => pts.push(xy(r.s, r.i, p));
    for (const q of chain) {
      at(q.pawn, view.pawns[q.pawn.s][q.pawn.i].p);
      at(q.pawn, sevenDest(q).p);
    }
    if (pick) at(pick, view.pawns[pick.s][pick.i].p);
    for (const d of pl.seven.dests) at(d.part.pawn, d.p);
    for (const r of pl.seven.next) at(r, view.pawns[r.s][r.i].p);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    // Marge autour des billes, un peu plus en haut pour les étiquettes posées au-dessus des arrivées.
    const x0 = Math.min(...xs) - 30, x1 = Math.max(...xs) + 30, y0 = Math.min(...ys) - 44, y1 = Math.max(...ys) + 30;
    const size = Math.max(x1 - x0, y1 - y0, 200);
    // Trop étalé : le plateau entier se lit aussi bien.
    if (size > 320) return null;
    const clamp = (v: number) => Math.max(0, Math.min(360 - size, v));
    return { x: clamp((x0 + x1 - size) / 2), y: clamp((y0 + y1 - size) / 2), w: size };
  };
  /** Écran de table : sur chaque bille et sur sa case d'arrivée, une étiquette « +n ». Gris si le partage ne joue pas. */
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
      tap('jouer');
      clearSel();
      stopTimer();
      src.give(card);
      return;
    }
    const pl = plan();
    if (!pl.chosen) return;
    tap('jouer');
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
    tap('touche');
    clearSel();
    const hand = myHand();
    if (m.kind === 'discard') {
      sel = Math.max(0, m.card ? hand.indexOf(m.card) : 0);
      tip = m.card ? 'Aucun coup possible : défausse cette carte.' : 'Aucun coup possible : tu passes la donne.';
      return render();
    }
    sel = hand.indexOf(m.card);
    if (rankOf(m.card) === 'X') jokerAs = m.as;
    if (m.kind === 'seven') chain = m.parts.map(partOf);
    else {
      pick = m.pawn;
      if (m.kind === 'swap') target = m.target;
    }
    const after = applyMove(view, m);
    const victims = [...new Set(after.lastCaptures.filter((c) => teamOf(N, c.s) !== teamOf(N, me)).map((c) => nameOf(c.s)))];
    const home = m.kind !== 'seven' && inHome(N, after.pawns[m.pawn.s][m.pawn.i].p) && !inHome(N, view.pawns[m.pawn.s][m.pawn.i].p);
    let text = m.kind === 'exit' ? `Sors une bille avec ${cardName(m.card)}.`
      : m.kind === 'swap' ? `Échange ta bille avec celle ${deNom(nameOf(m.target.s))}.`
        : m.kind === 'seven' ? (m.parts.length > 1 ? `Partage ton 7 : ${m.parts.map((p) => p.steps).join(' + ')}.` : 'Avance cette bille de 7.')
          : m.steps < 0 ? (leavesHome(view, m) ? 'Fais ressortir cette bille de ta maison avec le 4.' : 'Recule cette bille de 4 : elle se rapproche de sa maison.')
            : `Avance cette bille de ${m.steps} avec ${cardName(m.card)}.`;
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
    renderFil();
    if (journal.hidden) return;
    journal.replaceChildren(h('span', { class: 't-label' }, 'Les 4 derniers coups'), h('span', { class: 'g-deck-line' }, deckText()), ...journalRows(4));
  };
  const toggleJournal = (want?: boolean) => {
    // Pliant : le fil des coups a sa place dans la grille (un onglet, une colonne ou une fenêtre).
    if (fold) return foldJournal(want);
    const open = want ?? !!journal.hidden;
    journal.hidden = !open;
    journalBtn.setAttribute('aria-expanded', String(open));
    renderJournal();
  };
  // Un toucher ailleurs referme le journal.
  const closeJournalOutside = (e: Event) => {
    const t = e.target as Node;
    if (fold) { if (filOpen && !pliFil.contains(t) && !journalBtn.contains(t)) foldJournal(false); }
    else if (!journal.hidden && !journal.contains(t) && !journalBtn.contains(t)) toggleJournal(false);
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
      text: () => 'Touche le 7, puis une bille et la case où elle arrive : les pas restants vont à ton autre bille.',
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
  let timerTick = 0;
  const stopTimer = () => { clearTimeout(turnTimer); clearInterval(timerTick); timerFor = ''; timerBar.style.animation = 'none'; timerEl.hidden = true; };
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
    timerEl.hidden = false;
    timerBar.style.animation = 'none';
    void timerBar.offsetWidth;
    timerBar.style.animation = `tocBurn ${TURN_MS / 1000}s linear both`;
    // Les secondes qui restent, à côté de la mèche.
    const end = Date.now() + TURN_MS;
    let shownLeft = -1;
    const tick = () => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      if (left === shownLeft) return;
      shownLeft = left;
      timerLeft.textContent = `${left} s`;
      // Les cinq dernières secondes se sentent dans la main, une par une.
      if (left >= 1 && left <= 5) tap('urgence');
    };
    clearInterval(timerTick);
    tick();
    timerTick = window.setInterval(tick, 250);
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
    roundEl.setAttribute('aria-label', `${roundEl.textContent} : voir les derniers coups`);
    deckCount.textContent = String(deckLeft().left);
    turnEl.textContent = view.phase === 'over' ? 'Partie terminée'
      : view.phase === 'deal' ? 'On distribue…'
        // Titre court : la consigne complète (« Elle part chez Mimi ») est dans le panneau sous le plateau.
        : view.phase === 'exchange' ? (watching ? 'Échange des cartes…' : view.exchange[me] ? 'On attend…' : 'L’échange')
          : view.turn === me && !watching ? 'À toi de jouer' : `Tour ${deNom(nameOf(view.turn))}`;
    const myTeam = teamOf(N, me);
    const teams = [myTeam, ...Array.from({ length: N / 2 }, (_, t) => t).filter((t) => t !== myTeam)];
    // Une case par équipe, à sa couleur : son nom et ses billes rentrées (la tienne d'abord, le nom vers l'extérieur).
    const homes = teams.map((t) => [t, t + N / 2].reduce((a, s) => a + view.pawns[s].filter((pw) => inHome(N, pw.p)).length, 0));
    scoreEl.setAttribute('aria-label', 'Billes rentrées : ' + teams.map((t, k) => `${TEAM_NAMES[t]} ${homes[k]}`).join(', '));
    scoreEl.replaceChildren(...teams.map((t, k) => h('div', { class: k ? 'g-score__rev' : undefined, style: { background: TEAM_BG[t], color: TEAM_INK[t] } },
      h('span', null, TEAM_NAMES[t]), h('b', null, homes[k]))));
  };

  /** Le joueur qui jouera après le joueur actif (le suivant qui a encore des cartes), ou -1. */
  const nextSeat = () => {
    for (let k = 1; k < N; k++) {
      const s = (view.turn + k) % N;
      if (view.hands[s]?.length) return s;
    }
    return -1;
  };

  // ---------- Humeurs des persos ----------
  /** Humeurs passagères (après un BOUM) : place → humeur, jusqu'à une heure donnée. */
  const flash = new Map<number, { mood: Humeur; until: number }>();
  const setFlash = (s: number, mood: Humeur, ms = 3000) => {
    flash.set(s, { mood, until: Date.now() + ms });
    renderMoods();
    setTimeout(() => { if (!disposed) renderMoods(); }, ms + 40);
  };
  /** Places dont une bille est visée par le coup que tu prépares (ou que la table voit préparer). */
  let threatened = new Set<number>();
  const moodOf = (s: number): Humeur => {
    const f = flash.get(s);
    if (f && f.until > Date.now()) return f.mood;
    if (view.phase === 'over') return teamOf(N, s) === view.winner ? 'joie' : 'ko';
    if (threatened.has(s)) return 'panique';
    return view.phase === 'play' && view.turn === s ? 'concentre' : 'content';
  };
  const renderMoods = () => {
    for (let s = 0; s < N; s++) setHumeur(avEls[s].face, avEls[s].char, avEls[s].color, moodOf(s), { flip: avEls[s].flip });
    if (fold) ficheEls.forEach((f, s) => setHumeur(f.face, avEls[s].char, avEls[s].color, moodOf(s)));
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

      e.root.classList.toggle('seat-av--next', !!label);
      e.root.style.transform = `scale(${active ? 1.14 : 1})`;
      e.pulse.hidden = !active;
      // À qui le tour : un anneau tourne autour du joueur actif, les autres pâlissent un peu.
      e.spin.hidden = !active;
      e.root.classList.toggle('seat-av--turn', active);
      e.root.classList.toggle('seat-av--wait', view.phase === 'play' && !active);
      e.cards.textContent = ` · ${view.hands[s]?.length ?? 0}`;
      e.root.classList.toggle('seat-av--off', !src.players[s].online && !src.players[s].bot && (watching || s !== me));
      rpads[s].classList.toggle('pad--glow', active);
      // Pliant : la fiche du joueur dit la même chose (ses cartes, ses billes rentrées, son tour).
      const f = fold ? ficheEls.get(s) : undefined;
      if (f) {
        const n = view.hands[s]?.length ?? 0, home = view.pawns[s].filter((pw) => inHome(N, pw.p)).length;
        f.cards.textContent = `${n} carte${n > 1 ? 's' : ''}`;
        f.dots.setAttribute('aria-label', `${home} bille${home > 1 ? 's' : ''} rentrée${home > 1 ? 's' : ''}`);
        [...f.dots.children].forEach((d, k) => d.classList.toggle('on', k < home));
        const tag = label || (s === partner(N, me) ? 'Avec toi' : '');
        f.chip.textContent = tag;
        f.chip.hidden = !tag;
        f.chip.classList.toggle('doux', !label);
        f.root.classList.toggle('pli__fiche--tour', active);
        f.root.classList.toggle('pli__fiche--off', !src.players[s].online && !src.players[s].bot);
      }
    }
    renderMoods();
  };

  const renderDiscard = (thump = false) => {
    if (!shown) {
      discard.className = 'discard discard--empty';
      discard.replaceChildren();
      return;
    }
    const c = cardLook(shown);
    const col = c.k === 'X' ? 'var(--violet-d)' : c.red ? 'var(--card-red)' : 'var(--ink)';
    discard.className = 'discard' + (thump ? ' discard--thump' : '');
    const suit = suitIcon(c.k);
    suit.style.color = col;
    discard.replaceChildren(...(c.k === 'X' ? [suit] : [h('b', { style: { color: col } }, c.r), suit]));
  };

  const renderHand = () => {
    const cards = myHand();
    const n = cards.length;
    const active = myTurn() || giving();
    // Cartes injouables : elles pâlissent, sauf si aucune carte ne se joue (il faut alors défausser).
    const playable = new Set(myTurn() ? myMoves().filter((m) => m.kind !== 'discard').map((m) => m.card) : []);
    // Éventail : les cartes se serrent quand la main est pleine, la carte choisie sort du rang.
    const step = n > 1 ? Math.min(64, (STAGE_W - 28 - CARD_W) / (n - 1)) : 0;
    const mid = sel ?? (n - 1) / 2;
    // Pliant : les cartes sont à plat, en rangées (handSpot) ; la carte choisie sort du rang, son étoile derrière elle.
    const flatRow = !!fold;
    handHalo.hidden = sel === null || !active;
    if (sel !== null && flatRow) {
      const [hx, hy] = handSpot(sel, n, true);
      handHalo.style.left = r1(hx - 24) + 'px';
      handHalo.style.top = r1(hy - 22) + 'px';
    } else if (sel !== null) handHalo.style.left = r1(STAGE_W / 2 - CARD_W / 2 + (sel - (n - 1) / 2) * step - 24) + 'px';
    // La main change de nombre de rangées (trois volets) : la grille se recale.
    if (flatRow && handGrid(n).rows !== handRows) requestAnimationFrame(() => { if (!disposed) fit(); });
    hand.replaceChildren(handHalo, ...cards.map((card, i) => {
      const dead = playable.size > 0 && !playable.has(card);
      const m = i - (n - 1) / 2, on = sel === i;
      const el = playingCard(card, {
        selected: on, ...view.variants,
        onclick: () => {
          if (!active) { tap('refus'); return toast('Patience, c’est pas ton tour !'); }
          tap(sel === i ? 'touche' : 'carte');
          if (sel === i) clearSel();
          else { clearSel(); sel = i; }
          setEmotes(false);
          render();
        },
      });
      tickUnder(el);
      if (flatRow) {
        const [hx, hy] = handSpot(i, n, on);
        el.style.left = r1(hx) + 'px';
        el.style.top = r1(hy) + 'px';
        el.style.transform = 'none';
        el.style.zIndex = on ? '20' : '12';
      } else {
        el.style.left = r1(STAGE_W / 2 - CARD_W / 2 + m * step) + 'px';
        el.style.top = (on ? 0 : r1(32 + Math.abs(m) * 10)) + 'px';
        el.style.transform = `rotate(${on ? 0 : r1(m * 6)}deg)`;
        // Le pouvoir de la carte s'écrit du côté qui dépasse de l'éventail : il reste lisible sous la carte voisine.
        el.dataset.side = i < mid ? 'start' : i > mid ? 'end' : '';
        // Les cartes se recouvrent vers l'extérieur : le rang reste lisible dans un coin de chacune.
        el.style.zIndex = String(on ? 20 : 12 - Math.round(Math.abs(i - mid) * 2));
      }
      // Le 7 choisi annonce son partage en toutes lettres (son bandeau n'est plus recouvert par la carte voisine).
      if (on && rankOf(card) === '7') el.querySelector('.pcard__badge')!.textContent = '+7 partagé';
      el.classList.toggle('pcard--wait', !active);
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

  const WAY_LABEL: Record<Way, string> = { home: 'Rentrer à la maison', lap: 'Refaire un tour', out: 'Ressortir de la maison', discard: 'Défausser' };
  const renderChoice = (pl: Plan) => {
    if ((pl.ways?.length ?? 0) > 1) {
      choicePop.hidden = false;
      choicePop.replaceChildren(h('span', { class: 'pop__title' }, pl.ways!.includes('out') ? 'Ta bille est dans sa maison' : 'Ta bille est devant sa maison'),
        h('div', { class: 'chips' }, ...pl.ways!.map((w) =>
          h('button', { type: 'button', 'aria-pressed': String(way === w), onclick: () => { tap('touche'); way = w; render(); } },
            w === 'discard' && !view.variants.discardOne ? 'Défausser ma main' : WAY_LABEL[w]))));
      return;
    }
    if (pl.jokerValues.length > 1) {
      choicePop.hidden = false;
      choicePop.replaceChildren(h('span', { class: 'pop__title' }, 'Joue ton Joker comme'),
        h('div', { class: 'chips' }, ...pl.jokerValues.map((r) =>
          h('button', { type: 'button', 'aria-pressed': String(jokerAs === r), onclick: () => { tap('touche'); jokerAs = r; pick = null; target = null; chain = []; render(); } },
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
        : !myTurn() ? `Tour ${deNom(nameOf(view.turn))}…`
          : sel === null ? 'À toi de jouer : choisis une carte en bas.' : 'Pas de bille à choisir avec cette carte : touche le bouton en bas.';
  let lastAim = 'null';
  const renderPad = (pl: Plan) => {
    // Le téléphone dit à la tablette ce qu'il prépare (même s'il montre le plateau).
    if (src.setAim && src.tableOn && !watching) {
      const ready = pl.chosen && pl.chosen.kind !== 'discard' ? JSON.stringify(pl.chosen) : '';
      const sp = chain.map((q) => `${key(q.pawn)}:${q.steps}`).join(',');
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
      if (aim?.card) turnEl.textContent = `Tour ${deNom(nameOf(view.turn))} · ${rankName(aim.card)}`;
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
    const head = h('div', { class: 'pad-panel__head' },
      h('span', { class: 'pad-panel__title' }, src.tableOn ? 'Le plateau est sur la tablette' : 'Mode cartes'));
    const foot = h('span', { class: 'pad-panel__turn' }, 'Tourne le téléphone en portrait pour revoir le plateau.');
    const sv = pl.seven;
    const destBtns = () => h('div', { class: 'pad-dests' }, ...sv!.dests.map((d) =>
      h('button', { class: `pad-dest pad-dest--${d.kind}`, type: 'button', onclick: () => onDest(d) }, h('b', null, '+' + d.part.steps), h('span', null, destText(d)))));
    // Le 7, bille choisie : sans plateau, ses arrivées deviennent des boutons.
    if (sv && pick && sv.dests.length) {
      padPanel.replaceChildren(head,
        h('span', { class: 'pad-panel__hint' }, (chain.length ? `Encore ${sv.left} pas. ` : '') + 'Où va cette bille ?'),
        destBtns(),
        h('button', { class: 'pad-panel__link', type: 'button', onclick: () => { tap('touche'); chain = []; pick = null; render(); } }, 'Changer de bille'),
        foot);
      return;
    }
    padPanel.replaceChildren(head,
      h('span', { class: 'pad-panel__hint' }, list.length
        ? (pick && pl.targets.length ? 'Touche la bille à échanger' : sv?.left && chain.length ? `Encore ${sv.left} pas : touche la bille qui les prend` : 'Touche la bille à jouer') + (src.tableOn ? ' : même numéro sur la tablette.' : '.')
        : padHint()),
      h('div', { class: 'pad-pawns' }, ...list.map((r, k) => {
        const n = chain.findIndex((q) => sameRef(q.pawn, r));
        const chosen = (!!pick && sameRef(pick, r)) || n >= 0 || (!!target && sameRef(target, r));
        return h('button', { class: 'pad-pawn' + (chosen ? ' pad-pawn--on' : ''), type: 'button', onclick: () => onPawn(r) },
          h('b', null, String(k + 1)), bille(SEAT_COLORS[N][r.s], { size: 30 }),
          h('span', null, n >= 0 ? destText(sevenDest(chain[n])) : where(r)));
      })),
      // Partage complet : l'autre façon de jouer la dernière bille (rentrer ou refaire un tour).
      ...(sv?.dests.length ? [destBtns()] : []),
      foot);
  };
  // Changement dans la salle (tablette qui arrive ou part, visée d'un joueur) : on redessine.
  const offRoom = src.onRoom?.(() => { if (!disposed) render(); });

  const rematchBox = () => {
    const btn = button('Revanche !', 'yellow', () => src.voteRematch?.(), { size: 'md', block: true }) as HTMLButtonElement;
    const who = h('div', { class: 'victory__votes', 'aria-live': 'polite' });
    rematchUi = { btn, who };
    return h('div', { class: 'victory__rematch' }, btn, who);
  };
  const render = () => {
    renderRematch();
    if (drawerOn) drawerStatus.textContent = view.phase === 'play' ? (view.turn === me ? '· À toi de jouer' : `· ${nameOf(view.turn)} réfléchit…`)
      : view.phase === 'exchange' ? '· Échange des cartes' : '';
    renderTop();
    renderAvatars();
    renderHand();
    const pl = plan();
    // Les persos dont une bille est visée par le coup préparé paniquent.
    const aim = watching ? aimedMove() : pl.chosen;
    threatened = new Set(aim && aim.kind !== 'discard' ? victimsOf(aim) : []);
    renderMoods();
    // Billes jouables, bille choisie, cibles du Valet
    pawnEls.forEach(({ outer, inner }, k) => {
      const [s, i] = k.split('.').map(Number), r = { s, i };
      const isPick = !!pick && sameRef(pick, r) && pl.cands.length > 0;
      const isTarget = !!target && sameRef(target, r);
      const cand = pl.cands.some((c) => sameRef(c, r)) && (!pick || !!pl.seven);
      const tgt = pl.targets.some((t) => sameRef(t, r));
      // Le 7 : les billes déjà placées portent leur numéro d'ordre ; l'anneau ne pulse que quand on doit choisir une bille.
      const n = pl.seven ? chain.findIndex((q) => sameRef(q.pawn, r)) : -1;
      const ring = cand && !isPick && n < 0 && (!pl.seven || (!pick && pl.seven.left > 0));
      inner.classList.toggle('bille--sel', isPick || n >= 0);
      inner.classList.toggle('bille--target', isTarget);
      outer.classList.toggle('pawn--pick', cand || tgt);
      outer.classList.toggle('pawn--cand', ring || (tgt && !isTarget));
      if (!watching) outer.dataset.num = n >= 0 ? String(n + 1) : '';
      outer.style.zIndex = String(Math.round(pawnEls.get(k)!.y) + (isPick || n >= 0 ? 300 : 0));
    });
    const cap = preview(pl);
    if (!staged) zoomTo(sevenFocus(pl));
    renderChoice(pl);
    renderPad(pl);
    // Carte d'indice et bouton
    let t: string, sub: string, label = '';
    /** Étiquettes du partage du 7, après le titre */
    let tChips: HTMLElement[] = [];
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
        // Ton perso n'est pas à l'écran : c'est la consigne qui te dit quand tu es le suivant.
        sub = view.phase === 'play' && nextSeat() === me ? 'Tu joues juste après : prépare ton coup.' : 'Prépare ton prochain coup.';
      }
    } else if (sel === null && currentLesson()) {
      const ls = currentLesson()!;
      setCoach(ls.mood);
      t = `Leçon ${lessonNo} sur ${LESSONS.length} · ${ls.title}`;
      sub = ls.text();
    } else if (sel === null) { t = `À toi, ${nick} !`; sub = 'Choisis une carte dans ta main.'; }
    else if (tip) { t = 'Astuce'; sub = tip; label = pl.chosen ? (pl.chosen.kind === 'discard' ? 'Défausser' : 'Jouer !') : ''; }
    else {
      const c = cardLook(myHand()[sel], view.variants);
      if (pl.chosen?.kind === 'discard') {
        t = 'Aucun coup possible';
        sub = pl.chosen.card ? 'Défausse cette carte.' : 'Tu passes la donne.';
        label = 'Défausser';
      } else if (!pl.chosen && (pl.ways?.length ?? 0) > 1) {
        t = pl.ways!.includes('out') ? 'Dans ta maison' : 'Devant ta maison';
        sub = pl.ways!.includes('out') ? 'Fais-la ressortir avec le 4, ou défausse : choisis à droite.'
          : pl.ways!.includes('home') ? 'Rentre ta bille ou refais un tour : choisis à droite.' : 'Elle ne peut pas rentrer : refais un tour, ou défausse.';
      } else if (pl.seven) {
        // Le 7 : on touche la bille, puis la case où elle arrive.
        const sv = pl.seven;
        const both = sv.dests.some((d) => d.kind === 'home') && sv.dests.some((d) => d.kind === 'lap');
        t = 'Le 7';
        tChips = chain.map((q, n) => sevenChip(sevenDest(q), n + 1));
        if (pl.chosen) {
          // Les étiquettes disent déjà les pas : la phrase ne garde que ce qui compte (rentrer, un tour, une bille prise).
          const many = chain.length > 1;
          const bits = chain.flatMap((q, n) => {
            const d = sevenDest(q), p0 = view.pawns[q.pawn.s][q.pawn.i].p;
            const act = d.kind === 'home' ? `${inHome(N, p0) ? 'va' : 'rentre'} au ${HOME_HOLES[homeIndex(N, d.p)]}` : d.kind === 'lap' ? 'refait un tour' : '';
            const take = d.victim < 0 ? '' : `prend ${d.victim === me ? 'ta bille' : nameOf(d.victim)}`;
            return act || take ? [`${many ? `la ${n + 1}` : 'ta bille'} ${[act, take].filter(Boolean).join(' et ')}`] : [];
          }).join(', ');
          const alt = sv.dests[0]?.kind;
          sub = (bits ? bits[0].toUpperCase() + bits.slice(1) + '.' : many ? 'Touche une bille pour changer le partage.' : c.rule)
            + (alt === 'lap' ? ' Pointillés : un tour.' : alt === 'home' ? ' Case pleine : rentrer.' : '');
          label = 'Jouer !';
        } else if (pick && sv.dests.length) {
          sub = (chain.length ? `Encore ${sv.left} pas. ` : '')
            + (both ? 'Touche son arrivée : pleine pour rentrer, pointillés pour refaire un tour.' : 'Touche la case où elle arrive.');
        } else if (chain.length) sub = `Encore ${sv.left} pas : touche la bille qui les prend.`;
        else sub = 'Touche la bille à avancer, puis la case où elle arrive.';
      } else {
        t = c.t + (cap ? ' · capture !' : '');
        sub = pl.jokerValues.length > 1 && !jokerAs ? 'Choisis la carte que ton Joker remplace.'
          : !pl.chosen && pl.cands.length > 1 && !pick ? 'Touche la bille à jouer.'
            : !pl.chosen && pl.targets.length > 1 ? 'Touche la bille à échanger.'
              : c.rule;
        if (pl.chosen && leavesHome(view, pl.chosen)) sub = 'Ta bille ressort de sa maison à reculons.';
        if (pl.chosen) label = 'Jouer !';
        // Carte injouable : on dit pourquoi pour le 7 (règle la plus souvent mal comprise).
        if (!pl.moves.length)
          sub = rankOf(myHand()[sel]) !== '7' ? 'Cette carte ne peut pas être jouée pour l’instant.'
            : view.variants.sevenAnyPawns ? 'Le 7 se joue en entier : pas assez de pas possibles ici.'
              : 'Le 7 se joue en entier, sur deux billes au plus : pas possible ici.';
      }
    }
    hintT.replaceChildren(t, ...tChips);
    hintS.textContent = sub;
    tipBtn.hidden = !(myTurn() && sel === null);
    // Partage commencé mais pas fini (variante du 7 sur toutes les billes) ; sinon, toucher une bille suffit à recommencer.
    resetSeven.hidden = !(myTurn() && !!pl.seven && chain.length > 0 && !pl.chosen);
    playBtn.hidden = !label;
    if (label && playBtn.textContent !== label) {
      playBtn.textContent = label;
      // Le texte remplacé a emporté l'interrupteur invisible du bouton (iPhone) : on le remet.
      tickUnder(playBtn);
      playBtn.style.animation = 'none';
      void playBtn.offsetWidth;
      playBtn.style.animation = '';
    }
    renderJournal();
    equip();
    syncTimer();
  };

  // ---------- Animations des coups ----------
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Rancunes de la partie : qui a renvoyé une bille de qui en dernier (pour « VENGEANCE ! »). */
  const grudge = new Map<number, number>();
  /** Le film de la partie : les coups marquants (prises, moments annoncés, coup de la victoire), rejouables à la fin. */
  const highlights: { n: number; prev: GameState; next: GameState; tag: string; home: string; score: number }[] = [];
  /** Le perso d'une place, tel qu'on le dessine (le sien suit son profil). */
  const actor = (s: number, humeur: Humeur): PlancheActor => ({ char: avEls[s].char, color: avEls[s].color, humeur });
  const isMe = (s: number) => s === me && !watching;
  /** Le récitatif d'un moment fort. by : celui qui joue le coup ; hit : ceux dont une bille est renvoyée. */
  const momentText = (tag: string, by: number, hit: number[]) => {
    const others = hit.filter((s) => s !== by);
    const list = others.map((s) => (isMe(s) ? 'toi' : nameOf(s))).join(' et ');
    if (tag.startsWith('VENGEANCE') && others.length)
      return isMe(by) ? `${nameOf(others[0])} t’avait renvoyé juste avant.`
        : isMe(others[0]) ? `Tu avais renvoyé ${nameOf(by)} juste avant.` : `${nameOf(others[0])} avait renvoyé ${nameOf(by)} juste avant.`;
    if (tag.startsWith('DOUBLÉ') || tag.startsWith('TRIPLÉ')) return isMe(by) ? `Tu renvoies ${list} d’un seul coup.` : `${nameOf(by)} renvoie ${list} d’un seul coup.`;
    if (tag.startsWith('OUPS')) return isMe(by) ? 'Tu renvoies une bille de ton propre camp.' : `${nameOf(by)} renvoie une bille de son propre camp.`;
    return '';
  };
  /**
   * Un moment fort : une case de BD claque sous le plateau, jamais dessus, avec ses acteurs et son mot.
   * by : celui qui joue le coup ; hit : ceux qui le subissent ; text : le récitatif.
   */
  const moment = async (t: string, by = -1, hit: number[] = [], text = '') => {
    sfx('moment');
    const oops = t.startsWith('OUPS');
    const el = h('div', { class: 'g-moment', 'aria-hidden': 'true' },
      h('div', { class: 'g-moment__case', style: { '--mc': by >= 0 && avEls[by].color === 'blue' ? 'var(--rouge)' : 'var(--bleu)' } },
        h('i'),
        h('div', { class: 'g-moment__burst' }, ...burstEl(by >= 0 && avEls[by].color === 'yellow' ? '#fff' : '#ffcf1f', 13, 36)),
        by >= 0 ? h('span', { class: 'g-moment__who g-moment__who--by' }, avatar(avEls[by].char, avEls[by].color, 104, oops ? 'panique' : hit.length ? 'malin' : 'joie')) : null,
        hit.length ? h('span', { class: 'g-moment__who g-moment__who--hit' }, avatar(avEls[hit[0]].char, avEls[hit[0]].color, 84, 'ko', { flip: true })) : null,
        h('span', { class: 'g-moment__word' + (t.length > 10 ? ' g-moment__word--long' : '') }, t)),
      text ? h('div', { class: 'g-moment__text' }, text) : null);
    (fold ? stageTop : stage).append(el);
    // La case claque (elle dépasse un peu, puis se pose), tient le temps d'être lue, puis retombe.
    if (!calm()) el.animate?.([
      { transform: 'translateY(60px) scale(.6) rotate(4deg)', opacity: 0, easing: 'cubic-bezier(.2,.9,.3,1)' },
      { transform: 'translateY(-6px) scale(1.05) rotate(-1deg)', opacity: 1, offset: 0.12, easing: 'ease-out' },
      { transform: 'none', opacity: 1, offset: 0.2 },
      { transform: 'none', opacity: 1, offset: 0.88, easing: 'ease-in' },
      { transform: 'translateY(40px) scale(.9)', opacity: 0 },
    ], { duration: 1750, easing: 'linear' });
    await sleep(1700);
    el.remove();
  };
  // ---------- La page BOUM (maquette « Boum ») ----------
  /** Réglage « Planche BOUM » (dans la pause) : une page de BD plein écran à chaque bille renvoyée. */
  const boumPref = () => { try { return localStorage.getItem(BOUM_KEY) !== 'non'; } catch { return true; } };
  /** La page est composée pour la scène du téléphone ; ailleurs (pliant, tablette, manette, écran de table), la case sous le plateau suffit. */
  const boumPageOn = () => boumPref() && !watching && (layout === 'phone' || layout === 'open') && !manette();
  /** Étoile d'explosion aux pointes irrégulières (toujours les mêmes : pas de hasard). */
  const wobBurst = (n: number, inner: number, rot: number, wob: number) => {
    const pts: string[] = [];
    for (let i = 0; i < n * 2; i++) {
      const a = ((rot + (i * 180) / n) * Math.PI) / 180, r = (i % 2 ? inner : 50) * (1 - (wob * ((i * 7) % 5)) / 5);
      pts.push(`${(50 + r * Math.cos(a)).toFixed(1)}% ${(50 + r * Math.sin(a)).toFixed(1)}%`);
    }
    return `polygon(${pts.join(',')})`;
  };
  /** « son 7 », « sa Dame », « ton As » : la carte abattue, dans le récitatif. */
  const cardOf = (card: Card, mine: boolean) => {
    const r = rankOf(card), fem = r === 'Q';
    return `${mine ? (fem ? 'ta' : 'ton') : fem ? 'sa' : 'son'} ${r === 'A' ? 'As' : r === 'K' ? 'Roi' : r === 'Q' ? 'Dame' : r === 'J' ? 'Valet' : r === 'X' ? 'Joker' : r}`;
  };
  /**
   * La page BOUM : la grande case (celui qui frappe, l'explosion, celui qui s'envole), le bandeau du moment
   * (« VENGEANCE ! », « DOUBLÉ ! »… ou « À LA RÉSERVE ! »), deux petites cases (les copains qui jubilent, la bille de retour
   * dans sa réserve) et trois réactions à envoyer d'un toucher. Elle passe toute seule ; un toucher la passe tout de suite.
   * by : celui qui joue le coup ; hit : ceux dont une bille repart (jamais lui-même) ; replaying : le coup est rejoué à la fin.
   */
  const boumPage = async (by: number, hit: number[], card: Card, tag: string, replaying: boolean, after: GameState) => {
    toastBox.replaceChildren();
    sfx('moment');
    // Pliant grand ouvert : le BOUM prend toute la double page.
    if (fold === 'open') return boumSpread(by, hit, card, tag, replaying, after);
    const v = hit[0], oops = tag.startsWith('OUPS');
    const face = (s: number, size: number, humeur: Humeur) => avatar(avEls[s].char, avEls[s].color, size, humeur);
    const gone = hit.length > 1 ? `${hit.length} billes s’envolent vers leur réserve`
      : isMe(v) ? 'ta bille s’envole vers ta réserve' : `la bille ${deNom(nameOf(v))} s’envole vers sa réserve`;
    const caption = `${isMe(by) ? `Tu abats ${cardOf(card, true)}` : `${nameOf(by)} abat ${cardOf(card, false)}`} : ${gone} !`;
    // Sous le bandeau : pourquoi ce moment compte ; sinon, où en est votre rivalité (elle est tenue sur ce téléphone).
    const feud = isMe(by) ? rivalOf(nameOf(v)) : isMe(v) ? rivalOf(nameOf(by)) : null;
    const sub = tag ? momentText(tag, by, hit)
      : feud && isMe(by) && feud.by > 1 ? `Ça fait ${feud.by} fois que tu renvoies ${nameOf(v)}.`
        : feud && isMe(v) && feud.on > 1 ? `Ça fait ${feud.on} fois que ${nameOf(by)} te renvoie.`
          : hit.length > 1 ? 'Elles repartent toutes de leur réserve.' : isMe(v) ? 'Ta bille repart de ta réserve.' : `La bille ${deNom(nameOf(v))} repart de sa réserve.`;
    // La petite case de gauche : le partenaire de celui qui frappe jubile (s'il a renvoyé son propre camp, c'est un adversaire qui rit).
    const fan = oops ? (by + 1) % N : partner(N, by);
    const big = wobBurst(13, 34, 3, 0.16), small = wobBurst(10, 31, 11, 0.12);
    const layer = (inset: string, background: string, clipPath: string, extra: Record<string, string> = {}) => h('i', { style: { inset, background, clipPath, ...extra } });
    let done: () => void = () => {};
    const closed = new Promise<void>((r) => { done = r; });
    const react = !replaying && !src.initiation
      ? h('div', { class: 'g-boum__react' }, h('span', null, 'Réagis'),
        ...['Bien joué !', 'Oh là là !', 'Aïe…'].map((t) => tickUnder(h('button', { type: 'button', onclick: (e: Event) => { e.stopPropagation(); sendEmote(t); done(); } }, t))))
      : null;
    const page = h('div', { class: 'g-boum' + (calm() ? ' g-boum--calm' : ''), onclick: () => done() },
      h('i', { class: 'g-boum__dots' }),
      h('div', { class: 'g-boum__case' }, h('i'), h('i')),
      h('div', { class: 'g-boum__burst' },
        layer('auto', 'var(--ink)', big, { left: '8px', top: '10px', width: '100%', height: '100%' }),
        layer('-5px', 'var(--ink)', big), layer('0', 'var(--jaune)', big), layer('62px', 'var(--ink)', small), layer('66px', '#fff', small)),
      ...[[6, 226, 46], [0, 254, 58], [12, 284, 40]].map(([left, top, width]) => h('i', { class: 'g-boum__line', style: { left, top, width } })),
      h('span', { class: 'g-boum__by' }, face(by, 152, oops ? 'panique' : 'malin')),
      h('span', { class: 'g-boum__hit' }, face(v, 112, 'ko')),
      h('div', { class: 'g-boum__word', role: 'img', 'aria-label': 'BOUM !' }, 'BOUM !'),
      h('div', { class: 'g-boum__cap' }, caption),
      h('div', { class: 'g-boum__band' }, h('span', { class: (tag || 'À LA RÉSERVE !').length > 12 ? 'g-boum__band--long' : undefined }, tag || 'À la réserve !')),
      h('div', { class: 'g-boum__sub' }, sub),
      h('div', { class: 'g-boum__mini g-boum__mini--a' }, h('i'), face(fan, 94, 'joie'), h('span', { class: 'g-boum__say' }, oops ? 'Hahaha !' : 'Ouiii !')),
      h('div', { class: 'g-boum__mini g-boum__mini--b' },
        h('div', { class: 'g-boum__pad', style: { background: tint(v).c } }, ...[0, 1, 2, 3].map(() => h('i', { style: { background: tint(v).d } }))),
        face(v, 62, 'ko'), h('span', { class: 'g-boum__pof' }, 'Pof !')),
      react);
    stage.append(page);
    await Promise.race([closed, sleep(tag ? 3300 : 2700)]);
    if (disposed) return;
    page.classList.add('g-boum--out');
    await sleep(calm() ? 0 : 170);
    page.remove();
  };
  /** « Le 5 de pique », « La Dame de cœur », « Le Joker » : la carte abattue, en toutes lettres. */
  const cardFull = (card: Card) => {
    const r = rankOf(card), suit = ({ S: 'pique', H: 'cœur', D: 'carreau', C: 'trèfle' } as Record<string, string>)[card[card.length - 2]];
    const name = r === 'A' ? 'L’As' : r === 'K' ? 'Le Roi' : r === 'Q' ? 'La Dame' : r === 'J' ? 'Le Valet' : r === 'X' ? 'Le Joker' : `Le ${r}`;
    return suit && r !== 'X' ? `${name} de ${suit}` : name;
  };
  /**
   * La page BOUM en double page (maquette « TOC sur pliants ») : l'explosion et son mot à cheval sur la pliure, celui qui
   * s'envole en haut à droite, celui qui frappe et son partenaire en bas à gauche, et « pendant ce temps », la réserve
   * de celui qui vient d'y retourner. Elle passe toute seule ; un toucher (ou « La suite ») la passe tout de suite.
   */
  const boumSpread = async (by: number, hit: number[], card: Card, tag: string, replaying: boolean, after: GameState) => {
    const v = hit[0], oops = tag.startsWith('OUPS');
    const face = (s: number, size: number, humeur: Humeur, ombre = false) => avatar(avEls[s].char, avEls[s].color, size, humeur, { ombre });
    const gone = hit.length > 1 ? `renvoie ${hit.length} billes d’un coup` : isMe(v) ? 'renvoie ta bille' : `renvoie la bille ${deNom(nameOf(v))}`;
    const caption = `${isMe(by) ? 'Tu fonces… et tu ' + gone.replace(/^renvoie /, 'renvoies ') : `${nameOf(by)} fonce… et ${gone}`} !`;
    const why = tag ? momentText(tag, by, hit) : '';
    const fan = oops ? (by + 1) % N : partner(N, by);
    // Pendant ce temps : sa réserve, la bille qui vient d'y retomber cerclée de jaune.
    const back = after.pawns[v].filter((pw) => pw.p < 0).length;
    const count = ['Aucune bille', 'Une bille', 'Deux billes', 'Trois billes', 'Quatre billes'][back] ?? `${back} billes`;
    const exits = isMe(v) ? ' dans ta réserve. Il te faut un Roi ou un As pour ressortir.' : ' dans sa réserve. Il lui faut un Roi ou un As pour ressortir.';
    let done: () => void = () => {};
    const closed = new Promise<void>((r) => { done = r; });
    const react = !replaying && !src.initiation
      ? h('div', { class: 'pb__react' }, h('span', null, 'Réagis'),
        ...QUICK.map((t) => tickUnder(h('button', { type: 'button', onclick: (e: Event) => { e.stopPropagation(); sendEmote(t); done(); } }, t))))
      : null;
    const inner = h('div', { class: 'pb__in' },
      h('i', { class: 'pb__burst pb__burst--encre' }), h('i', { class: 'pb__burst pb__burst--jaune' }), h('i', { class: 'pb__burst pb__burst--blanc' }),
      h('span', { class: 'pb__tag' }, `Manche ${Math.floor(view.dealNo / 3) + 1} · ${cardFull(card)}`),
      h('div', { class: 'pb__cap' }, caption, why ? h('small', null, why) : null),
      h('div', { class: 'pb__word', role: 'img', 'aria-label': 'BOUM !' }, 'BOUM !'),
      h('span', { class: 'pb__hit' }, face(v, 150, 'ko')),
      ...[[470, 190, 86], [500, 222, 64], [446, 170, 52]].map(([left, top, width]) => h('i', { class: 'pb__line', style: { left, top, width } })),
      h('span', { class: 'pb__band' }, tag || 'À la réserve !'),
      h('span', { class: 'pb__by' }, face(by, 216, oops ? 'panique' : 'joie', true)),
      h('span', { class: 'pb__fan' }, face(fan, 118, 'joie', true)),
      h('span', { class: 'pb__say' }, oops ? 'Hahaha !' : 'Ouiii !'),
      h('div', { class: 'pb__temps' },
        h('span', { class: 'pb__temps-k' }, isMe(v) ? 'Pendant ce temps, chez toi' : `Pendant ce temps, chez ${nameOf(v)}`),
        h('div', { class: 'pb__temps-billes', style: { '--c': tint(v).c } }, ...[0, 1, 2, 3].map((k) => h('i', { class: k < back ? (k === back - 1 ? 'on neuf' : 'on') : undefined }))),
        h('span', { class: 'pb__temps-t' }, count + exits)),
      react,
      h('button', { class: 'pb__suite', type: 'button', onclick: (e: Event) => { e.stopPropagation(); done(); } }, 'La suite'),
      h('i', { class: 'pb__pli pb__pli--haut' }), h('i', { class: 'pb__pli pb__pli--bas' }));
    const page = h('div', { class: 'pb' + (calm() ? ' pb--calm' : ''), onclick: () => done() },
      h('i', { class: 'pb__rays' }), h('i', { class: 'pb__dots pb__dots--a' }), h('i', { class: 'pb__dots pb__dots--b' }), inner);
    // La page est composée pour 752 × 832 : elle se met à l'échelle de l'écran, son fond couvre tout.
    const W = root.clientWidth, H = root.clientHeight, s = Math.min(W / 752, H / 832);
    inner.style.transform = `translate(${r1((W - 752 * s) / 2)}px,${r1((H - 832 * s) / 2)}px) scale(${s.toFixed(4)})`;
    root.append(page);
    await Promise.race([closed, sleep(tag ? 3700 : 3100)]);
    if (disposed) return;
    page.classList.add('pb--out');
    await sleep(calm() ? 0 : 170);
    page.remove();
  };
  /** La musique et l'ambiance suivent la partie : de 0 (début) à 3 (une équipe n'a plus qu'une bille à rentrer). */
  const syncTension = (st: GameState) => {
    let best = 0;
    for (let t = 0; t < N / 2; t++) best = Math.max(best, [t, t + N / 2].reduce((a, s) => a + st.pawns[s].filter((pw) => inHome(N, pw.p)).length, 0));
    const out = st.pawns.some((row) => row.some((pw) => pw.p >= 0));
    const lvl = st.phase === 'over' ? 0 : best >= 2 * HOME_SIZE - 1 ? 3 : best >= 3 ? 2 : out ? 1 : 0;
    musicTension(lvl);
    root.classList.toggle('game--tense', lvl === 3);
  };
  const center2 = (s: number, i: number, p: number) => xy(s, i, p);
  /** La bille se pose. how : ce qu'on sent dans la main quand elle n'arrive pas dans sa maison. */
  const land = (s: number, i: number, p: number, label: string, n: number, how: Haptic = 'pose') => {
    const [x, y] = center2(s, i, p), c = tint(s).c;
    if (inHome(N, p)) sfx('maison');
    // Se poser ne se sent que pour le coup qu'on joue ; une sortie ou une rentrée, aussi quand c'est sa propre bille.
    const what: Haptic = inHome(N, p) ? 'maison' : how;
    feel(what, what !== 'pose' && s === me);
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
  /** La caméra se rapproche du point (x, y) du plateau, le temps d'un choc. */
  const focus = (x: number, y: number) => {
    if (calm()) return;
    staged = true;
    zoomTo({ x: Math.min(120, Math.max(0, x - 120)), y: Math.min(120, Math.max(0, y - 120)), w: 240 });
  };
  /** La bille renvoyée est projetée en l'air, tournoie, puis retombe dans sa réserve et rebondit. */
  const knock = async (s: number, i: number) => {
    const { inner } = pawnEls.get(`${s}.${i}`)!;
    inner.classList.remove('bille--land');
    inner.classList.add('bille--ko');
    place(s, i, -1, 720, 54, 500);
    await sleep(360);
    unlift(s, i);
    await sleep(370);
    inner.classList.remove('bille--ko');
    void inner.offsetWidth;
    inner.classList.add('bille--land');
    setTimeout(() => inner.classList.remove('bille--land'), 440);
    const [x, y] = center2(s, i, -1);
    fx('board', { kind: 'puff', x, y, c: tint(s).c, s: 22, ms: 420 });
  };
  const hop = async (s: number, i: number, from: number, steps: number, sp: number, lap = false, impact = false) => {
    let p = from;
    const path = walk(from, steps, lap);
    for (let k = 0; k < path.length; k++) {
      const [x, y] = center2(s, i, p);
      fx('board', { kind: 'puff', x, y, c: tint(s).c, s: 12, ms: 380 });
      p = path[k];
      // Dernier saut avant un choc : la caméra se rapproche, la bille monte haut et retombe au ralenti.
      if (impact && k === path.length - 1) {
        focus(...center2(s, i, p));
        sfx('elan');
        place(s, i, p, 520, Z.lift * 2.6, 500);
        await sleep(330);
        unlift(s, i);
        await sleep(260);
        break;
      }
      sfx('toc', k);
      feel('pas');
      place(s, i, p, Math.round(sp * 0.87), Z.lift, 500);
      await sleep(sp / 2);
      unlift(s, i);
      await sleep(sp / 2);
    }
    return p;
  };
  const flyCard = (seat: number, card: Card, prev: GameState) => {
    const c = cardLook(card), ds = N === 4 ? (pg ? 1 : 0.88) : 0.72;
    let x0: number, y0: number, r0: number, s0: number;
    if (seat === me && !watching) {
      const hd = prev.hands[me], idx = Math.max(0, hd.indexOf(card)), m = idx - (hd.length - 1) / 2;
      [x0, y0, r0, s0] = [STAGE_W / 2 + m * 56, 592, 0, 1];
      if (fold) {
        // Pliant : la main n'est plus dans la scène ; la carte part de sa place dans la rangée, à sa taille.
        const [hx, hy] = handSpot(idx, hd.length), r = hand.getBoundingClientRect(), k = r.width / (hand.offsetWidth || 1);
        [x0, y0] = toStage(r.left + (hx + CARD_W / 2) * k, r.top + (hy + CARD_H / 2) * k);
        s0 = (CARD_W * k) / (92 * foldScale);
      }
    } else {
      const [ax, ay] = g.avs[armOf(N, me, seat)];
      [x0, y0, r0, s0] = [BOARD_X + ax, BOARD_Y + ay, -20, 0.3];
      // Les joueurs ont leur fiche à côté du plateau : la carte part de la fiche.
      const f = fold && avMode() === 'fiches' ? ficheEls.get(seat)?.root.getBoundingClientRect() : null;
      if (f?.width) [x0, y0] = toStage(f.left + f.width / 2, f.top + f.height / 2);
    }
    // La carte atterrit sur la défausse, au centre du plateau (vue à l'écran).
    const [dx, dy, dsc] = proj.at(180 + 34 * ds, 180);
    const col = c.k === 'X' ? '#7646e0' : c.red ? '#e0331b' : '#16131f';
    fx('screen', { kind: 'card', x0, y0, x1: BOARD_X + dx, y1: BOARD_Y + dy, r0, r1: 6, s0, s1: 0.59 * ds * dsc, r: c.k === 'X' ? '' : c.r, k: c.k, col, ms: 460 });
    sfx('carte');
    setTimeout(() => { shown = card; renderDiscard(true); }, 450);
  };

  /** replay : le coup est rejoué à la fin de la partie, avec le moment annoncé la première fois ('' : aucun). */
  const animateMove = async (prev: GameState, next: GameState, replay?: string) => {
    if (!next.lastMove) return;
    const { seat, move } = next.lastMove;
    const mine = seat === me && !watching;
    felt = { on: !watching && replay === undefined, mine };
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
      toast(move.kind === 'exit' ? 'Une bille de sortie. En avant !'
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
      land(move.pawn.s, move.pawn.i, 0, 'SORTI !', 0, 'sortie');
    } else if (move.kind === 'step') {
      const p = await hop(move.pawn.s, move.pawn.i, prev.pawns[move.pawn.s][move.pawn.i].p, move.steps, sp, move.lap, next.lastCaptures.length > 0);
      land(move.pawn.s, move.pawn.i, p, move.steps > 0 ? '+' + move.steps : String(move.steps), move.steps);
    } else if (move.kind === 'swap') {
      const a = move.pawn, b = move.target;
      const pa = next.pawns[a.s][a.i].p, pb = next.pawns[b.s][b.i].p;
      sfx('echange');
      feel('echange', a.s === me || b.s === me);
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
    // Captures : la caméra est sur le choc, BOUM, tremblement, puis la bille est projetée vers sa réserve.
    const caps = next.lastCaptures;
    let tag = replay ?? '', score = 0;
    if (caps.length) {
      const spot = (v: PawnRef) => center2(v.s, v.i, prev.pawns[v.s][v.i].p);
      if (caps.length === 1) focus(...spot(caps[0]));
      for (const v of caps) {
        const [x, y] = spot(v);
        fx('board', { kind: 'puff', x, y, c: '#fff', s: 90, ms: 320 });
        // L'effet et le cri de celui qui renvoie la bille (boutique).
        boomFx((it) => fx('board', it), lookOfSeat(seat), x, y, tint(seat).c, { x: Math.min(290, Math.max(70, x)), y: Math.max(50, y - 34) });
      }
      tocPeek();
      board.classList.remove('board--shake');
      void board.offsetWidth;
      board.classList.add('board--shake');
      sfx('boum');
      // Les persos réagissent : ceux qu'on renvoie sont sonnés, puis enragent ; celui qui frappe jubile.
      const hitSeats = [...new Set(caps.map((v) => v.s))];
      hitSeats.forEach((s) => { if (s !== seat) setFlash(s, 'ko', 1500); });
      // Dans la main : fort quand une de tes billes repart dans ta réserve, net quand c'est toi qui renvoies,
      // et un petit choc pour toute la table quand le plateau tremble.
      feel(caps.some((v) => v.s === me) ? 'aie' : mine ? 'boum' : 'choc', true);
      // Arrêt sur image, puis la caméra recule pour suivre la bille jusqu'à sa réserve.
      await sleep(280);
      staged = false;
      zoomTo(null);
      const names = [...new Set(caps.map((v) => nameOf(v.s)))];
      setTimeout(() => toast(`Retour à la réserve, ${names.join(' et ')} !`, 1900), 100);
      await Promise.all(caps.map((v) => knock(v.s, v.i)));
      sfx('roule');
      // Moments forts : plusieurs billes d'un coup, une revanche, ou son propre camp renvoyé par mégarde.
      const foes = caps.filter((v) => teamOf(N, v.s) !== teamOf(N, seat));
      score = foes.length * 2;
      if (replay === undefined) {
        const revenge = foes.some((v) => grudge.get(seat) === v.s);
        for (const v of foes) grudge.set(v.s, seat);
        if (revenge) grudge.delete(seat);
        tag = foes.length >= 3 ? 'TRIPLÉ !' : foes.length === 2 ? 'DOUBLÉ !' : revenge ? 'VENGEANCE !' : !foes.length ? 'OUPS !' : '';
      }
      // La mémoire des rivalités (sur ce téléphone) : qui a renvoyé tes billes, et à qui tu l'as rendu.
      if (replay === undefined && !watching && !src.initiation)
        for (const f of foes) {
          if (seat === me) noteCapture(src.players[f.s], 'by');
          else if (f.s === me) noteCapture(src.players[seat], 'on');
        }
      setFlash(seat, foes.length ? 'joie' : 'panique', 3400);
      hitSeats.forEach((s) => { if (s !== seat) setFlash(s, 'furieux', 3400); });
      // Une bille renvoyée : la page BOUM (sur téléphone) ; sinon, la case du moment fort sous le plateau.
      const victims = hitSeats.filter((s) => s !== seat);
      // Ton doublé, ta vengeance : le moment fort se sent aussi.
      if (tag && !tag.startsWith('OUPS')) feel('bravo');
      if (victims.length && boumPageOn()) await boumPage(seat, victims, move.card, tag, replay !== undefined, next);
      else if (tag) await moment(tag, seat, victims, momentText(tag, seat, hitSeats));
    }
    // Maison : la bille qui file droit au fond, ou un joueur qui vient de rentrer sa dernière bille.
    let home = '';
    if (next.phase !== 'over') {
      let done = false, exact = false, who = seat;
      next.pawns.forEach((row, s) => row.forEach((pw, i) => {
        const was = prev.pawns[s][i].p;
        if (!inHome(N, pw.p) || inHome(N, was)) return;
        if (row.every((q) => inHome(N, q.p))) { done = true; who = s; }
        else if (row.filter((q) => q.p > pw.p).length === HOME_SIZE - 1 - homeIndex(N, pw.p)) { exact = true; if (!done) who = s; }
      }));
      home = done ? 'TOUT RENTRÉ !' : exact ? 'AU MILLIMÈTRE !' : '';
      if (home) {
        setFlash(who, 'joie', 3200);
        feel('bravo', who === me);
        await moment(home, who, [], !done ? 'Du parcours, droit au fond de la maison.'
          : isMe(who) ? `Tes 4 billes sont rentrées : tu joues maintenant celles ${deNom(nameOf(partner(N, who)))}.`
            : `${nameOf(who)} a rentré ses 4 billes et joue maintenant celles ${deNom(nameOf(partner(N, who)))}.`);
        score += done ? 3 : 2;
      }
    } else score += 5;
    // Le film de la partie garde ce coup s'il a marqué la table.
    if (replay === undefined && score + (tag ? 3 : 0) > 0) highlights.push({ n: highlights.length, prev, next, tag, home, score: score + (tag ? 3 : 0) });
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
      staged = false;
      syncTension(next);
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
    syncTension(next);
    if (prev.phase === 'deal' && next.phase === 'exchange') {
      if (drawerOpen && document.activeElement !== chatInput) setDrawer(false);
      shown = '';
      renderDiscard();
      dealing = true;
      render();
      dealing = false;
      const size = next.hands[me].length;
      sfx('donne');
      tap('donne');
      if (next.dealNo === 0) fx('screen', { kind: 'banner', y: bannerY(), t: 'C’EST PARTI !', ms: 1500 });
      else toast(!watching && next.dealer === me ? `Tu distribues ${size} cartes` : `${nameOf(next.dealer)} distribue ${size} cartes`);
      await sleep(1300);
    } else if (prev.phase === 'exchange' && next.phase === 'play') {
      render();
      if (!watching) {
        // Un instant après : si c'est ta carte qui boucle l'échange, ton « Donner » vibre encore sous le doigt.
        setTimeout(() => { if (!disposed) tap('carte'); }, 180);
        toast(`${nameOf(partner(N, me))} t’a passé une carte`, 1000);
        await sleep(1050);
      }
      // Qui ouvre la donne, en grand pour toute la table.
      const first = nameOf(next.turn);
      const mine = !watching && next.turn === me;
      fx('screen', { kind: 'banner', y: bannerY(), t: mine ? 'TU COMMENCES !' : `${(first.length > 9 ? first.slice(0, 8) + '…' : first).toUpperCase()} COMMENCE !`, ms: 1700 });
      opened = true;
      if (!mine) await sleep(500);
    }
    if (!watching && next.phase === 'play' && next.turn === me && (!wasMyTurn || moved)) {
      if (drawerOpen && document.activeElement !== chatInput) setDrawer(false);
      if (!opened) fx('screen', { kind: 'banner', y: bannerY(), t: 'À TOI DE JOUER !', ms: 1500 });
      sfx('tour');
      tap('tour');
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
  const boumRow = () => {
    const sw = h('input', { type: 'checkbox', class: 'switch', role: 'switch', checked: boumPref(), 'aria-label': 'Planche BOUM' }) as HTMLInputElement;
    sw.addEventListener('change', () => { try { localStorage.setItem(BOUM_KEY, sw.checked ? 'oui' : 'non'); } catch { /* sans stockage : pour cette partie seulement */ } });
    return h('label', { class: 'push-row' },
      h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 } }, h('b', null, 'Planche BOUM'), h('span', { class: 'push-row__text' }, 'Une page de BD à chaque bille renvoyée.')), sw);
  };
  const reliefRow = () => {
    const sw = h('input', { type: 'checkbox', class: 'switch', role: 'switch', checked: reliefOn(), 'aria-label': 'Plateau en relief' }) as HTMLInputElement;
    sw.addEventListener('change', async () => {
      // Certains téléphones (iPhone) demandent un accord pour lire leurs mouvements : ce toucher sert à le demander.
      const ok = !sw.checked || await askRelief();
      if (!ok) {
        sw.checked = false;
        toast('Ton téléphone n’a pas donné accès à ses mouvements.', 2600);
      }
      setReliefPref(sw.checked);
      tilt3d?.sync();
    });
    return h('label', { class: 'push-row' },
      h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 } }, h('b', null, 'Plateau en relief'), h('span', { class: 'push-row__text' }, 'Il bascule légèrement quand tu inclines le téléphone.')), sw);
  };
  const openPause = () => openSheet(
    h('span', { class: 'sheet__title' }, 'Pause'),
    h('span', { class: 'sheet__text' }, watching ? 'Écran de table : la partie continue sur les téléphones des joueurs.'
      : src.slow ? 'Partie à ton rythme : elle t’attend sur l’accueil, reviens quand tu veux.' : 'Les autres t’attendent, fais vite !'),
    // Les actions d'abord : reprendre, les règles et les derniers coups (aussi sous l'étiquette « Manche · Donne »).
    button('Reprendre', 'primary', closeSheet, { size: 'md', block: true }),
    h('div', { class: 'pause-duo' },
      button('Règles', 'white', () => openRulesSheet(view.variants), { size: 'sm' }),
      button('Derniers coups', 'white', () => { closeSheet(); toggleJournal(true); }, { size: 'sm' })),
    // Puis les réglages : la feuille défile si elle dépasse de l'écran.
    h('span', { class: 't-label' }, 'Réglages'),
    soundSettings(),
    // Vue du plateau : chacun la sienne (l'écran de table reste vu de dessus).
    watching ? h('span') : h('div', { class: 'push-row view-row' },
      h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 } }, h('b', null, 'Vue du plateau'), h('span', { class: 'push-row__text' }, 'Comme assis à ta place, ou vu de dessus.')),
      segmented([{ value: 'inclinee' as const, label: 'Inclinée' }, { value: 'plat' as const, label: 'Dessus' }], viewPref(), (v) => {
        try { localStorage.setItem(VIEW_KEY, v); } catch { /* sans stockage : pour cette partie seulement */ }
        retilt();
      })),
    // La planche BOUM : une page de BD à chaque bille renvoyée (on peut préférer rester sur le plateau).
    watching ? h('span') : boumRow(),
    !watching && reliefAvailable() ? reliefRow() : h('span'),
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
  /** Fin de partie : rejoue les trois coups les plus marquants, dans l'ordre, puis revient à l'écran de fin. */
  const replayHighlights = async (st: GameState, won: boolean) => {
    if (busy || !highlights.length) return;
    busy = true;
    closeVictory();
    const best = [...highlights].sort((a, b) => b.score - a.score || b.n - a.n).slice(0, 3).sort((a, b) => a.n - b.n);
    let skip = false;
    const skipBtn = h('button', { class: 'g-skip', type: 'button', onclick: () => { skip = true; skipBtn.disabled = true; } }, 'Passer');
    (fold ? stageTop : stage).append(skipBtn);
    const show = (x: GameState) => { view = x; syncPawns(x); shown = x.lastCard; clearSel(); renderDiscard(); render(); };
    for (let k = 0; k < best.length && !skip && !disposed; k++) {
      show(best[k].prev);
      fx('screen', { kind: 'banner', y: bannerY(), t: best.length > 1 ? `MOMENT FORT ${k + 1}/${best.length}` : 'LE MOMENT FORT', ms: 1200 });
      await sleep(1250);
      await animateMove(best[k].prev, best[k].next, best[k].tag);
      if (disposed) return;
      syncPawns(best[k].next);
      await sleep(400);
    }
    skipBtn.remove();
    staged = false;
    zoomTo(null);
    busy = false;
    if (disposed) return;
    // Une nouvelle partie a pu démarrer pendant le film (revanche) : elle passe devant.
    if (queue.length) { pump(); return; }
    show(st);
    showVictory(st, won);
  };
  /**
   * La planche de la partie : ses trois coups les plus marquants racontés en cases de BD, puis la case « Fin ».
   * Elle s'affiche sur l'écran de fin et se partage en image.
   */
  const plancheOf = (st: GameState, won: boolean): Planche => {
    const t = st.winner;
    const mover = (x: { next: GameState }) => (x.next.lastMove ? x.next.lastMove.seat : 0);
    const best = highlights.filter((x) => x.next.phase !== 'over').sort((a, b) => b.score - a.score || b.n - a.n).slice(0, 3).sort((a, b) => a.n - b.n);
    // La partie se raconte d'une case à l'autre, comme sur la maquette : « Manche 1. Coco frappe le premier… »,
    // « Puis Frédo se venge de Coco. », « …et rentre sa dernière bille. »
    const cases: PlancheCase[] = best.map((x, k) => {
      const by = mover(x);
      const hit = [...new Set(x.next.lastCaptures.map((v) => v.s))].filter((s) => s !== by);
      const told = x.tag.startsWith('VENGEANCE') && hit.length ? `${nameOf(by)} se venge ${deNom(nameOf(hit[0]))}`
        : x.tag.startsWith('DOUBLÉ') ? `${nameOf(by)} en renvoie deux d’un coup`
          : x.tag.startsWith('TRIPLÉ') ? `${nameOf(by)} en renvoie trois d’un coup`
            : x.tag.startsWith('OUPS') ? `${nameOf(by)} renvoie son propre camp`
              : hit.length ? (k === 0 ? `${nameOf(by)} frappe le premier` : `${nameOf(by)} renvoie ${hit.map(nameOf).join(' et ')}`)
                : x.home.startsWith('TOUT') ? `${nameOf(by)} rentre ses 4 billes` : `${nameOf(by)} file droit au fond`;
      const cap = k === 0 ? `Manche ${Math.floor(x.prev.dealNo / 3) + 1}. ${told}${best.length > 1 ? '…' : '.'}` : `Puis ${told}.`;
      return {
        cap, fx: x.tag || x.home || (hit.length ? criOf(lookOfSeat(by)) : 'TOC !'),
        by: actor(by, x.tag.startsWith('OUPS') ? 'panique' : hit.length ? 'malin' : 'joie'), hits: hit.map((s) => actor(s, 'ko')),
      };
    });
    // Le titre de l'histoire : un exploit des gagnants s'il y en a eu (revanche, coup multiple), sinon leur plus gros frappeur.
    const ours = best.filter((x) => teamOf(N, mover(x)) === t);
    const rev = ours.find((x) => x.tag.startsWith('VENGEANCE')), multi = ours.find((x) => x.tag.startsWith('DOUBLÉ') || x.tag.startsWith('TRIPLÉ'));
    const caps = st.stats.captures, top = (caps[t] ?? 0) >= (caps[t + N / 2] ?? 0) ? t : t + N / 2;
    const story = rev ? `La vengeance ${deNom(nameOf(mover(rev)))}` : multi ? `Le ${multi.tag.startsWith('TRIPLÉ') ? 'triplé' : 'doublé'} ${deNom(nameOf(mover(multi)))}`
      : (caps[top] ?? 0) >= 3 ? `${nameOf(top)}, roi du BOUM` : `L’équipe ${TEAM_NAMES[t]} s’impose`;
    const last = st.lastMove ? st.lastMove.seat : t;
    const homes = Array.from({ length: N / 2 }, (_, k) => `${TEAM_NAMES[k]} ${[k, k + N / 2].reduce((a, s) => a + st.pawns[s].filter((pw) => inHome(N, pw.p)).length, 0)}`);
    const boums = caps.reduce((a, v) => a + (v ?? 0), 0);
    // La dernière case enchaîne sur la précédente quand c'est le même joueur qui conclut.
    const sameHero = best.length > 0 && mover(best[best.length - 1]) === last;
    return {
      // La victoire se fête en rouge, comme sur la maquette ; la défaite passe à l'ardoise.
      won: won || watching, color: won || watching ? '#ff5433' : '#55517a',
      title: won || watching ? 'Victoire !' : 'Défaite…',
      duo: [actor(t, 'joie'), actor(t + N / 2, 'joie')],
      // Partie d'album : son épisode et son nom ; sinon, l'équipe gagnante.
      kicker: src.album ? `${src.album.episode ? `Épisode ${src.album.episode}` : 'Album'} · ${src.album.title}` : `Équipe ${TEAM_NAMES[t]} · ${nameOf(t)} et ${nameOf(t + N / 2)}`,
      story, cases,
      fin: { cap: sameHero ? '…et rentre sa dernière bille.' : `…et ${nameOf(last)} rentre la dernière bille.`, color: SEAT_COLORS[N][last], toc: won || watching ? 'vainqueur' : 'surpris' },
      foot: `${homes.join(' · ')} · ${boums} BOUM`,
      // Gains : seulement pour les parties en ligne (comme awardGame).
      reward: src.local || watching ? undefined : { n: won ? '+100' : '+20', label: 'pièces' },
      text: won ? 'On a gagné au TOC !' : 'Belle partie de TOC !',
      // La grande case de la double page : les perdants dans les coins, et le verdict (les billes rentrées de chaque équipe).
      rivals: Array.from({ length: N }, (_, s) => s).filter((s) => teamOf(N, s) !== t).map((s, k) => actor(s, k % 2 ? 'ko' : 'furieux')),
      verdict: `${TEAM_NAMES[t]} gagne ${homeCount(st, t)} à ${Array.from({ length: N / 2 }, (_, k) => k).filter((k) => k !== t).map((k) => homeCount(st, k)).join(' et ')}.`,
    };
  };
  /** Les billes rentrées d'une équipe. */
  const homeCount = (st: GameState, t: number) => [t, t + N / 2].reduce((a, s) => a + st.pawns[s].filter((pw) => inHome(N, pw.p)).length, 0);
  /**
   * L'écran de fin en double page (pliants, maquette « La planche ») : la planche sur toute la largeur ; dessous, la table
   * d'après partie sous le pouce gauche, et sous le pouce droit les gains, les moments forts, la revanche et le retour.
   */
  const showVictorySpread = (st: GameState, won: boolean, p: Planche) => {
    const myTeam = teamOf(N, me);
    const teams = [myTeam, ...Array.from({ length: N / 2 }, (_, t) => t).filter((t) => t !== myTeam)];
    const score = h('div', { class: 'g-score', role: 'img', 'aria-label': 'Billes rentrées : ' + teams.map((t) => `${TEAM_NAMES[t]} ${homeCount(st, t)}`).join(', ') },
      ...teams.map((t, k) => h('div', { class: k ? 'g-score__rev' : undefined, style: { background: TEAM_BG[t], color: TEAM_INK[t] } }, h('span', null, TEAM_NAMES[t]), h('b', null, homeCount(st, t)))));
    const mins = st.startedAt ? Math.max(1, Math.round((Date.now() - st.startedAt) / 60_000)) : 0;
    const coups = st.log.filter((e) => e.card).length;
    const gain = won ? GAINS.win : GAINS.loss;
    const shareBtn = h('button', { class: 'pv__btn', type: 'button', onclick: () => shareEnd(p, shareBtn) }, 'Partager la planche') as HTMLButtonElement;
    const rematch = watching ? button('Fermer', 'white', closeVictory, { size: 'md', block: true })
      // En ligne, la revanche part quand tout le monde a dit oui.
      : src.voteRematch ? rematchBox()
        : h('div', { class: 'victory__rematch' }, button('Revanche !', 'primary', () => { closeVictory(); src.rematch(); }, { size: 'md', block: true }));
    // Sur la double page, « Revanche ! » est le grand bouton rouge, comme « Jouer ! ».
    rematchUi?.btn.classList.replace('btn--yellow', 'btn--primary');
    const table = h('div', { class: 'pv__table' }, h('span', { class: 'pv__tag' }, 'La table, après la partie'));
    victoryInner = h('div', { class: 'pv__in', 'data-pli': '1', 'data-tenue': fold, 'data-forme': foldShape },
      h('div', { class: 'pv__tete' },
        // Court : l'étiquette tient à gauche du score (l'équipe et ses joueurs sont dans la grande case).
        h('span', { class: 'pv__tag pv__tag--blanc' }, src.album?.episode ? `Épisode ${src.album.episode} · La planche` : 'La planche'),
        score,
        mins ? h('span', { class: 'pv__duree' }, `${mins} min · ${coups} coups`) : null),
      plancheDouble(p),
      table,
      h('div', { class: 'pv__gains' },
        src.local || watching ? null : h('div', { class: 'pv__pastilles' },
          h('span', null, `+${gain.xp} XP`), h('span', null, h('i'), `+${gain.tokens} pièces`), h('span', null, `+${gain.points} points`)),
        watching ? null : h('div', { class: 'pv__duo' },
          highlights.length ? h('button', { class: 'pv__btn', type: 'button', onclick: () => replayHighlights(st, won) }, 'Les moments forts') : null,
          shareBtn),
        rematch,
        watching ? null : h('button', { class: 'pv__retour', type: 'button', onclick: () => { closeVictory(); o.onQuit(); } }, 'Retour à la une')));
    victoryEl = h('div', { class: 'victory pv' + (p.won ? '' : ' pv--perdu'), role: 'dialog', 'aria-label': p.won ? 'Victoire' : 'Partie perdue', 'data-tenue': fold, 'data-forme': foldShape },
      h('i', { class: 'pli__pliure', 'aria-hidden': 'true' }), victoryInner);
    root.append(victoryEl);
    // La table d'après partie : le fil des messages et des réactions, emprunté à la grille de la partie.
    victorySpread = true;
    foldTab = 'table';
    filOpen = false;
    syncFoldTab();
    table.append(pliBoite, pliPuces, pliSaisie);
    if (!src.initiation) pliPuces.append(emoteBtn, emotePop);
    pliFeed.scrollTop = pliFeed.scrollHeight;
    renderRematch();
    setTheme('#241f63');
  };
  /** Fin de partie : la planche en image, à envoyer aux copains. */
  const shareEnd = async (p: Planche, btn: HTMLButtonElement) => {
    btn.disabled = true;
    const res = await sharePlanche(p);
    btn.disabled = false;
    if (res === 'enregistree') pageToast('Planche enregistrée dans tes images.', 2400);
    else if (res === 'impossible') pageToast('Impossible de créer l’image sur ce téléphone.', 2400);
  };
  const showVictory = (st: GameState, won: boolean) => {
    closeVictory();
    lastEnd = { st, won };
    const p = plancheOf(st, won);
    // Pliant (sauf à clapet, qui garde l'écran du téléphone) : la fin de partie en double page.
    if (fold && fold !== 'flip') return showVictorySpread(st, won, p);
    const confetti = Array.from({ length: 18 }, (_, i) => h('i', { style: {
      left: `${(i * 37) % 100}%`, background: ['#ffcf1f', '#fff', '#19c6a4', '#3b5bff', '#ff7ab8'][i % 5],
      animationDelay: `-${((i * 0.37) % 2.6).toFixed(2)}s`, animationDuration: `${(2.2 + (i % 4) * 0.3).toFixed(1)}s`,
    } }));
    const shareBtn = h('button', { class: 'btn btn--white btn--md victory__share', type: 'button', 'aria-label': 'Partager la planche', onclick: () => shareEnd(p, shareBtn) },
      icon(ICONS.share, 22, 2.8), 'Partager') as HTMLButtonElement;
    // Le fond (couleur, rayons, confettis) couvre tout l'écran, encoche et bas compris ;
    // le contenu suit l'échelle de la scène, comme le plateau.
    victoryInner = h('div', { class: 'victory__inner' },
      h('div', { class: 'victory__head' },
        h('span', { class: 'victory__title' + (p.title.length > 10 ? ' victory__title--long' : '') }, p.title),
        h('div', { class: 'victory__duo' }, ...p.duo.map((a) => avatar(a.char, a.color, 58, a.humeur)))),
      plancheEl(p),
      h('div', { style: { flex: 1, minHeight: 6 } }),
      h('div', { class: 'victory__actions' },
        watching ? button('Fermer', 'white', closeVictory, { size: 'md', block: true })
          // En ligne, la revanche part quand tout le monde a dit oui.
          : src.voteRematch ? rematchBox()
            : button('Revanche !', 'yellow', () => { closeVictory(); src.rematch(); }, { size: 'md', block: true }),
        watching ? null : shareBtn),
      watching ? null : h('div', { class: 'victory__links' },
        highlights.length ? h('button', { class: 'victory__link', type: 'button', onclick: () => replayHighlights(st, won) }, icon(ICONS.play, 15, 0), h('span', null, 'Revoir les moments forts')) : null,
        // Après la partie, on continue de discuter avec la table.
        src.chat ? h('button', { class: 'victory__link', type: 'button', onclick: openEndChat }, 'Discuter avec la table', endBadge) : null,
        h('button', { class: 'victory__link', type: 'button', onclick: () => { closeVictory(); o.onQuit(); } }, 'Retour à la une')));
    victoryEl = h('div', { class: 'victory' + (p.won ? '' : ' victory--lost'), role: 'dialog', 'aria-label': p.won ? 'Victoire' : 'Partie perdue', style: { '--vc': p.color } },
      h('span', { class: 'victory__rays' }),
      p.won && h('span', { class: 'victory__confetti' }, ...confetti),
      h('div', { class: 'victory__frame' }, victoryInner));
    root.append(victoryEl);
    renderRematch();
    fit();
    setTheme(p.color);
  };
  const showEnd = (st: GameState) => {
    const won = watching || teamOf(N, me) === st.winner;
    if (src.initiation) setCoach(won ? 'vainqueur' : 'surpris');
    sfx(won ? 'victoire' : 'defaite');
    tap(won ? 'victoire' : 'defaite');
    for (let k = 0; k < 3; k++) setTimeout(() => fx('board', { kind: 'confetti', x: 120 + k * 60, y: 160 + (k % 2) * 40, ms: 1200 }), k * 250);
    setTimeout(() => showVictory(st, won), 900);
  };

  // Accès de test automatisé (?debug) : réafficher la partie après avoir modifié son état à la main.
  if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __tocSync: () => { view = src.state; syncPawns(view); syncTension(view); render(); } });

  // ---------- Démarrage ----------
  // Pliant refermé (il a déjà montré la double page) : on rappelle qu'elle attend, le temps de le lire.
  if (!watching && closedFoldable()) {
    const tip = h('div', { class: 'g-deplie', role: 'status' }, icon('M4 5.500 12 4v16l-8-1.500z M12 4l8 1.500v13L12 20', 18, 2.6), 'Déplie-moi : la double page t’attend');
    stage.append(tip);
    setTimeout(() => tip.remove(), 7000);
  }
  syncPawns(view);
  syncTension(view);
  music(true);
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
      tilt3d?.stop();
      music(false);
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
      unwatchFold();
      src.leave();
    },
  };
}
