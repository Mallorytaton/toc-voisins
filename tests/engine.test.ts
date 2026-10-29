import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VARIANTS, GameState, Move, Variants, applyMove, deal, giveCard, homeEntry, legalMoves, legalMovesFor,
  newGame, progressAt, sameRef, seededRng, trackLen,
} from '../src/engine';

const L = trackLen(4); // 64
/** Trou d'entrée de la maison : celui juste avant la case de départ (L - 1). */
const E = homeEntry(4);

/** Partie à 4 en phase de jeu, tous les pions à la base, chacun avec une carte de réserve. */
function mk(hand: string[], v: Partial<Variants> = {}, n = 4): GameState {
  const st = newGame(n, { ...DEFAULT_VARIANTS, ...v });
  st.phase = 'play';
  st.turn = 0;
  st.hands = Array.from({ length: n }, (_, s) => (s === 0 ? hand.slice() : ['2C0']));
  return st;
}
const put = (st: GameState, s: number, i: number, p: number, fresh = false) => {
  st.pawns[s][i] = { p, fresh };
};
/** Pose un pion sur une case absolue du parcours. */
const putSq = (st: GameState, s: number, i: number, sq: number) => put(st, s, i, progressAt(st.n, s, sq));
const movesOf = (st: GameState, card: string) =>
  legalMoves(st).filter((m): m is Exclude<Move, { kind: 'discard' }> => m.kind !== 'discard' && m.card === card);
const find = (st: GameState, card: string, pred: (m: Move) => boolean) => {
  const m = movesOf(st, card).find(pred);
  if (!m) throw new Error('coup introuvable');
  return m;
};

describe('cartes de sortie', () => {
  it("l'As sort un pion sur la case de départ, qui devient bloquant", () => {
    const st = mk(['AS0']);
    const m = find(st, 'AS0', (m) => m.kind === 'exit');
    const after = applyMove(st, m);
    expect(after.pawns[0][0]).toEqual({ p: 0, fresh: true });
    expect(after.hands[0]).toEqual([]);
    expect(after.turn).toBe(1);
  });

  it("l'As avance aussi de 1", () => {
    const st = mk(['AH0']);
    put(st, 0, 0, 10);
    const m = find(st, 'AH0', (m) => m.kind === 'step');
    expect(applyMove(st, m).pawns[0][0].p).toBe(11);
  });

  it('règle de base : le Roi sert seulement à sortir', () => {
    const st = mk(['KS0']);
    put(st, 0, 0, 3);
    const ms = movesOf(st, 'KS0');
    expect(ms.every((m) => m.kind === 'exit')).toBe(true);
    expect(ms.length).toBeGreaterThan(0);
    // Tous les pions sur le parcours : le Roi ne joue pas.
    for (let i = 0; i < 4; i++) put(st, 0, i, 3 + i * 5);
    expect(movesOf(st, 'KS0')).toHaveLength(0);
  });

  it('variante : le Roi sort un pion ou avance de 13', () => {
    const st = mk(['KS0'], { kingThirteen: true });
    put(st, 0, 0, 3);
    const ms = movesOf(st, 'KS0');
    expect(ms.some((m) => m.kind === 'exit')).toBe(true);
    const step = ms.find((m) => m.kind === 'step')!;
    expect(applyMove(st, step).pawns[0][0].p).toBe(16);
  });

  it('sortir prend un pion non protégé posé sur la case de départ', () => {
    const st = mk(['AS0']);
    putSq(st, 1, 0, 0); // pion de la place 1 sur le départ de la place 0
    const after = applyMove(st, find(st, 'AS0', (m) => m.kind === 'exit'));
    expect(after.pawns[1][0].p).toBe(-1);
    expect(after.lastCaptures).toEqual([{ s: 1, i: 0 }]);
  });

  it('impossible de sortir si un pion bloquant occupe déjà le départ', () => {
    const st = mk(['AS0']);
    put(st, 0, 0, 0, true);
    expect(movesOf(st, 'AS0').some((m) => m.kind === 'exit')).toBe(false);
  });
});

