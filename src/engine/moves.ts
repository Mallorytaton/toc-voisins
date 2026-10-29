import {
  PAWNS_PER_SEAT, HOME_SIZE, Pawns, clonePawns, controlledSeat, homeIndex, inBase, inHome,
  isBlocker, occupant, onTrack, progressAt, sameRef, squareOf, startSq, stepForward, trackLen,
} from './board';
import { RANKS, rankOf } from './cards';
import type { Card, GameState, Move, PawnRef, Rank, SevenPart, Variants } from './types';

/** Contexte de travail mutable : on clone les pions avant chaque essai. */
export interface Ctx {
  n: number;
  v: Variants;
  pawns: Pawns;
}

interface Walk {
  p: number;
  /** Cases absolues traversées (hors case d'arrivée). */
  passed: number[];
  /** Case absolue d'arrivée si le pion finit sur le parcours. */
  land: number;
}

/** Avance un pion de k pas en respectant blocages et maison. null si impossible. */
export function walkForward(ctx: Ctx, ref: PawnRef, k: number): Walk | null {
  const { n, pawns, v } = ctx;
  const L = trackLen(n);
  const pw = pawns[ref.s][ref.i];
  if (inBase(pw.p) || k <= 0) return null;
  let p = pw.p;
  const passed: number[] = [];
  for (let step = 1; step <= k; step++) {
    const np = stepForward(n, p);
    if (np < L) {
      const sq = squareOf(n, ref.s, np);
      const occ = occupant(n, pawns, sq, ref);
      if (occ && isBlocker(v, pawns[occ.s][occ.i])) return null;
      if (step < k) passed.push(sq);
    } else {
      const h = homeIndex(n, np);
      if (h >= HOME_SIZE) return null;
      // On ne peut ni sauter ni rejoindre un pion déjà en maison.
      const taken = pawns[ref.s].some((o, j) => j !== ref.i && inHome(n, o.p) && homeIndex(n, o.p) === h);
      if (taken) return null;
    }
    p = np;
  }
  return { p, passed, land: p < L ? squareOf(n, ref.s, p) : -1 };
}

/** Recule un pion de k pas (uniquement sur le parcours, jamais en maison). */
export function walkBackward(ctx: Ctx, ref: PawnRef, k: number): Walk | null {
  const { n, pawns, v } = ctx;
  const L = trackLen(n);
  const pw = pawns[ref.s][ref.i];
  if (!onTrack(n, pw.p)) return null;
  let p = pw.p;
  const passed: number[] = [];
  for (let step = 1; step <= k; step++) {
    let np = p - 1;
    if (np < 0) np = L - 1;
    const sq = squareOf(n, ref.s, np);
    const occ = occupant(n, pawns, sq, ref);
    if (occ && isBlocker(v, pawns[occ.s][occ.i])) return null;
    if (step < k) passed.push(sq);
    p = np;
  }
  return { p, passed, land: squareOf(n, ref.s, p) };
}

function sendToBase(ctx: Ctx, ref: PawnRef, caps: PawnRef[]) {
  ctx.pawns[ref.s][ref.i] = { p: -1, fresh: false };
  caps.push(ref);
}

function landOn(ctx: Ctx, ref: PawnRef, w: Walk, caps: PawnRef[]) {
  ctx.pawns[ref.s][ref.i] = { p: w.p, fresh: false };
  if (w.land >= 0) {
    const occ = occupant(ctx.n, ctx.pawns, w.land, ref);
    if (occ) sendToBase(ctx, occ, caps);
  }
}

/** Sort un pion de la base de `owner`. Retourne les pions pris, ou null. */
export function doExit(ctx: Ctx, owner: number, i: number): PawnRef[] | null {
  const pw = ctx.pawns[owner][i];
  if (!inBase(pw.p)) return null;
  const sq = startSq(owner);
  const occ = occupant(ctx.n, ctx.pawns, sq);
  if (occ && isBlocker(ctx.v, ctx.pawns[occ.s][occ.i])) return null;
  const caps: PawnRef[] = [];
  if (occ) sendToBase(ctx, occ, caps);
  ctx.pawns[owner][i] = { p: 0, fresh: true };
  return caps;
}

/** Déplacement simple (steps < 0 : recul). */
export function doStep(ctx: Ctx, ref: PawnRef, steps: number): PawnRef[] | null {
  const w = steps > 0 ? walkForward(ctx, ref, steps) : walkBackward(ctx, ref, -steps);
  if (!w) return null;
  const caps: PawnRef[] = [];
  landOn(ctx, ref, w, caps);
  return caps;
}

function swappable(ctx: Ctx, r: PawnRef) {
  const pw = ctx.pawns[r.s][r.i];
  return onTrack(ctx.n, pw.p) && !isBlocker(ctx.v, pw);
}

