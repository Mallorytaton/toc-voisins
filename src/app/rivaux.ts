// Les rivalités, tenues sur ce téléphone : qui a renvoyé tes billes à la réserve, et à qui tu l'as rendu.
// Elles nourrissent l'« ennemi juré » de ta fiche de héros, le « Précédemment… » de l'affiche et ce que Toc raconte.
// Rien ne part en ligne : c'est la mémoire de tes parties jouées sur cet appareil.
import type { CharId, ColorName } from '../ui/kit/data';

export interface Rival {
  name: string;
  char: CharId;
  color: ColorName;
  bot: boolean;
  /** Billes à lui que tu as renvoyées */
  by: number;
  /** Billes à toi qu'il a renvoyées */
  on: number;
  /** Dernier renvoi subi (ms), et combien ce jour-là */
  at: number;
  dayOn: number;
}

const KEY = 'toc.rivaux';
const MAX = 40;
const dayOf = (t: number) => new Date(t).toDateString();

function load(): Record<string, Rival> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function save(all: Record<string, Rival>) {
  // On garde les rivalités les plus vivantes : la liste ne grossit pas sans fin.
  const kept = Object.entries(all).sort((a, b) => (b[1].by + b[1].on) - (a[1].by + a[1].on)).slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept))); } catch { /* sans stockage : pas de mémoire des rivalités */ }
}

/** Note un renvoi : 'by' tu as renvoyé une bille de ce joueur ; 'on' il a renvoyé une des tiennes. */
export function noteCapture(who: { name: string; char: CharId; color: ColorName; bot: boolean }, dir: 'by' | 'on', now = Date.now()) {
  const all = load(), k = who.name.trim().toLowerCase();
  if (!k) return;
  const prev: Partial<Rival> = all[k] ?? {};
  const r: Rival = { name: who.name, char: who.char, color: who.color, bot: who.bot, by: prev.by ?? 0, on: prev.on ?? 0, at: prev.at ?? 0, dayOn: prev.dayOn ?? 0 };
  if (dir === 'by') r.by++;
  else {
    r.dayOn = dayOf(r.at) === dayOf(now) ? r.dayOn + 1 : 1;
    r.at = now;
    r.on++;
  }
  all[k] = r;
  save(all);
}

/** La rivalité avec ce joueur (par son nom), s'il y en a une. */
export function rivalOf(name: string): Rival | null {
  return load()[name.trim().toLowerCase()] ?? null;
}

/** Ton ennemi juré : celui qui a renvoyé le plus de tes billes (un vrai joueur plutôt qu'un robot, à partir de 3 renvois). */
export function nemesis(): Rival | null {
  const all = Object.values(load()).filter((r) => r.on >= 3).sort((a, b) => b.on - a.on || b.by - a.by);
  return all.find((r) => !r.bot) ?? all[0] ?? null;
}

/** « Jeudi dernier », « Hier », « Tout à l'heure » : quand ce rival t'a renvoyé pour la dernière fois. */
export function lastTime(r: Rival, now = Date.now()): string {
  const days = Math.round((new Date(dayOf(now)).getTime() - new Date(dayOf(r.at)).getTime()) / 86_400_000);
  if (days <= 0) return 'Tout à l’heure';
  if (days === 1) return 'Hier';
  if (days < 7) { const d = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' }).format(r.at); return d.charAt(0).toUpperCase() + d.slice(1) + ' dernier'; }
  return 'La dernière fois';
}