describe('cartes de déplacement', () => {
  it.each([
    ['2S0', 2], ['3S0', 3], ['5S0', 5], ['6S0', 6], ['8S0', 8], ['9S0', 9], ['10S0', 10], ['QS0', 12],
  ])('%s avance du bon nombre', (card, k) => {
    const st = mk([card]);
    put(st, 0, 1, 20);
    const m = find(st, card, (m) => m.kind === 'step');
    expect(applyMove(st, m).pawns[0][1].p).toBe(20 + k);
  });

  it('le 4 recule de 4', () => {
    const st = mk(['4S0']);
    put(st, 0, 0, 10);
    expect(applyMove(st, find(st, '4S0', () => true)).pawns[0][0].p).toBe(6);
  });

  it("le 4 depuis la case de départ place le pion à trois trous de l'entrée de sa maison", () => {
    const st = mk(['4S0', '5S0']);
    put(st, 0, 0, 0, true);
    let after = applyMove(st, find(st, '4S0', () => true));
    expect(after.pawns[0][0]).toEqual({ p: L - 4, fresh: false });
    // Il entre ensuite en maison avec un 5 (3 pas jusqu'à l'entrée, 2 en maison).
    after.turn = 0;
    after = applyMove(after, find(after, '5S0', () => true));
    expect(after.pawns[0][0].p).toBe(L + 2);
  });

  it("l'entrée de la maison est le trou juste avant le départ", () => {
    expect(E).toBe(L - 1);
    expect(homeEntry(6)).toBe(trackLen(6) - 1);
  });

  it("depuis le trou d'entrée, le pion entre forcément en maison", () => {
    const st = mk(['3S0']);
    put(st, 0, 0, E);
    expect(applyMove(st, find(st, '3S0', () => true)).pawns[0][0].p).toBe(L + 3);
  });

  it('on ne recule pas en maison avec le 4', () => {
    const st = mk(['4S0']);
    put(st, 0, 0, L + 2);
    expect(movesOf(st, '4S0')).toHaveLength(0);
  });

  it('un pion en base ne bouge pas avec une carte de déplacement', () => {
    const st = mk(['QS0']);
    expect(legalMoves(st)).toEqual([{ kind: 'discard', card: '' }]);
  });
});

describe('prises', () => {
  it("terminer sur un pion adverse le renvoie à sa base", () => {
    const st = mk(['5S0']);
    put(st, 0, 0, 5);
    putSq(st, 1, 2, 10);
    const after = applyMove(st, find(st, '5S0', () => true));
    expect(after.pawns[0][0].p).toBe(10);
    expect(after.pawns[1][2].p).toBe(-1);
  });

  it('le pion partenaire est pris aussi', () => {
    const st = mk(['3S0']);
    put(st, 0, 0, 5);
    putSq(st, 2, 0, 8);
    const after = applyMove(st, find(st, '3S0', () => true));
    expect(after.pawns[2][0].p).toBe(-1);
  });

  it('dépasser un pion (hors 7) ne le prend pas', () => {
    const st = mk(['8S0']);
    put(st, 0, 0, 5);
    putSq(st, 1, 0, 8);
    const after = applyMove(st, find(st, '8S0', () => true));
    expect(after.pawns[1][0].p).not.toBe(-1);
  });
});

describe('blocage sur la case de départ', () => {
  it('personne ne peut dépasser un pion qui vient de sortir', () => {
    const st = mk(['5S0']);
    put(st, 0, 0, 15);
    put(st, 1, 0, 0, true); // case absolue 16
    expect(movesOf(st, '5S0')).toHaveLength(0);
  });

  it('ni le prendre', () => {
    const st = mk(['3S0']);
    put(st, 0, 0, 13);
    put(st, 1, 0, 0, true);
    expect(movesOf(st, '3S0')).toHaveLength(0);
  });

  it('dès qu\'il a bougé, il ne bloque plus', () => {
    const st = mk(['5S0']);
    put(st, 0, 0, 15);
    put(st, 1, 0, 1, false);
    expect(movesOf(st, '5S0')).toHaveLength(1);
  });

  it('il bloque aussi les pions de son équipe', () => {
    const st = mk(['3S0']);
    put(st, 0, 0, 30);
    put(st, 2, 0, 0, true); // case absolue 32
    expect(movesOf(st, '3S0')).toHaveLength(0);
  });

  it("mais pas ceux qui rentrent : l'entrée est avant le départ", () => {
    const st = mk(['3S0']);
    put(st, 0, 0, 0, true);
    put(st, 0, 1, E - 1);
    const m = find(st, '3S0', (m) => m.kind === 'step' && m.pawn.i === 1);
    expect(applyMove(st, m).pawns[0][1].p).toBe(L + 2);
  });

  it('variante sans blocage : on peut dépasser et prendre', () => {
    const st = mk(['3S0'], { startBlocks: false });
    put(st, 0, 0, 13);
    put(st, 1, 0, 0, true);
    const after = applyMove(st, find(st, '3S0', () => true));
    expect(after.pawns[1][0].p).toBe(-1);
  });
});

