// Profil du joueur. Gardé sur l'appareil ; synchronisé avec Firebase à l'étape « comptes ».
import type { CharId, ColorName } from '../ui/kit/data';

export interface Profile {
  nick: string;
  char: CharId;
  color: ColorName;
  /** Ancien champ : le niveau se calcule maintenant à partir de l'XP (levelOf). */
  level: number;
  /** XP totale depuis le début */
  xp: number;
  tokens: number;
  /** Points de classement */
  points?: number;
  /** Ville affichée au classement (qc : ancien champ, plus utilisé) */
  city?: string;
  qc?: boolean;
  /** Partenaire de la dernière partie en ligne (chat d'équipe). */
  partner?: { uid: string; name: string; char: CharId; color: ColorName };
  /** Code ami (ex. FREDO#2741), créé une fois pour toutes. */
  friendCode?: string;
}

const KEY = 'toc.profile';
export const XP_PER_LEVEL = 1000;
/** Niveau et XP dans le niveau en cours. */
export const levelOf = (xp: number) => ({ level: 1 + Math.floor(xp / XP_PER_LEVEL), inLevel: xp % XP_PER_LEVEL });
export const NICK_MAX = 14;

let current: Profile | null = load();

function load(): Profile | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

/** Profil enregistré, ou null tant que le joueur n'a pas choisi son perso. */
export function getProfile(): Profile | null {
  return current;
}

/** Profil à afficher (valeurs par défaut pendant l'accueil). */
export function draftProfile(): Profile {
  return current ?? { nick: '', char: 'tuque', color: 'coral', level: 1, xp: 0, tokens: 0 };
}

function makeFriendCode(nick: string) {
  const base = nick.normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 8) || 'JOUEUR';
  return `${base}#${1000 + Math.floor(Math.random() * 9000)}`;
}

export function saveProfile(p: Partial<Profile>) {
  current = { ...draftProfile(), ...p };
  current.nick = current.nick.trim().slice(0, NICK_MAX) || 'Toi';
  if (!current.friendCode) current.friendCode = makeFriendCode(current.nick);
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Stockage indisponible (navigation privée) : le profil reste en mémoire.
  }
  return current;
}
