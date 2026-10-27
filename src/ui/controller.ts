import type { GameState, Move } from '../engine';

export interface SeatInfo {
  name: string;
  color: number;
  online: boolean;
  bot?: boolean;
}

/** Interface commune à la table locale et aux parties en ligne. */
export interface GameController {
  mode: 'local' | 'online';
  /** Code de partie affiché (en ligne). */
  code?: string;
  /** État visible : les mains des autres sont des cartes "?". */
  state: GameState;
  seats: SeatInfo[];
  /** Place dont on montre la main (-1 : personne). */
  viewer: number;
  /** Table locale : un rideau masque la main tant que le joueur ne l'a pas révélée. */
  curtain: boolean;
  /** Message d'attente éventuel (ex. hôte absent pour distribuer). */
  notice: string;
  canRematch: boolean;
  play(m: Move): Promise<void>;
  give(card: string): Promise<void>;
  reveal(): void;
  rematch(): Promise<void>;
  subscribe(cb: () => void): () => void;
  leave(): void;
}