describe('entrée en maison', () => {
  it('à la valeur exacte', () => {
    const st = mk(['6S0']);
    put(st, 0, 0, E - 2);
    expect(applyMove(st, find(st, '6S0', () => true)).pawns[0][0].p).toBe(L + 4);
  });

  it('impossible de dépasser le fond de la maison', () => {
    const st = mk(['8S0']);
    put(st, 0, 0, E - 2);
    expect(movesOf(st, '8S0')).toHaveLength(0);
  });

  it('impossible de sauter un pion déjà en maison', () => {
    const st = mk(['5S0', '3S0']);
    put(st, 0, 0, E - 2);
    put(st, 0, 1, L + 2);
    expect(movesOf(st, '5S0').filter((m) => m.kind === 'step' && m.pawn.i === 0)).toHaveLength(0);
    // Mais on peut s'arrêter juste avant.
    const m = find(st, '3S0', (m) => m.kind === 'step' && m.pawn.i === 0);
    expect(applyMove(st, m).pawns[0][0].p).toBe(L + 1);
  });

  it('un pion en maison peut encore avancer dans la maison', () => {
    const st = mk(['2S0']);
    put(st, 0, 0, L + 1);
    expect(applyMove(st, find(st, '2S0', () => true)).pawns[0][0].p).toBe(L + 3);
  });
});

describe('le 7', () => {
  it('se répartit entre plusieurs pions', () => {
    const st = mk(['7S0']);
    put(st, 0, 0, 10);
    put(st, 0, 1, 30);
    const m = find(st, '7S0', (m) => m.kind === 'seven' && m.parts.length === 2 && m.parts[0].pawn.i === 0 && m.parts[0].steps === 3);
    const after = applyMove(st, m);
    expect(after.pawns[0][0].p).toBe(13);
    expect(after.pawns[0][1].p).toBe(34);
  });

  it('variante : prend les pions dépassés et atteints', () => {
    const st = mk(['7S0'], { sevenNoPassCapture: false });
    put(st, 0, 0, 10);
    putSq(st, 1, 0, 12); // dépassé
    putSq(st, 2, 0, 17); // atteint
    const m = find(st, '7S0', (m) => m.kind === 'seven' && m.parts.length === 1);
    const after = applyMove(st, m);
    expect(after.pawns[0][0].p).toBe(17);
    expect(after.pawns[1][0].p).toBe(-1);
    expect(after.pawns[2][0].p).toBe(-1);
  });

  it('variante : les pions dépassés restent en place', () => {
    const st = mk(['7S0'], { sevenNoPassCapture: true });
    put(st, 0, 0, 10);
    putSq(st, 1, 0, 12);
    const after = applyMove(st, find(st, '7S0', (m) => m.kind === 'seven'));
    expect(after.pawns[1][0].p).not.toBe(-1);
  });

  it('doit être joué en entier', () => {
    const st = mk(['7S0']);
    put(st, 0, 0, L + 1); // ne peut avancer que de 3 en maison
    expect(movesOf(st, '7S0')).toHaveLength(0);
  });

  it("ne passe pas un pion bloquant", () => {
    const st = mk(['7S0']);
    put(st, 0, 0, 15);
    put(st, 1, 0, 0, true);
    // Seul le pion 0 est sur le parcours et le bloqueur est juste devant : 7 impossible.
    expect(movesOf(st, '7S0')).toHaveLength(0);
  });

  it('le reste du 7 sert au partenaire une fois tous ses pions rentrés', () => {
    const st = mk(['7S0']);
    put(st, 0, 0, L + 2);
    put(st, 0, 1, L + 3);
    put(st, 0, 2, L + 4);
    put(st, 0, 3, E - 1); // 2 pas pour entrer en case maison 1
    put(st, 2, 0, 20);
    const m = find(st, '7S0', (m) => m.kind === 'seven' && m.parts.length === 2 && m.parts[0].pawn.s === 0);
    expect(m.kind === 'seven' && m.parts[1].pawn.s).toBe(2);
    const after = applyMove(st, m);
    expect(after.pawns[0][3].p).toBe(L + 1);
    expect(after.pawns[2][0].p).toBe(25);
  });
});

