// Fiche de joueur : ajouter une partie terminée aux compteurs cumulés (calcul pur, testé).

export interface PlayerStats {
  games: number;
  wins: number;
  /** Série de victoires en cours, et la plus longue */
  streak: number;
  best: number;
  /** Billes adverses renvoyées, billes sorties */
  captures: number;
  exits: number;
  /** Cartes jouées, par valeur */
  cards: Record<string, number>;
  /** Partenaires : parties et victoires ensemble */
  partners: Record<string, { g: number; w: number }>;
  /** Première partie comptée (ms) */
  since: number;
}

export interface GameResult {
  won: boolean;
  captures: number;
  exits: number;
  cards: Record<string, number>;
  /** Partenaire humain ('' pour un robot) */
  partner: string;
}

export function addGame(cur: Partial<PlayerStats> | null, r: GameResult, now = Date.now()): PlayerStats {
  const s: PlayerStats = { games: 0, wins: 0, streak: 0, best: 0, captures: 0, exits: 0, cards: {}, partners: {}, since: now, ...(cur ?? {}) };
  const cards = { ...(s.cards ?? {}) };
  const partners = { ...(s.partners ?? {}) };
  for (const [k, n] of Object.entries(r.cards)) cards[k] = (cards[k] ?? 0) + n;
  if (r.partner) {
    const p = partners[r.partner] ?? { g: 0, w: 0 };
    partners[r.partner] = { g: p.g + 1, w: p.w + (r.won ? 1 : 0) };
  }
  const streak = r.won ? s.streak + 1 : 0;
  return {
    ...s, cards, partners, streak,
    games: s.games + 1,
    wins: s.wins + (r.won ? 1 : 0),
    best: Math.max(s.best, streak),
    captures: s.captures + r.captures,
    exits: s.exits + r.exits,
  };
}
