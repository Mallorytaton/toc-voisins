// Récap de la soirée d'un tournoi : la dernière série de parties jouées d'affilée (moins de 3 h entre deux),
// visible 3 jours. Calcul pur (testé dans tests/recap.test.ts), l'affichage est dans ui/screens/recap.ts.

export interface RecapGame {
  winner: number;
  at: number;
  /** Durée (ms), 0 si inconnue (partie hors app) */
  duration: number;
  /** Par place du tournoi */
  captures: number[];
  exits: number[];
}

export interface Recap {
  /** Première et dernière partie de la soirée (ms) */
  start: number;
  end: number;
  count: number;
  /** Victoires de chaque équipe pendant la soirée */
  wins: number[];
  /** Temps de jeu cumulé (parties dont la durée est connue) */
  playMs: number;
  /** Place du tournoi qui a renvoyé le plus de billes adverses, et combien */
  boum: { seat: number; n: number } | null;
  /** Place qui a sorti le plus de billes, et combien */
  exits: { seat: number; n: number } | null;
  /** Partie la plus longue (ms), 0 si inconnue */
  longest: number;
}

const HOUR = 3_600_000;
/** Deux parties séparées de plus de 3 h n'appartiennent pas à la même soirée. */
export const SOIREE_GAP = 3 * HOUR;
/** Le récap reste affiché 3 jours après la dernière partie. */
export const RECAP_SHOWN = 72 * HOUR;

export function soireeRecap(games: RecapGame[], teams: number, seats: number, now = Date.now()): Recap | null {
  const sorted = [...games].sort((a, b) => b.at - a.at);
  if (!sorted.length || sorted[0].at < now - RECAP_SHOWN) return null;
  const session = [sorted[0]];
  for (const g of sorted.slice(1)) {
    if (session[session.length - 1].at - g.at > SOIREE_GAP) break;
    session.push(g);
  }
  const wins = Array(teams).fill(0);
  for (const g of session) if (g.winner >= 0 && g.winner < teams) wins[g.winner]++;
  const total = (field: 'captures' | 'exits') =>
    Array.from({ length: seats }, (_, k) => session.reduce((a, g) => a + (g[field][k] ?? 0), 0));
  const best = (vals: number[]) => {
    const n = Math.max(...vals);
    return n > 0 ? { seat: vals.indexOf(n), n } : null;
  };
  const durations = session.map((g) => g.duration).filter((d) => d > 0);
  return {
    start: session[session.length - 1].at,
    end: session[0].at,
    count: session.length,
    wins,
    playMs: durations.reduce((a, b) => a + b, 0),
    boum: best(total('captures')),
    exits: best(total('exits')),
    longest: durations.length ? Math.max(...durations) : 0,
  };
}
