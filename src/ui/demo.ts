// Données de démonstration de la maquette, affichées seulement avec ?demo dans l'adresse
// (captures d'écran, comparaison avec la maquette). Les vraies données arrivent avec les comptes.
import { CHARS, COLOR_NAMES, type CharId, type ColorName } from './kit/data';

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
