import { describe, expect, it } from 'vitest';
import type { Profile } from '../src/app/profile';
import { GAINS, earned, mergeProfile, sameProgress } from '../src/app/progress';

const base: Profile = { nick: 'Mallo', char: 'tuque', color: 'coral', level: 1, xp: 0, tokens: 0 };
const local = (p: Partial<Profile> = {}): Profile => ({ ...base, friendCode: 'MALLO#1111', ...p });
/** Une fiche de joueur : tant de parties en ligne, dont tant de victoires. */
const stats = (games: number, wins: number) => ({ games, wins });

describe('progression : ce que les parties jouées ont forcément rapporté', () => {
  it('une victoire et une défaite rapportent ce que donne la fin de partie', () => {
    expect(earned(stats(1, 1))).toEqual({ xp: 150, tokens: 100, points: 30 });
    expect(earned(stats(1, 0))).toEqual({ xp: 60, tokens: 20, points: 5 });
    expect(earned(stats(10, 6))).toEqual({ xp: 6 * GAINS.win.xp + 4 * GAINS.loss.xp, tokens: 680, points: 200 });
  });

  it('une fiche absente ou abîmée ne rapporte rien, et jamais plus de victoires que de parties', () => {
    expect(earned(null)).toEqual({ xp: 0, tokens: 0, points: 0 });
    expect(earned({ games: Number.NaN, wins: -3 })).toEqual({ xp: 0, tokens: 0, points: 0 });
    expect(earned(stats(2, 9))).toEqual(earned(stats(2, 2)));
  });
});

describe('progression : rapprocher le profil du téléphone de celui du compte', () => {
  it('compte tout neuf (rien en ligne) : le profil du téléphone part tel quel', () => {
    const p = local({ xp: 300, tokens: 120 });
    expect(mergeProfile(p, null, false)).toBe(p);
    expect(mergeProfile(p, {}, false)).toBe(p);
  });

  it('téléphone et compte d’accord : rien ne change', () => {
    const p = local({ xp: 1140, tokens: 380, points: 200, owned: ['rayee'], look: { bille: 'rayee' } });
    const m = mergeProfile(p, { nick: 'Mallo', xp: 1140, tokens: 380, points: 200, code: 'MALLO#1111', owned: ['rayee'], look: { bille: 'rayee' }, stats: stats(10, 6) }, true);
    expect(sameProgress(m, p)).toBe(true);
  });

  it('app réinstallée, profil tout neuf : il reprend la progression du compte au lieu de l’écraser', () => {
    const m = mergeProfile(local({ friendCode: 'MALLO#9999' }),
      { nick: 'Mallo', xp: 4200, tokens: 950, points: 610, code: 'MALLO#1111', owned: ['rayee', 'paf'], look: { bille: 'rayee', cri: 'paf' }, stats: stats(10, 6) }, false);
    expect([m.xp, m.tokens, m.points]).toEqual([4200, 950, 610]);
    expect(m.owned).toEqual(['rayee', 'paf']);
    expect(m.look).toEqual({ bille: 'rayee', cri: 'paf' });
    // Le code ami du compte reste le même : les amis le connaissent déjà.
    expect(m.friendCode).toBe('MALLO#1111');
  });

  it('compte déjà écrasé (XP et pièces à zéro, achats perdus) : la fiche du joueur permet de tout recalculer', () => {
    const m = mergeProfile(local(), { nick: 'Mallo', xp: 0, tokens: 0, points: 0, code: 'MALLO#1111', stats: stats(10, 6) }, false);
    expect([m.xp, m.tokens, m.points]).toEqual([6 * 150 + 4 * 60, 6 * 100 + 4 * 20, 6 * 30 + 4 * 5]);
  });

  it('compte écrasé mais achats gardés : les pièces retrouvées sont celles gagnées, achats déduits', () => {
    // 680 pièces gagnées, une bille rayée à 300 déjà achetée.
    const m = mergeProfile(local(), { nick: 'Mallo', xp: 0, tokens: 0, owned: ['rayee'], stats: stats(10, 6) }, false);
    expect(m.tokens).toBe(380);
    expect(m.owned).toEqual(['rayee']);
  });

  it('la fiche ne donne jamais plus que ce que le joueur a déjà', () => {
    // Des parties ont été jouées avant que la fiche existe : le joueur a plus que ce qu'elle prouve.
    const p = local({ xp: 5000, tokens: 2000, points: 900 });
    const m = mergeProfile(p, { nick: 'Mallo', xp: 5000, tokens: 2000, points: 900, stats: stats(10, 6) }, true);
    expect([m.xp, m.tokens, m.points]).toEqual([5000, 2000, 900]);
  });

  it('un achat pas encore envoyé (fait hors ligne) n’est pas remboursé', () => {
    // Sur le téléphone : 1000 - 300 pour la bille rayée. En ligne : encore 1000, sans la bille.
    const m = mergeProfile(local({ xp: 2000, tokens: 700, owned: ['rayee'], look: { bille: 'rayee' } }), { nick: 'Mallo', xp: 2000, tokens: 1000, stats: stats(12, 8) }, true);
    expect(m.tokens).toBe(700);
    expect(m.owned).toEqual(['rayee']);
    expect(m.look).toEqual({ bille: 'rayee' });
  });

  it('un autre téléphone a joué et acheté depuis : celui-ci rattrape, sans payer deux fois', () => {
    // Ici : 1000 pièces, rien d'acheté. Ailleurs : +100 gagnées, puis un cri à 150 → 950 en ligne.
    const m = mergeProfile(local({ xp: 2000, tokens: 1000 }), { nick: 'Mallo', xp: 2150, tokens: 950, owned: ['paf'], look: { cri: 'paf' }, stats: stats(5, 5) }, true);
    expect([m.xp, m.tokens]).toEqual([2150, 950]);
    expect(m.owned).toEqual(['paf']);
  });

  it('des gains pas encore envoyés (la connexion a lâché en fin de partie) ne sont pas perdus', () => {
    const m = mergeProfile(local({ xp: 2150, tokens: 1100, points: 430 }), { nick: 'Mallo', xp: 2000, tokens: 1000, points: 400, stats: stats(5, 5) }, true);
    expect([m.xp, m.tokens, m.points]).toEqual([2150, 1100, 430]);
  });

  it('les objets achetés des deux côtés sont réunis, et Firebase peut rendre un objet à la place d’un tableau', () => {
    const m = mergeProfile(local({ tokens: 500, owned: ['rayee'] }), { nick: 'Mallo', tokens: 650, owned: { 0: 'paf', 2: 'voisin' } }, true);
    expect([...(m.owned ?? [])].sort()).toEqual(['paf', 'rayee', 'voisin']);
    // Chaque solde est ramené aux achats de l'autre (500 - 150 - 200 = 150 ; 650 - 300 = 350) : on garde le plus haut.
    expect(m.tokens).toBe(350);
  });

  it('le surnom, le perso et la couleur restent ceux du téléphone', () => {
    const m = mergeProfile(local({ nick: 'Mallo 2', char: 'lunettes', color: 'blue' }), { nick: 'Ancien', xp: 10, stats: stats(0, 0) }, false);
    expect([m.nick, m.char, m.color]).toEqual(['Mallo 2', 'lunettes', 'blue']);
  });
});