describe('le 7 sur deux pions au plus (règle de base)', () => {
  it('se partage entre deux pions, pas trois', () => {
    const st = mk(['7S0']);
    put(st, 0, 0, 10);
    put(st, 0, 1, 20);
    put(st, 0, 2, 30);
    const ms = movesOf(st, '7S0').filter((m) => m.kind === 'seven');
    expect(ms.some((m) => m.kind === 'seven' && m.parts.length === 2)).toBe(true);
    expect(ms.every((m) => m.kind === 'seven' && new Set(m.parts.map((p) => p.pawn.i)).size <= 2)).toBe(true);
    const three = { kind: 'seven' as const, card: '7S0', as: '7' as const, parts: [0, 1, 2].map((i) => ({ pawn: { s: 0, i }, steps: i === 0 ? 3 : 2 })) };
    expect(() => applyMove(st, three)).toThrow();
  });

  it('variante : sur autant de pions qu’on veut', () => {
    const st = mk(['7S0'], { sevenAnyPawns: true });
    put(st, 0, 0, 10);
    put(st, 0, 1, 20);
    put(st, 0, 2, 30);
    expect(movesOf(st, '7S0').some((m) => m.kind === 'seven' && m.parts.length === 3)).toBe(true);
  });

  it('ne prend pas les pions dépassés', () => {
    const st = mk(['7S0']);
    put(st, 0, 0, 10);
    putSq(st, 1, 0, 12);
    const m = movesOf(st, '7S0').find((x) => x.kind === 'seven' && x.parts.length === 1)!;
    expect(applyMove(st, m).pawns[1][0].p).not.toBe(-1);
  });
});

describe('le Valet', () => {
  it('règle de base : échange un de ses pions avec un pion du parcours (partenaire ou adversaire)', () => {
    const st = mk(['JS0']);
    put(st, 0, 0, 10);
    putSq(st, 1, 0, 40);
    const m = find(st, 'JS0', (m) => m.kind === 'swap' && m.target.s === 1);
    const after = applyMove(st, m);
    expect(after.pawns[0][0].p).toBe(40);
    expect(after.pawns[1][0].p).toBe(progressAt(4, 1, 10));
  });

  it('sa propre bille tout juste sortie peut échanger', () => {
    const st = mk(['JS0']);
    put(st, 0, 0, 0, true);
    putSq(st, 1, 0, 40);
    const m = find(st, 'JS0', (x) => x.kind === 'swap' && sameRef(x.pawn, { s: 0, i: 0 }) && x.target.s === 1);
    const after = applyMove(st, m);
    expect(after.pawns[0][0]).toEqual({ p: 40, fresh: false });
  });

  it('une bille adverse tout juste sortie reste protégée', () => {
    const st = mk(['JS0']);
    put(st, 0, 0, 10);
    put(st, 1, 0, 0, true);
    expect(movesOf(st, 'JS0').some((x) => x.kind === 'swap' && x.target.s === 1)).toBe(false);
  });

  it('échange aussi avec un pion de son partenaire', () => {
    const st = mk(['JS0']);
    put(st, 0, 0, 10);
    putSq(st, 2, 0, 45);
    const m = find(st, 'JS0', (x) => x.kind === 'swap' && x.target.s === 2);
    const after = applyMove(st, m);
    expect(after.pawns[0][0].p).toBe(45);
    expect(after.pawns[2][0].p).toBe(progressAt(4, 2, 10));
  });

  it("n'échange ni avec un pion en maison, ni à la base, ni protégé", () => {
    const st = mk(['JS0']);
    put(st, 0, 0, 10);
    put(st, 1, 0, L + 1);
    put(st, 2, 0, 0, true);
    expect(movesOf(st, 'JS0')).toHaveLength(0);
  });

  it('variante : le Valet compte 11', () => {
    const st = mk(['JS0'], { jackEleven: true });
    put(st, 0, 0, 10);
    putSq(st, 1, 0, 40);
    const ms = movesOf(st, 'JS0');
    expect(ms).toHaveLength(1);
    expect(applyMove(st, ms[0]).pawns[0][0].p).toBe(21);
  });
});

