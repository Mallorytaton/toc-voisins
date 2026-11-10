// Données de démonstration de la maquette, affichées seulement avec ?demo dans l'adresse
// (captures d'écran, comparaison avec la maquette). Les vraies données arrivent avec les comptes.
import { CHARS, COLOR_NAMES, type CharId, type ColorName } from './kit/data';
import { DEFAULT_VARIANTS } from '../engine';
import type { League } from '../net/league';

export const DEMO = new URLSearchParams(location.search).has('demo');

export type Presence = 'on' | 'game' | 'off';

export interface Friend {
  name: string;
  char: CharId;
  color: ColorName;
  presence: Presence;
  status: string;
}

export const DEMO_FRIENDS: Friend[] = [
  ['Mimi', 'lunettes', 'yellow', 'on', 'Dans le lobby'],
  ['Coco', 'casquette', 'teal', 'game', 'En partie · Manche 3'],
  ['Le Boss', 'couronne', 'blue', 'on', 'En ligne'],
  ['Ginette', 'chignon', 'violet', 'on', 'En ligne'],
  ['Praline', 'bandeau', 'rose', 'off', 'Vue il y a 2 h'],
  ['Momo', 'tuque', 'blue', 'off', 'Vu hier'],
  ['Chantal', 'lunettes', 'coral', 'off', 'Vue il y a 3 jours'],
].map(([name, char, color, presence, status]) => ({ name, char, color, presence, status }) as Friend);

export interface ChatMsg {
  me: boolean;
  t: string;
}

export const DEMO_CHAT: ChatMsg[] = [
  { me: false, t: 'On se fait une revanche contre les Myrtilles ce soir ?' },
  { me: true, t: 'Carrément. Garde ton Valet pour Le Boss.' },
  { me: false, t: 'Ça marche. Et toi, sors tes pions plus vite !' },
];
export const PARTNER_REPLIES = ['Haha, on les a !', 'Ok, je te suis.', 'Vas-y, lance la salle !', 'Ça marche.'];

export type RankScope = 'amis' | 'monde';

export interface RankRow {
  /** Joueur réel (toucher sa ligne ouvre sa fiche) ; absent en démo. */
  uid?: string;
  name: string;
  region: string;
  pts: number;
  trend: string;
  char: CharId;
  color: ColorName;
}

const mk = (rows: [string, string, number, string][]): RankRow[] =>
  rows.map(([name, region, pts, trend], i) => ({ name, region, pts, trend, char: CHARS[i % 6].id, color: COLOR_NAMES[(i * 5 + 2) % 6] }));

export const DEMO_RANKS: Record<RankScope, RankRow[]> = {
  amis: mk([['Mimi', 'Lyon', 2480, '▲ 1'], ['Le Boss', 'Nantes', 2310, '▼ 1'], ['Coco', 'Lille', 2105, '—'], ['Ginette', 'Bordeaux', 1990, '▲ 2'], ['Praline', 'Rennes', 1620, '▼ 1'], ['Momo', 'Toulouse', 1405, '—'], ['Chantal', 'Nice', 1210, '▲ 1']]),
  monde: mk([['Léa M.', 'Lyon', 6410, '▲ 1'], ['Pieter V.', 'Bruxelles', 6280, '▼ 1'], ['Camille R.', 'Genève', 6105, '—'], ['Julien B.', 'Marseille', 5990, '▲ 4'], ['Aïcha K.', 'Dakar', 5870, '▲ 2'], ['Hugo P.', 'Toulouse', 5720, '▼ 2'], ['Olivia T.', 'Strasbourg', 5655, '—'], ['Marc L.', 'Montpellier', 5530, '▲ 1'], ['Inès B.', 'Nantes', 5410, '▼ 3'], ['Nora S.', 'Liège', 5300, '—']]),
};
export const DEMO_ME_RANK: Record<RankScope, [string, number, string]> = {
  amis: ['#5', 1840, 'Encore 150 pts pour dépasser Ginette'],
  monde: ['#312', 1840, 'Top 5 % mondial'],
};

/** Joueurs fictifs qui remplissent la salle en démo, dans l'ordre d'arrivée. */
export const DEMO_GUESTS: { name: string; char: CharId; color: ColorName }[] = [
  { name: 'Mimi', char: 'lunettes', color: 'yellow' },
  { name: 'Coco', char: 'casquette', color: 'teal' },
  { name: 'Le Boss', char: 'couronne', color: 'blue' },
  { name: 'Ginette', char: 'chignon', color: 'violet' },
  { name: 'Praline', char: 'bandeau', color: 'rose' },
];

// ---------- Un album de démonstration : quatre voisins, douze épisodes ----------

export const DEMO_UID = 'demo-fredo';
const DAY = 86_400_000;
/** Jeudi prochain, 20 h 30 (la soirée de la bande). */
function nextThursday(): number {
  const d = new Date();
  d.setDate(d.getDate() + ((4 - d.getDay() + 7) % 7 || 7));
  d.setHours(20, 30, 0, 0);
  return d.getTime();
}
/** [gagnant, jours écoulés, billes renvoyées par place] des douze parties, de la plus récente à la plus ancienne. */
const DEMO_GAMES: [number, number, number[]][] = [
  [0, 5, [2, 1, 4, 1]], [1, 5, [1, 2, 0, 5]], [0, 12, [5, 2, 1, 1]], [0, 12, [1, 0, 3, 2]], [1, 19, [0, 4, 1, 2]], [0, 19, [3, 1, 2, 0]],
  [1, 26, [1, 3, 1, 3]], [0, 26, [2, 2, 2, 1]], [1, 33, [0, 2, 1, 4]], [0, 33, [4, 1, 1, 0]], [1, 40, [2, 5, 0, 1]], [0, 40, [1, 1, 3, 2]],
];
export const DEMO_LEAGUE: League = {
  code: '4821', name: 'Les voisins du 12', n: 4, host: DEMO_UID,
  seats: [DEMO_UID, 'demo-boss', 'demo-mimi', 'demo-coco'],
  members: {
    [DEMO_UID]: { name: 'Frédo', char: 'tuque', color: 'coral' },
    'demo-boss': { name: 'Le Boss', char: 'couronne', color: 'blue' },
    'demo-mimi': { name: 'Mimi', char: 'lunettes', color: 'yellow' },
    'demo-coco': { name: 'Coco', char: 'casquette', color: 'teal' },
  },
  wins: [7, 5],
  games: DEMO_GAMES.map(([winner, days, captures], k) => ({
    key: 'demo-' + k, winner, at: Date.now() - days * DAY - (k % 2) * 3_600_000, duration: (24 + (k * 7) % 13) * 60_000,
    captures, exits: [4, 4, 4, 4].map((v, s) => (s % 2 === winner ? v : 2 + ((k + s) % 3))), offline: k === 4,
  })),
  variants: DEFAULT_VARIANTS,
  soiree: { id: 'demo-soiree', at: nextThursday(), place: 'Chez Mimi', by: 'demo-mimi', rsvp: { 'demo-mimi': 'oui', 'demo-boss': 'oui', 'demo-coco': 'peut' } },
  offline: [],
};
