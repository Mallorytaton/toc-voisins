// Boutique : ce qu'on achète avec les pièces gagnées en partie (billes, effets de BOUM, cris, titres).
// Les achats et ce qu'on porte sont dans le profil, synchronisés avec le compte ; à table, chacun voit
// les billes et les effets des autres (rangés dans sa fiche de joueur de la salle).
import { draftProfile, getProfile, saveProfile } from './profile';

export type ShopKind = 'bille' | 'boom' | 'cri' | 'titre' | 'plateau';

export interface ShopItem {
  id: string;
  kind: ShopKind;
  name: string;
  price: number;
}

/** Ce que le joueur porte : une bille, un effet de BOUM, un cri et un titre. */
export interface Look {
  bille?: string;
  boom?: string;
  cri?: string;
  titre?: string;
  /** Plateau de jeu affiché sur son écran (parties à 4) */
  plateau?: string;
}

export const SHOP: ShopItem[] = [
  { id: 'classique', kind: 'bille', name: 'Classique', price: 0 },
  { id: 'rayee', kind: 'bille', name: 'Rayée', price: 300 },
  { id: 'pois', kind: 'bille', name: 'À pois', price: 300 },
  { id: 'cristal', kind: 'bille', name: 'Cristal', price: 800 },
  { id: 'lave', kind: 'bille', name: 'Lave', price: 900 },
  { id: 'or', kind: 'bille', name: 'Or', price: 1000 },
  { id: 'galaxie', kind: 'bille', name: 'Galaxie', price: 1200 },
  { id: 'confettis', kind: 'boom', name: 'Confettis', price: 0 },
  { id: 'coeurs', kind: 'boom', name: 'Cœurs', price: 400 },
  { id: 'artifice', kind: 'boom', name: 'Feu d’artifice', price: 400 },
  { id: 'eclair', kind: 'boom', name: 'Éclair', price: 500 },
  { id: 'peinture', kind: 'boom', name: 'Peinture', price: 600 },
  { id: 'boum', kind: 'cri', name: 'BOUM !', price: 0 },
  { id: 'paf', kind: 'cri', name: 'PAF !', price: 150 },
  { id: 'kaboom', kind: 'cri', name: 'KABOOM !', price: 150 },
  { id: 'splash', kind: 'cri', name: 'SPLASH !', price: 150 },
  { id: 'aucun', kind: 'titre', name: 'Sans titre', price: 0 },
  { id: 'voisin', kind: 'titre', name: 'Bon voisin', price: 200 },
  { id: 'stratege', kind: 'titre', name: 'Stratège', price: 300 },
  { id: 'roi-boum', kind: 'titre', name: 'Roi du BOUM', price: 400 },
  { id: 'imbattable', kind: 'titre', name: 'Imbattable', price: 500 },
  { id: 'bois', kind: 'plateau', name: 'Bois clair', price: 0 },
  { id: 'peint', kind: 'plateau', name: 'Plateau peint', price: 5000 },
];

const DEFAULTS: Required<Look> = { bille: 'classique', boom: 'confettis', cri: 'boum', titre: 'aucun', plateau: 'bois' };

export const itemOf = (id: string | undefined) => SHOP.find((x) => x.id === id);
/** Ce que porte un joueur, avec les objets offerts par défaut. */
export const lookOf = (l: Look | undefined): Required<Look> => ({ ...DEFAULTS, ...(l ?? {}) });
/** Le cri du BOUM (« BOUM ! », « PAF ! »…). */
export const criOf = (l: Look | undefined) => itemOf(lookOf(l).cri)?.name ?? 'BOUM !';
/** Le titre affiché sous le nom ('' sans titre). */
export const titreOf = (l: Look | undefined) => { const t = lookOf(l).titre; return t === 'aucun' ? '' : itemOf(t)?.name ?? ''; };

export const owns = (id: string) => (itemOf(id)?.price === 0) || (draftProfile().owned ?? []).includes(id);
export const wears = (it: ShopItem) => lookOf(draftProfile().look)[it.kind] === it.id;

/** Achète un objet et le porte aussitôt. Renvoie false s'il manque des pièces. */
export function buy(it: ShopItem): boolean {
  const p = getProfile() ?? draftProfile();
  if (owns(it.id)) { wear(it); return true; }
  if (p.tokens < it.price) return false;
  saveProfile({ tokens: p.tokens - it.price, owned: [...(p.owned ?? []), it.id], look: { ...(p.look ?? {}), [it.kind]: it.id } });
  return true;
}

export function wear(it: ShopItem) {
  const p = getProfile() ?? draftProfile();
  saveProfile({ look: { ...(p.look ?? {}), [it.kind]: it.id } });
}