describe('variantes et Joker', () => {
  it('variante du 5 : on fait avancer un pion adverse', () => {
    const st = mk(['5S0'], { fiveOthers: true });
    put(st, 0, 0, 10);
    put(st, 1, 0, 3);
    const ms = movesOf(st, '5S0');
    expect(ms.every((m) => m.kind === 'step' && m.pawn.s !== 0)).toBe(true);
    expect(applyMove(st, ms[0]).pawns[1][0].p).toBe(8);
  });

  it('le Joker remplace n\'importe quelle carte', () => {
    const st = mk(['XJ0']);
    put(st, 0, 0, 10);
    const ms = movesOf(st, 'XJ0');
    const as = new Set(ms.map((m) => m.as));
    for (const r of ['A', 'K', 'Q', '7', '4', '2']) expect(as.has(r as never)).toBe(true);
    const k = ms.find((m) => m.as === 'K' && m.kind === 'exit')!;
    expect(applyMove(st, k).pawns[0][1].p).toBe(0);
  });
});

describe('jeu pour le partenaire', () => {
  it('avec 4 pions en maison, on joue ceux du partenaire', () => {
    const st = mk(['AS0']);
    for (let i = 0; i < 4; i++) put(st, 0, i, L + 1 + i);
    const ms = movesOf(st, 'AS0');
    expect(ms.length).toBeGreaterThan(0);
    expect(ms.every((m) => (m.kind === 'exit' || m.kind === 'step') && m.pawn.s === 2)).toBe(true);
    const after = applyMove(st, ms.find((m) => m.kind === 'exit')!);
    expect(after.pawns[2][0]).toEqual({ p: 0, fresh: true });
  });
});

describe('défausse', () => {
  it('sans coup possible on défausse toute sa main et on passe la donne', () => {
    const st = mk(['QS0', '2S0']);
    expect(legalMoves(st)).toEqual([{ kind: 'discard', card: '' }]);
    const after = applyMove(st, { kind: 'discard', card: '' });
    expect(after.hands[0]).toEqual([]);
    expect(after.passed[0]).toBe(true);
    expect(after.turn).toBe(1);
  });

  it('la défausse est refusée si un coup existe', () => {
    const st = mk(['AS0']);
    expect(() => applyMove(st, { kind: 'discard', card: '' })).toThrow();
  });

  it('un joueur sans carte est sauté, et la donne suivante arrive quand tout le monde a fini', () => {
    const st = mk(['QS0']);
    st.hands = [['QS0'], [], ['3S0'], []];
    let after = applyMove(st, { kind: 'discard', card: '' });
    expect(after.turn).toBe(2);
    after = applyMove(after, { kind: 'discard', card: '' });
    expect(after.phase).toBe('deal');
    expect(after.dealNo).toBe(1);
    expect(after.dealer).toBe(1);
  });
});

describe('défausse d’une seule carte (variante)', () => {
  it('on choisit la carte à défausser et on garde le reste', () => {
    const st = mk(['QS0', '2S0', '2H0'], { discardOne: true });
    const ms = legalMoves(st);
    expect(ms).toEqual([
      { kind: 'discard', card: 'QS0' }, { kind: 'discard', card: '2S0' }, { kind: 'discard', card: '2H0' },
    ]);
    const after = applyMove(st, { kind: 'discard', card: '2S0' });
    expect(after.hands[0]).toEqual(['QS0', '2H0']);
    expect(after.passed[0]).toBe(false);
    expect(after.lastCard).toBe('2S0');
    expect(after.turn).toBe(1);
  });

  it('défausser toute la main est refusé dans cette variante', () => {
    const st = mk(['QS0'], { discardOne: true });
    expect(() => applyMove(st, { kind: 'discard', card: '' })).toThrow();
  });
});

