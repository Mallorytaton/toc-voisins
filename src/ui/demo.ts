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
  ['Pinotte', 'bandeau', 'rose', 'off', 'Vue il y a 2 h'],
  ['Ti-Mé', 'tuque', 'blue', 'off', 'Vu hier'],
  ['Chantal', 'lunettes', 'coral', 'off', 'Vue il y a 3 jours'],
].map(([name, char, color, presence, status]) => ({ name, char, color, presence, status }) as Friend);

export interface ChatMsg {
  me: boolean;
  t: string;
}

export const DEMO_CHAT: ChatMsg[] = [
  { me: false, t: 'On se fait une revanche contre les Bleuets à soir ?' },
  { me: true, t: 'Certain. Garde ton Valet pour Le Boss.' },
  { me: false, t: 'Deal. Pis toi, sors tes pions plus vite, mon chum.' },
];
export const PARTNER_REPLIES = ['Haha, on les a !', 'Ok, j’te suis.', 'Envoye, lance la salle !', 'Deal.'];

export type RankScope = 'amis' | 'quebec' | 'monde';

export interface RankRow {
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
  amis: mk([['Mimi', 'Sherbrooke', 2480, '▲ 1'], ['Le Boss', 'Québec', 2310, '▼ 1'], ['Coco', 'Lévis', 2105, '—'], ['Ginette', 'Rimouski', 1990, '▲ 2'], ['Pinotte', 'Gatineau', 1620, '▼ 1'], ['Ti-Mé', 'Saguenay', 1405, '—'], ['Chantal', 'Laval', 1210, '▲ 1']]),
  quebec: mk([['Jean-Guy B.', 'Saguenay', 4820, '—'], ['Chantal R.', 'Québec', 4655, '▲ 2'], ['Maxime T.', 'Laval', 4510, '▼ 1'], ['Sophie L.', 'Trois-Rivières', 4390, '▲ 1'], ['Réjean P.', 'Rimouski', 4215, '▼ 2'], ['Karine B.', 'Gatineau', 4120, '—'], ['Mathieu G.', 'Montréal', 3980, '▲ 3'], ['Nathalie D.', 'Sherbrooke', 3870, '▼ 1'], ['Stéphane V.', 'Lévis', 3755, '—'], ['Ti-Mé', 'Saguenay', 3690, '▲ 1']]),
  monde: mk([['Léa M.', 'Lyon', 6410, '▲ 1'], ['Pieter V.', 'Bruxelles', 6280, '▼ 1'], ['Camille R.', 'Genève', 6105, '—'], ['Jean-Guy B.', 'Saguenay', 5990, '▲ 4'], ['Aïcha K.', 'Dakar', 5870, '▲ 2'], ['Hugo P.', 'Toulouse', 5720, '▼ 2'], ['Olivia T.', 'Toronto', 5655, '—'], ['Marc-André L.', 'Montréal', 5530, '▲ 1'], ['Inès B.', 'Marseille', 5410, '▼ 3'], ['Nora S.', 'Liège', 5300, '—']]),
};
export const DEMO_ME_RANK: Record<RankScope, [string, number, string]> = {
  amis: ['#5', 1840, 'Encore 150 pts pour dépasser Ginette'],
  quebec: ['#27', 1840, 'Top 30 au Québec'],
  monde: ['#312', 1840, 'Top 5 % mondial'],
};

/** Joueurs fictifs qui remplissent la salle en démo, dans l'ordre d'arrivée. */
export const DEMO_GUESTS: { name: string; char: CharId; color: ColorName }[] = [
  { name: 'Mimi', char: 'lunettes', color: 'yellow' },
  { name: 'Coco', char: 'casquette', color: 'teal' },
  { name: 'Le Boss', char: 'couronne', color: 'blue' },
  { name: 'Ginette', char: 'chignon', color: 'violet' },
  { name: 'Pinotte', char: 'bandeau', color: 'rose' },
];
