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

export const COL: Record<ColorName, Tint> = {
  coral: { c: '#ff6b4a', d: '#d9482a', l: '#ffe3da' },
  blue: { c: '#4a7dff', d: '#2f5bd6', l: '#dfe7ff' },
  yellow: { c: '#ffc93c', d: '#d9a116', l: '#fff1c9' },
  teal: { c: '#2ec4a0', d: '#1d9c7e', l: '#d4f4eb' },
  violet: { c: '#9b7bff', d: '#7656e0', l: '#ece6ff' },
  rose: { c: '#ff6fae', d: '#d94b8a', l: '#ffe2ef' },
};

export const COLOR_NAMES: ColorName[] = ['coral', 'blue', 'yellow', 'teal', 'violet', 'rose'];

/** Les avatars utilisent des nuances un peu plus claires que les billes. */
export const AV_COL: Record<ColorName, [string, string]> = {
  coral: ['#ff7a5c', '#e0532f'],
  blue: ['#5b8aff', '#3b64dc'],
  yellow: ['#ffcd4a', '#e0a51b'],
  teal: ['#3ccdaa', '#21a283'],
  violet: ['#a68aff', '#7f62e6'],
  rose: ['#ff7db6', '#de5592'],
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
const OUT = { bg: '#d4f4eb', bc: '#16705a' };
const BACK = { bg: '#dfe7ff', bc: '#2f5bd6' };
const SPLIT = { bg: '#fff1c9', bc: '#8a5f00' };
const SWAP = { bg: '#ece6ff', bc: '#6a4bd8' };
const BIG = { bg: '#ffe3da', bc: '#c9401f' };
const SMALL = { bg: '#ecebf3', bc: '#4a4860' };
const JOKER = { bg: '#ffe2ef', bc: '#d94b8a' };

export interface CardOptions {
  /** Variante « Valet = 11 » */
  jackEleven?: boolean;
  /** Variante « 5 pour un autre joueur » */
  fiveOthers?: boolean;
}

/** Apparence d'une carte du moteur ("KH0", "10S1", "XJ3"). */
export function cardLook(card: string, o: CardOptions = {}): CardLook {
  const rank = card.slice(0, -2);
  const suitKey = card[card.length - 2];
  const s = SUIT[suitKey] ?? '★';
  const red = suitKey === 'H' || suitKey === 'D';
  const n = Number(rank);
  switch (rank) {
    case 'A':
      return { r: 'A', s, red, t: 'As', badge: 'Sortir', ...OUT, rule: 'Sors un pion de ta réserve, ou avance de 1.' };
    case 'K':
      return { r: 'R', s, red, t: 'Roi', badge: 'Sortir', ...OUT, rule: 'Sors un pion de ta réserve, ou avance de 13.' };
    case 'Q':
      return { r: 'D', s, red, t: 'Dame', badge: '+12', ...BIG, rule: 'Avance de 12 cases.' };
    case 'J':
      return o.jackEleven
        ? { r: 'V', s, red, t: 'Valet', badge: '+11', ...BIG, rule: 'Avance de 11 cases.' }
        : { r: 'V', s, red, t: 'Valet', badge: 'Échange', ...SWAP, rule: 'Échange un de tes pions avec un autre pion du circuit.' };
    case '4':
      return { r: '4', s, red, t: 'Le 4', badge: 'Recule 4', ...BACK, rule: 'Recule de 4 cases. Le raccourci des pros.' };
    case '7':
      return { r: '7', s, red, t: 'Le 7', badge: 'Divise', ...SPLIT, rule: 'Avance de 7, ou partage les 7 entre tes pions.' };
    case 'X':
      return { r: '★', s: '★', red: false, t: 'Joker', badge: 'Joker', ...JOKER, rule: 'Joue-la comme n’importe quelle carte.' };
    case '5':
      if (o.fiveOthers) return { r: '5', s, red, t: 'Le 5', badge: 'Pousse 5', ...BACK, rule: 'Fais avancer de 5 le pion d’un autre joueur.' };
  }
  return { r: rank, s, red, t: 'Le ' + rank, badge: '+' + rank, ...(n >= 10 ? BIG : SMALL), rule: `Avance de ${rank} cases.` };
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

export const EMOTES =['Allez, vas-y !', 'Oh là là !', 'Bien joué !', 'Aïe…', 'Mais non !', 'GG l’équipe'];
