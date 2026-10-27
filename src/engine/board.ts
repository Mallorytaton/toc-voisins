import type { Pawn, PawnRef, Variants } from './types';

/** Nombre de cases de parcours par joueur. */
export const SQUARES_PER_SEAT = 18;
export const PAWNS_PER_SEAT = 4;
export const HOME_SIZE = 4;

export const trackLen = (n: number) => SQUARES_PER_SEAT * n;
export const startSq = (seat: number) => SQUARES_PER_SEAT * seat;
export const partner = (n: number, s: number) => (s + n / 2) % n;
export const teamOf = (n: number, s: number) => s % (n / 2);
export const teamCount = (n: number) => n / 2;

export const inBase = (p: number) => p < 0;
export const onTrack = (n: number, p: number) => p >= 0 && p <= trackLen(n);
export const inHome = (n: number, p: number) => p > trackLen(n);
/** Index de case maison (0..3) pour une progression en maison. */
export const homeIndex = (n: number, p: number) => p - trackLen(n) - 1;

/** Case absolue du parcours occupée par un pion de `seat` à la progression `p`. */
export const squareOf = (n: number, seat: number, p: number) => (startSq(seat) + p) % trackLen(n);

/** Progression d'un pion de `seat` posé sur la case absolue `sq`. */
export function progressAt(n: number, seat: number, sq: number): number {
  const L = trackLen(n);
  return (((sq - startSq(seat)) % L) + L) % L;
}

export type Pawns = Pawn[][];

export function clonePawns(p: Pawns): Pawns {
  return p.map((row) => row.map((x) => ({ p: x.p, fresh: x.fresh })));
}

export function sameRef(a: PawnRef, b: PawnRef) {
  return a.s === b.s && a.i === b.i;
}

export function isBlocker(v: Variants, pw: Pawn) {
  return v.startBlocks && pw.fresh && pw.p === 0;
}

/** Pion présent sur une case absolue du parcours (en ignorant `except`). */
export function occupant(n: number, pawns: Pawns, sq: number, except?: PawnRef): PawnRef | null {
  for (let s = 0; s < n; s++) {
    for (let i = 0; i < PAWNS_PER_SEAT; i++) {
      if (except && except.s === s && except.i === i) continue;
      const pw = pawns[s][i];
      if (onTrack(n, pw.p) && squareOf(n, s, pw.p) === sq) return { s, i };
    }
  }
  return null;
}

export function allHome(n: number, pawns: Pawns, s: number) {
  return pawns[s].every((pw) => inHome(n, pw.p));
}

/** Joueur dont `s` déplace les pions : lui-même, ou son partenaire s'il a tout rentré. */
export function controlledSeat(n: number, pawns: Pawns, s: number) {
  return allHome(n, pawns, s) ? partner(n, s) : s;
}

export function initialPawns(n: number): Pawns {
  return Array.from({ length: n }, () =>
    Array.from({ length: PAWNS_PER_SEAT }, () => ({ p: -1, fresh: false })),
  );
}