export function doSwap(ctx: Ctx, a: PawnRef, b: PawnRef): boolean {
  if (sameRef(a, b) || !swappable(ctx, a) || !swappable(ctx, b)) return false;
  const { n, pawns } = ctx;
  const sqA = squareOf(n, a.s, pawns[a.s][a.i].p);
  const sqB = squareOf(n, b.s, pawns[b.s][b.i].p);
  pawns[a.s][a.i] = { p: progressAt(n, a.s, sqB), fresh: false };
  pawns[b.s][b.i] = { p: progressAt(n, b.s, sqA), fresh: false };
  return true;
}

/** Une étape du 7 : prend les pions atteints et (sauf variante) dépassés. */
function sevenPart(ctx: Ctx, ref: PawnRef, k: number): PawnRef[] | null {
  const w = walkForward(ctx, ref, k);
  if (!w) return null;
  const caps: PawnRef[] = [];
  if (!ctx.v.sevenNoPassCapture) {
    for (const sq of w.passed) {
      const occ = occupant(ctx.n, ctx.pawns, sq, ref);
      if (occ) sendToBase(ctx, occ, caps);
    }
  }
  landOn(ctx, ref, w, caps);
  return caps;
}

/** Applique une partie du 7 (aperçu pendant la répartition). Ne vérifie pas le total. */
export function applySevenPrefix(ctx: Ctx, seat: number, parts: SevenPart[]): PawnRef[] | null {
  const used = new Set<string>();
  const caps: PawnRef[] = [];
  for (const part of parts) {
    const cs = controlledSeat(ctx.n, ctx.pawns, seat);
    const key = part.pawn.s + ':' + part.pawn.i;
    if (part.pawn.s !== cs || used.has(key) || part.steps < 1) return null;
    used.add(key);
    const c = sevenPart(ctx, part.pawn, part.steps);
    if (!c) return null;
    caps.push(...c);
  }
  return caps;
}

/** Joue un 7 complet pour `seat`. Les pions jouables sont réévalués à chaque étape. */
export function doSeven(ctx: Ctx, seat: number, parts: SevenPart[]): PawnRef[] | null {
  const total = parts.reduce((a, p) => a + p.steps, 0);
  return total === 7 ? applySevenPrefix(ctx, seat, parts) : null;
}

const SEVEN_CAP = 4000;

/** Toutes les façons ordonnées de répartir le 7 (chaque pion au plus une fois). */
export function sevenSplits(ctx0: Ctx, seat: number, cap = SEVEN_CAP): SevenPart[][] {
  const out: SevenPart[][] = [];
  const rec = (ctx: Ctx, remaining: number, used: string[], parts: SevenPart[]) => {
    if (out.length >= cap) return;
    if (remaining === 0) {
      out.push(parts);
      return;
    }
    const cs = controlledSeat(ctx.n, ctx.pawns, seat);
    for (let i = 0; i < PAWNS_PER_SEAT; i++) {
      const key = cs + ':' + i;
      if (used.includes(key) || inBase(ctx.pawns[cs][i].p)) continue;
      // Règle de base : le 7 se partage entre deux pions au plus.
      if (!ctx.v.sevenAnyPawns && used.length >= 2) continue;
      const ref = { s: cs, i };
      for (let k = 1; k <= remaining; k++) {
        const c2: Ctx = { ...ctx, pawns: clonePawns(ctx.pawns) };
        // Si k pas sont impossibles, k+1 le sont aussi (même chemin, plus long).
        if (!sevenPart(c2, ref, k)) break;
        rec(c2, remaining - k, [...used, key], [...parts, { pawn: ref, steps: k }]);
        if (out.length >= cap) return;
      }
    }
  };
  rec(ctx0, 7, [], []);
  return out;
}

type MoveTpl =
  | { kind: 'exit'; pawn: PawnRef }
  | { kind: 'step'; pawn: PawnRef; steps: number }
  | { kind: 'swap'; pawn: PawnRef; target: PawnRef }
  | { kind: 'seven'; parts: SevenPart[] };

const FORWARD: Partial<Record<Rank, number>> = {
  A: 1, '2': 2, '3': 3, '5': 5, '6': 6, '8': 8, '9': 9, '10': 10, Q: 12, K: 13,
};

function ctxOf(st: GameState): Ctx {
  return { n: st.n, v: st.variants, pawns: st.pawns };
}

