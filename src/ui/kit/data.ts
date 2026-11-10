// Données visuelles de la maquette : couleurs de joueur, personnages, cartes.

export type ColorName = 'coral' | 'blue' | 'yellow' | 'teal' | 'violet' | 'rose';
export type CharId = 'tuque' | 'lunettes' | 'couronne' | 'casquette' | 'chignon' | 'bandeau';

export interface Tint {
  /** Principale */
  c: string;
  /** Foncée (relief, ombre) */
  d: string;
  /** Teinte claire */
  l: string;
}

/** Couleurs franches de la direction BD : aplat, ombre du même ton, teinte claire. */
export const COL: Record<ColorName, Tint> = {
  coral: { c: '#ff5433', d: '#d4381b', l: '#ffe0d6' },
  blue: { c: '#3b5bff', d: '#2440d6', l: '#dfe5ff' },
  yellow: { c: '#ffcf1f', d: '#e3a700', l: '#fff3c4' },
  teal: { c: '#19c6a4', d: '#0e9a7f', l: '#d2f6ec' },
  violet: { c: '#9b6bff', d: '#7646e0', l: '#ebe2ff' },
  rose: { c: '#ff7ab8', d: '#e0508f', l: '#ffe1ef' },
};

export const COLOR_NAMES: ColorName[] = ['coral', 'blue', 'yellow', 'teal', 'violet', 'rose'];

/** Les personnages ont exactement la couleur de leurs billes. */
export const AV_COL: Record<ColorName, [string, string]> = {
  coral: [COL.coral.c, COL.coral.d],
  blue: [COL.blue.c, COL.blue.d],
  yellow: [COL.yellow.c, COL.yellow.d],
  teal: [COL.teal.c, COL.teal.d],
  violet: [COL.violet.c, COL.violet.d],
  rose: [COL.rose.c, COL.rose.d],
};

export const CHARS: { id: CharId; name: string }[] = [
  { id: 'tuque', name: 'Loulou' },
  { id: 'lunettes', name: 'Mimi' },
  { id: 'couronne', name: 'Le Boss' },
  { id: 'casquette', name: 'Coco' },
  { id: 'chignon', name: 'Ginette' },
  { id: 'bandeau', name: 'Praline' },
];

export interface CardLook {
  /** Rang affiché (lettres françaises : R, D, V) */
  r: string;
  /** Symbole de la couleur */
  s: string;
  /** Couleur de la carte (S pique, H cœur, D carreau, C trèfle, X joker), pour la dessiner */
  k: string;
  red: boolean;
  /** Titre court pour la carte d'indice */
  t: string;
  badge: string;
  /** Fond et texte du badge de pouvoir */
  bg: string;
  bc: string;
  rule: string;
}

const SUIT: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
// Bandeau de pouvoir au bas de la carte : un aplat par famille, toujours écrit à l'encre.
const OUT = { bg: '#19c6a4', bc: '#16131f' };
const BACK = { bg: '#b9c6ff', bc: '#16131f' };
const SPLIT = { bg: '#ffcf1f', bc: '#16131f' };
const SWAP = { bg: '#c9b0ff', bc: '#16131f' };
const BIG = { bg: '#ffa58f', bc: '#16131f' };
const SMALL = { bg: '#f0eadc', bc: '#16131f' };
const JOKER = { bg: '#ff7ab8', bc: '#16131f' };

export interface CardOptions {
  /** Variante « Valet = 11 » */
  jackEleven?: boolean;
  /** Variante « 5 pour un autre joueur » */
  fiveOthers?: boolean;
  /** Variante « le Roi avance aussi de 13 » */
  kingThirteen?: boolean;
  /** Variante « le 7 sur autant de pions qu'on veut » */
  sevenAnyPawns?: boolean;
}

/** Apparence d'une carte du moteur ("KH0", "10S1", "XJ3"). */
export function cardLook(card: string, o: CardOptions = {}): CardLook {
  const rank = card.slice(0, -2);
  const suitKey = card[card.length - 2];
  const s = SUIT[suitKey] ?? '★';
  const k = SUIT[suitKey] ? suitKey : 'X';
  const red = suitKey === 'H' || suitKey === 'D';
  const n = Number(rank);
  switch (rank) {
    case 'A':
      return { r: 'A', s, k, red, t: 'As', badge: 'Sortir', ...OUT, rule: 'Sors une bille de ta réserve, ou avance de 1.' };
    case 'K':
      return { r: 'R', s, k, red, t: 'Roi', badge: 'Sortir', ...OUT, rule: o.kingThirteen ? 'Sors une bille de ta réserve, ou avance de 13.' : 'Sors une bille de ta réserve.' };
    case 'Q':
      return { r: 'D', s, k, red, t: 'Dame', badge: '+12', ...BIG, rule: 'Avance de 12 trous.' };
    case 'J':
      return o.jackEleven
        ? { r: 'V', s, k, red, t: 'Valet', badge: '+11', ...BIG, rule: 'Avance de 11 trous.' }
        : { r: 'V', s, k, red, t: 'Valet', badge: 'Échange', ...SWAP, rule: 'Échange une de tes billes avec une autre, de ton équipe ou adverse.' };
    case '4':
      return { r: '4', s, k, red, t: 'Le 4', badge: 'Recule 4', ...BACK, rule: 'Recule de 4 trous. Le raccourci des pros.' };
    case '7':
      return { r: '7', s, k, red, t: 'Le 7', badge: 'Partage', ...SPLIT, rule: o.sevenAnyPawns ? 'Avance de 7, ou partage les 7 entre tes billes.' : 'Avance de 7, ou partage les 7 entre deux billes.' };
    case 'X':
      return { r: '★', s: '★', k: 'X', red: false, t: 'Joker', badge: 'Joker', ...JOKER, rule: 'Joue-la comme n’importe quelle carte.' };
    case '5':
      if (o.fiveOthers) return { r: '5', s, k, red, t: 'Le 5', badge: 'Pousse 5', ...BACK, rule: 'Fais avancer de 5 la bille d’un autre joueur.' };
  }
  return { r: rank, s, k, red, t: 'Le ' + rank, badge: '+' + rank, ...(n >= 10 ? BIG : SMALL), rule: `Avance de ${rank} trous.` };
}

/**
 * Couleur de chaque place, dans l'ordre des places du moteur (sens horaire, partenaire en face).
 * Reprend la maquette vue depuis la place 0 : Soleil = corail + jaune, Myrtilles = bleu + turquoise,
 * Framboises = rose + violet.
 */
export const SEAT_COLORS: Record<4 | 6, ColorName[]> = {
  4: ['coral', 'blue', 'yellow', 'teal'],
  6: ['coral', 'blue', 'rose', 'yellow', 'teal', 'violet'],
};
export const TEAM_NAMES = ['Soleil', 'Myrtilles', 'Framboises'];

export const EMOTES =['Allez, vas-y !', 'Oh là là !', 'Bien joué !', 'Aïe…', 'Mais non !', 'GG l’équipe', '🖕🏻', '❤️'];
