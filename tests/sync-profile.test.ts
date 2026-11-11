// La synchronisation du profil avec le compte en ligne, sur une fausse base en mémoire : elle lit le compte avant d'y
// écrire, ne fait jamais reculer la progression, et n'écrit rien si la lecture échoue.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ data: {} as Record<string, unknown>, writes: [] as string[], offline: false }));

vi.mock('firebase/database', () => {
  const read = async (path: string) => {
    if (db.offline) throw new Error('Client is offline');
    return { val: () => db.data[path] ?? null };
  };
  return {
    get: read,
    set: async (path: string, v: unknown) => { db.writes.push(path); db.data[path] = v; },
    update: async (path: string, v: Record<string, unknown>) => { db.writes.push(path); db.data[path] = { ...((db.data[path] as object) ?? {}), ...v }; },
    serverTimestamp: () => 0,
    limitToLast: vi.fn(), onDisconnect: vi.fn(), onValue: vi.fn(), orderByChild: vi.fn(), push: vi.fn(), query: vi.fn(), ref: vi.fn(), remove: vi.fn(), runTransaction: vi.fn(),
  };
});
vi.mock('../src/net/firebase', () => ({
  database: () => ({}), ensureAuth: async () => 'moi', node: (...parts: (string | number)[]) => parts.join('/'), serverNow: () => 0,
}));
vi.mock('../src/net/push', () => ({ notifyPlayers: vi.fn() }));

import { getProfile, saveProfile } from '../src/app/profile';
import { syncProfile } from '../src/net/social';

type Stored = { xp: number; tokens: number; points: number; code: string; nick: string; owned?: string[]; stats?: unknown };
const account = () => db.data['users/moi'] as Stored;

describe('synchronisation du profil avec le compte', () => {
  beforeEach(() => {
    db.data = {};
    db.writes = [];
    db.offline = false;
    // Un profil tout neuf sur ce téléphone (app réinstallée, perso recréé).
    saveProfile({ nick: 'Mallo', char: 'tuque', color: 'coral', xp: 0, tokens: 0, points: 0, owned: [], look: {}, friendCode: 'MALLO#9999' });
  });

  it('premier compte : le profil du téléphone part en ligne et réserve son code ami', async () => {
    expect(await syncProfile()).toBeNull();
    expect(account()).toMatchObject({ nick: 'Mallo', xp: 0, tokens: 0, code: 'MALLO#9999' });
    expect(db.data['codes/MALLO-9999']).toBe('moi');
  });

  it('compte déjà riche : le profil tout neuf ne l’écrase pas, il le reprend', async () => {
    db.data['users/moi'] = { nick: 'Mallo', char: 'couronne', color: 'blue', xp: 4200, tokens: 950, points: 610, code: 'MALLO#1111', owned: ['rayee'], look: { bille: 'rayee' }, stats: { games: 10, wins: 6 } };
    db.data['codes/MALLO-1111'] = 'moi';
    expect(await syncProfile()).toEqual({ xp: 4200, tokens: 950 });
    expect(account()).toMatchObject({ xp: 4200, tokens: 950, points: 610, code: 'MALLO#1111', owned: ['rayee'] });
    // La fiche du joueur, rangée à part, n'est pas touchée.
    expect(account().stats).toEqual({ games: 10, wins: 6 });
    expect(getProfile()).toMatchObject({ xp: 4200, tokens: 950, points: 610, friendCode: 'MALLO#1111', owned: ['rayee'], look: { bille: 'rayee' } });
  });

  it('compte déjà écrasé (XP et pièces à zéro) : la fiche du joueur les fait revenir, sur le téléphone et en ligne', async () => {
    db.data['users/moi'] = { nick: 'Mallo', char: 'tuque', color: 'coral', xp: 0, tokens: 0, points: 0, code: 'MALLO#9999', stats: { games: 10, wins: 6 } };
    db.data['codes/MALLO-9999'] = 'moi';
    expect(await syncProfile()).toEqual({ xp: 1140, tokens: 680 });
    expect(account()).toMatchObject({ xp: 1140, tokens: 680, points: 200 });
    expect(getProfile()).toMatchObject({ xp: 1140, tokens: 680, points: 200 });
    // Une seconde synchronisation ne redonne rien.
    expect(await syncProfile()).toBeNull();
    expect(account()).toMatchObject({ xp: 1140, tokens: 680, points: 200 });
  });

  it('des gains pas encore envoyés montent en ligne', async () => {
    db.data['users/moi'] = { nick: 'Mallo', xp: 2000, tokens: 1000, points: 400, code: 'MALLO#9999', stats: { games: 5, wins: 5 } };
    db.data['codes/MALLO-9999'] = 'moi';
    saveProfile({ xp: 2150, tokens: 1100, points: 430 });
    expect(await syncProfile()).toBeNull();
    expect(account()).toMatchObject({ xp: 2150, tokens: 1100, points: 430 });
  });

  it('lecture du compte impossible : rien n’est écrit, rien ne change sur le téléphone', async () => {
    db.data['users/moi'] = { nick: 'Mallo', xp: 4200, tokens: 950, code: 'MALLO#1111' };
    db.offline = true;
    await expect(syncProfile()).rejects.toThrow();
    expect(db.writes).toEqual([]);
    expect(getProfile()).toMatchObject({ xp: 0, tokens: 0 });
  });

  it('le code ami du profil neuf appartient déjà à un autre compte : on en tire un autre, la progression reste', async () => {
    db.data['users/moi'] = { nick: 'Mallo', xp: 0, tokens: 0, points: 0, code: 'MALLO#9999', stats: { games: 2, wins: 2 } };
    db.data['codes/MALLO-9999'] = 'un-autre';
    expect(await syncProfile()).toEqual({ xp: 300, tokens: 200 });
    const code = getProfile()!.friendCode!;
    expect(code).not.toBe('MALLO#9999');
    expect(db.data['codes/' + code.replace('#', '-')]).toBe('moi');
    expect(account()).toMatchObject({ xp: 300, tokens: 200, code });
  });
});