describe('coups pour une carte (legalMovesFor)', () => {
  it('ne renvoie que les coups de la carte touchée', () => {
    const st = mk(['AS0', '5S0']);
    put(st, 0, 0, 10);
    const ms = legalMovesFor(st, 0, '5S0');
    expect(ms.length).toBeGreaterThan(0);
    expect(ms.every((m) => m.kind === 'step' && m.card === '5S0' && m.steps === 5)).toBe(true);
    expect(legalMovesFor(st, 0, 'AS0').some((m) => m.kind === 'exit')).toBe(true);
  });

  it("vide si ce n'est pas son tour ou si la carte n'est pas en main", () => {
    const st = mk(['AS0']);
    expect(legalMovesFor(st, 1, '2C0')).toEqual([]);
    expect(legalMovesFor(st, 0, 'KS0')).toEqual([]);
  });

  it('sans coup possible, la carte touchée propose la défausse', () => {
    const st = mk(['QS0']);
    expect(legalMovesFor(st, 0, 'QS0')).toEqual([{ kind: 'discard', card: '' }]);
  });
});

describe('compteurs de partie (statistiques)', () => {
  it('compte les sorties et les captures adverses du joueur', () => {
    const st = mk(['AS0', '5S0']);
    put(st, 0, 1, 5);
    putSq(st, 1, 0, 10);
    let after = applyMove(st, find(st, 'AS0', (m) => m.kind === 'exit'));
    expect(after.stats.exits[0]).toBe(1);
    after.turn = 0;
    after = applyMove(after, find(after, '5S0', (m) => m.kind === 'step' && m.pawn.i === 1));
    expect(after.stats.captures[0]).toBe(1);
    expect(after.stats.captures[1]).toBe(0);
  });

  it('ne compte pas un partenaire renvoyé dans sa réserve', () => {
    const st = mk(['3S0']);
    put(st, 0, 0, 5);
    putSq(st, 2, 0, 8);
    expect(applyMove(st, find(st, '3S0', () => true)).stats.captures[0]).toBe(0);
  });
});

describe('fin de partie', () => {
  it("l'équipe gagne quand ses 8 pions sont rentrés", () => {
    const st = mk(['AS0']);
    for (let i = 0; i < 4; i++) put(st, 2, i, L + 1 + i);
    put(st, 0, 0, E); // sur sa case d'entrée de maison, après le tour complet
    put(st, 0, 1, L + 2);
    put(st, 0, 2, L + 3);
    put(st, 0, 3, L + 4);
    const after = applyMove(st, find(st, 'AS0', (m) => m.kind === 'step'));
    expect(after.phase).toBe('over');
    expect(after.winner).toBe(0);
    expect(() => legalMoves(after)).not.toThrow();
    expect(legalMoves(after)).toEqual([]);
  });
});

describe('distribution et échange', () => {
  it('donnes de 5, 4 puis 4 cartes, puis nouveau paquet', () => {
    let st = newGame(4);
    const rng = seededRng(1);
    const sizes: number[] = [];
    for (let d = 0; d < 4; d++) {
      st = deal(st, rng);
      sizes.push(st.hands[0].length);
      st = { ...st, hands: st.hands.map(() => []), phase: 'deal', dealNo: st.dealNo + 1 };
    }
    expect(sizes).toEqual([5, 4, 4, 5]);
  });

  it('chaque joueur échange une carte avec son partenaire', () => {
    let st = deal(newGame(4), seededRng(2));
    expect(st.phase).toBe('exchange');
    const gifts = st.hands.map((h) => h[0]);
    for (let s = 0; s < 4; s++) st = giveCard(st, s, gifts[s]);
    expect(st.phase).toBe('play');
    expect(st.hands[0]).toContain(gifts[2]);
    expect(st.hands[2]).toContain(gifts[0]);
    expect(st.hands[1]).toContain(gifts[3]);
    expect(st.hands.every((h) => h.length === 5)).toBe(true);
    expect(st.turn).toBe(1);
  });

  it('à 6 joueurs, deux paquets et des équipes face à face', () => {
    const st = deal(newGame(6, { ...DEFAULT_VARIANTS, jokers: 4 }), seededRng(3));
    expect(st.hands.every((h) => h.length === 5)).toBe(true);
    expect(st.deck.length).toBe(2 * 56 - 30);
    expect(trackLen(6)).toBe(96);
  });
});
