// Types du moteur de Toc. Tout est sérialisable en JSON (aucun null, aucun undefined)
// pour passer tel quel dans Firebase Realtime Database.

export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'X';

/** Carte : rang + couleur + chiffre de jeu, ex. "KH0", "10S1", joker "XJ3". "?" = carte inconnue. */
export type Card = string;

export interface Variants {
  /** Le Valet avance de 11 au lieu d'échanger. */
  jackEleven: boolean;
  /** Le 5 fait avancer de 5 un pion d'un autre joueur. */
  fiveOthers: boolean;
  /** Pendant un 7, seuls les pions atteints (et non dépassés) sont pris. */
  sevenNoPassCapture: boolean;
  /** Un pion tout juste sorti sur sa case de départ bloque et ne peut pas être pris. */
  startBlocks: boolean;
  /** Nombre de jokers par jeu de cartes. */
  jokers: 0 | 2 | 4;
  /** Sans coup possible, on défausse une seule carte au choix (au lieu de toute sa main). */
  discardOne: boolean;
}

export const DEFAULT_VARIANTS: Variants = {
  jackEleven: false,
  fiveOthers: false,
  sevenNoPassCapture: false,
  startBlocks: true,
  jokers: 2,
  discardOne: false,
};

/**
 * Position d'un pion, exprimée en progression depuis sa propre case de départ :
 *  -1            : à la base
 *  0 .. L-1      : sur le parcours (0 = case de départ, L-2 = case d'entrée en maison)
 *  L+1 .. L+4    : cases maison 1 à 4
 */
export interface Pawn {
  p: number;
  /** Vient de sortir sur sa case de départ (et n'a pas encore bougé). */
  fresh: boolean;
}

export interface PawnRef {
  s: number;
  i: number;
}

export type Phase = 'deal' | 'exchange' | 'play' | 'over';

export interface SevenPart {
  pawn: PawnRef;
  steps: number;
}

export type Move =
  | { kind: 'exit'; card: Card; as: Rank; pawn: PawnRef }
  | { kind: 'step'; card: Card; as: Rank; pawn: PawnRef; steps: number }
  | { kind: 'swap'; card: Card; as: Rank; pawn: PawnRef; target: PawnRef }
  | { kind: 'seven'; card: Card; as: Rank; parts: SevenPart[] }
  /** card : la carte défaussée (variante discardOne), '' pour toute la main. */
  | { kind: 'discard'; card: Card };

export interface LogEntry {
  seat: number;
  /** Texte en français ; "@3" est remplacé par le nom du joueur à la place 3. */
  text: string;
  card: Card;
}

export interface GameState {
  n: number;
  variants: Variants;
  pawns: Pawn[][];
  hands: Card[][];
  deck: Card[];
  dealNo: number;
  dealer: number;
  turn: number;
  phase: Phase;
  /** Carte donnée au partenaire pendant l'échange ('' = pas encore donnée). */
  exchange: Card[];
  /** A défaussé sa main faute de coup possible pendant cette donne. */
  passed: boolean[];
  /** Équipe gagnante, -1 tant que la partie continue. */
  winner: number;
  log: LogEntry[];
  /** Dernière carte jouée ('' si aucune). */
  lastCard: Card;
  /** Pions renvoyés à la base par le dernier coup (pour l'animation). */
  lastCaptures: PawnRef[];
  /** Incrémenté à chaque modification (contrôle de concurrence côté Firebase). */
  v: number;
}
