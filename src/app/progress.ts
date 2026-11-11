// Rapprocher le profil du téléphone de celui du compte en ligne, sans jamais faire perdre de progression (calcul pur, testé).
// L'app envoyait le profil du téléphone tel quel. Un profil tout neuf (app réinstallée, compte Google retrouvé, puis
// perso recréé) écrasait donc les XP, les pièces et les achats du compte. Désormais on lit le compte avant d'y écrire et
// on garde le meilleur des deux. La fiche du joueur (parties et victoires, rangée à part, jamais écrasée) sert de
// plancher : elle permet de retrouver ce qui a déjà été perdu.
import type { PlayerStats } from './player-stats';
import type { Profile } from './profile';
import { type Look, SHOP } from './shop';

/** Ce que rapporte une partie en ligne terminée. */
export const GAINS = { win: { xp: 150, tokens: 100, points: 30 }, loss: { xp: 60, tokens: 20, points: 5 } } as const;

/** Le profil du compte en ligne, tel que l'app l'y écrit, avec la fiche du joueur. */
export interface OnlineProfile {
  nick?: string;
  xp?: number;
  tokens?: number;
  points?: number;
  code?: string;
  /** Firebase rend un tableau, ou un objet quand il a des trous */
  owned?: string[] | Record<string, string>;
  look?: Look;
  stats?: Partial<PlayerStats> | null;
}

const int = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0);
const ids = (x: OnlineProfile['owned'] | undefined) => [...new Set(Object.values(x ?? {}).filter((v): v is string => typeof v === 'string'))];
const price = (list: string[]) => list.reduce((a, id) => a + (SHOP.find((x) => x.id === id)?.price ?? 0), 0);

/** Ce que les parties comptées dans la fiche ont forcément rapporté. Un plancher : la fiche a pu manquer des parties. */
export function earned(stats: Partial<PlayerStats> | null | undefined) {
  const games = int(stats?.games), wins = Math.min(games, int(stats?.wins)), losses = games - wins;
  return {
    xp: wins * GAINS.win.xp + losses * GAINS.loss.xp,
    tokens: wins * GAINS.win.tokens + losses * GAINS.loss.tokens,
    points: wins * GAINS.win.points + losses * GAINS.loss.points,
  };
}

/**
 * Le profil à garder, sur le téléphone comme en ligne.
 * - XP et points ne font que monter : le plus haut du téléphone, du compte et de ce que la fiche prouve.
 * - Achats : tout ce que l'un ou l'autre possède.
 * - Pièces : chaque solde est d'abord ramené aux achats que l'autre connaît déjà (un achat fait ailleurs, ou pas encore
 *   envoyé), puis on garde le plus haut ; jamais moins que les gains prouvés par la fiche, achats déduits.
 * - Surnom, perso, couleur : ceux du téléphone, comme avant.
 * mine : ce profil a déjà été rapproché de ce compte. Sinon (profil tout neuf, ou d'avant ce rapprochement), ce que
 * porte le joueur et son code ami viennent d'abord du compte.
 */
export function mergeProfile(local: Profile, online: OnlineProfile | null, mine: boolean): Profile {
  if (!online?.nick) return local;
  const here = ids(local.owned), there = ids(online.owned);
  const owned = [...new Set([...there, ...here])];
  const floor = earned(online.stats);
  const tokens = Math.max(
    0,
    int(local.tokens) - price(there.filter((id) => !here.includes(id))),
    int(online.tokens) - price(here.filter((id) => !there.includes(id))),
    floor.tokens - price(owned),
  );
  return {
    ...local,
    xp: Math.max(int(local.xp), int(online.xp), floor.xp),
    points: Math.max(int(local.points), int(online.points), floor.points),
    tokens,
    owned,
    look: mine ? local.look : { ...(online.look ?? {}), ...(local.look ?? {}) },
    friendCode: mine ? local.friendCode : online.code || local.friendCode,
  };
}

/** Le rapprochement change-t-il quelque chose au profil du téléphone ? */
export function sameProgress(a: Profile, b: Profile) {
  return a.xp === b.xp && a.tokens === b.tokens && (a.points ?? 0) === (b.points ?? 0) && a.friendCode === b.friendCode
    && JSON.stringify([...(a.owned ?? [])].sort()) === JSON.stringify([...(b.owned ?? [])].sort())
    && JSON.stringify(a.look ?? {}) === JSON.stringify(b.look ?? {});
}