/** Coups possibles pour une valeur de carte donnée (sans tenir compte de la carte physique). */
export function movesForRank(st: GameState, seat: number, rank: Rank, cap?: number): MoveTpl[] {
  const ctx = ctxOf(st);
  const { n, variants: v } = st;
  const cs = controlledSeat(n, st.pawns, seat);
  const out: MoveTpl[] = [];
  const tryCtx = (): Ctx => ({ n, v, pawns: clonePawns(st.pawns) });

  if (rank === 'A' || rank === 'K') {
    const i = st.pawns[cs].findIndex((pw) => inBase(pw.p));
    if (i >= 0 && doExit(tryCtx(), cs, i)) out.push({ kind: 'exit', pawn: { s: cs, i } });
  }

  let forward = FORWARD[rank];
  if (rank === 'J' && v.jackEleven) forward = 11;
  // Règle de base : le Roi sert seulement à sortir.
  if (rank === 'K' && !v.kingThirteen) forward = undefined;
  if (rank === '5' && v.fiveOthers) {
    for (let s = 0; s < n; s++) {
      if (s === seat) continue;
      for (let i = 0; i < PAWNS_PER_SEAT; i++) {
        if (walkForward(ctx, { s, i }, 5)) out.push({ kind: 'step', pawn: { s, i }, steps: 5 });
      }
    }
    return out;
  }
  if (forward) {
    for (let i = 0; i < PAWNS_PER_SEAT; i++) {
      if (walkForward(ctx, { s: cs, i }, forward)) out.push({ kind: 'step', pawn: { s: cs, i }, steps: forward });
    }
  }
  if (rank === '4') {
    for (let i = 0; i < PAWNS_PER_SEAT; i++) {
      if (walkBackward(ctx, { s: cs, i }, 4)) out.push({ kind: 'step', pawn: { s: cs, i }, steps: -4 });
    }
  }
  if (rank === 'J' && !v.jackEleven) {
    for (let i = 0; i < PAWNS_PER_SEAT; i++) {
      const a = { s: cs, i };
      if (!swappable(ctx, a)) continue;
      for (let s = 0; s < n; s++) {
        for (let j = 0; j < PAWNS_PER_SEAT; j++) {
          const b = { s, i: j };
          if (!sameRef(a, b) && swappable(ctx, b)) out.push({ kind: 'swap', pawn: a, target: b });
        }
      }
    }
  }
  if (rank === '7') {
    for (const parts of sevenSplits(ctx, seat, cap)) out.push({ kind: 'seven', parts });
  }
  return out;
}

/** Liste des coups légaux du joueur dont c'est le tour. */
export function legalMoves(st: GameState): Move[] {
  if (st.phase !== 'play') return [];
  const seat = st.turn;
  const hand = st.hands[seat];
  const cache = new Map<Rank, MoveTpl[]>();
  const get = (r: Rank) => {
    let m = cache.get(r);
    if (!m) cache.set(r, (m = movesForRank(st, seat, r)));
    return m;
  };
  const out: Move[] = [];
  for (const card of hand) {
    const r = rankOf(card);
    if (r === '?') continue;
    const ranks = r === 'X' ? RANKS : [r];
    for (const as of ranks) for (const t of get(as)) out.push({ ...t, card, as } as Move);
  }
  if (out.length === 0 && hand.length > 0) out.push(...discardMoves(st, hand));
  return out;
}

/** Défausse faute de coup : toute la main, ou une carte au choix (variante discardOne). */
function discardMoves(st: GameState, hand: Card[]): Move[] {
  if (!st.variants.discardOne) return [{ kind: 'discard', card: '' }];
  return [...new Set(hand)].map((card) => ({ kind: 'discard', card }) as Move);
}

/**
 * Coups légaux de `seat` avec une carte précise de sa main (ce que l'interface surligne
 * quand on touche une carte). Vide si ce n'est pas son tour ou si la carte ne joue pas.
 */
export function legalMovesFor(st: GameState, seat: number, card: Card): Move[] {
  if (st.phase !== 'play' || st.turn !== seat || !st.hands[seat].includes(card)) return [];
  return legalMoves(st).filter((m) => m.kind === 'discard' ? m.card === card || m.card === '' : m.card === card);
}

/** Version rapide : le joueur a-t-il au moins un coup jouable ? */
export function hasPlayableCard(st: GameState): boolean {
  const seat = st.turn;
  const seen = new Set<string>();
  for (const card of st.hands[seat]) {
    const r = rankOf(card);
    if (r === '?') continue;
    for (const as of r === 'X' ? RANKS : [r]) {
      if (seen.has(as)) continue;
      seen.add(as);
      if (movesForRank(st, seat, as, 1).length > 0) return true;
    }
  }
  return false;
}

export function moveKey(m: Move): string {
  switch (m.kind) {
    case 'discard':
      return `discard|${m.card}`;
    case 'exit':
      return `exit|${m.card}|${m.as}|${m.pawn.s}.${m.pawn.i}`;
    case 'step':
      return `step|${m.card}|${m.as}|${m.pawn.s}.${m.pawn.i}|${m.steps}`;
    case 'swap':
      return `swap|${m.card}|${m.as}|${m.pawn.s}.${m.pawn.i}|${m.target.s}.${m.target.i}`;
    case 'seven':
      return `seven|${m.card}|${m.as}|` + m.parts.map((p) => `${p.pawn.s}.${p.pawn.i}x${p.steps}`).join(',');
  }
}
