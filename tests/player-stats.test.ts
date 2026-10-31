import { describe, expect, it } from 'vitest';
import { addGame } from '../src/app/player-stats';

const win = { won: true, captures: 2, exits: 3, cards: { '7': 2, A: 1 }, partner: 'mimi' };
const loss = { won: false, captures: 1, exits: 1, cards: { '7': 1 }, partner: '' };

describe('fiche de joueur', () => {
  it('cumule parties, victoires, BOUM, billes sorties et cartes', () => {
    const s = addGame(addGame(null, win, 1), loss, 2);
    expect(s).toMatchObject({ games: 2, wins: 1, captures: 3, exits: 4, cards: { '7': 3, A: 1 }, since: 1 });
  });

  it('suit la série en cours et la plus longue', () => {
    let s = addGame(null, win);
    s = addGame(s, win);
    s = addGame(s, loss);
    s = addGame(s, win);
    expect(s.streak).toBe(1);
    expect(s.best).toBe(2);
  });

  it('compte les victoires avec chaque partenaire humain (pas les robots)', () => {
    const s = addGame(addGame(addGame(null, win), { ...win, won: false }), loss);
    expect(s.partners).toEqual({ mimi: { g: 2, w: 1 } });
  });
});
