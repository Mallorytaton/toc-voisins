// Modèle de salle privée commun à la salle locale (démo) et à la salle en ligne (Firebase).
import { DEMO, DEMO_GUESTS } from '../ui/demo';
import { type CharId, type ColorName, SEAT_COLORS } from '../ui/kit/data';
import { DEFAULT_VARIANTS, type Variants } from '../engine';
import { draftProfile } from './profile';

export interface RoomPlayer {
  name: string;
  char: CharId;
  color: ColorName;
  host: boolean;
  bot?: boolean;
  /** Connecté (en ligne) ; toujours vrai pour un robot. */
  online?: boolean;
}

export interface RoomSnapshot {
  code: string;
  n: 4 | 6;
  /** Une entrée par place du moteur (sens horaire) ; null = place libre. */
  seats: (RoomPlayer | null)[];
  mySeat: number;
  status: 'waiting' | 'countdown' | 'playing';
  /** Partie de tournoi : son nom. */
  title?: string;
  /** Règles de la partie (variantes). */
  variants: Variants;
  /** Partie à ton rythme : pas de minuteur, on attend les absents (plusieurs jours). */
  slow?: boolean;
}

export interface Room {
  snapshot(): RoomSnapshot;
  subscribe(cb: () => void): () => void;
  /** Lien d'invitation à partager. */
  link(): string;
  launch(): void;
  /** Remplit les places libres avec des robots (hôte seulement). */
  fillBots?(): void;
  /** Reprend la place d'un joueur déconnecté pendant une partie. */
  takeSeat?(seat: number): Promise<void>;
  /** L'hôte choisit les règles avant de lancer. */
  setVariants?(v: Variants): void;
  /** L'hôte choisit le rythme (en ligne seulement) : en direct ou à ton rythme. */
  setSlow?(on: boolean): void;
  leave(): void;
}

export function inviteLink(code: string) {
  return `${location.origin}${location.pathname}?g=${code}`;
}

/** Salle sur l'appareil : l'hôte seul, rejoint par des joueurs fictifs en démo. */
export class LocalRoom implements Room {
  private s: RoomSnapshot;
  private subs = new Set<() => void>();
  private timers: number[] = [];

  constructor(n: 4 | 6, code = String(1000 + Math.floor(Math.random() * 9000))) {
    const p = draftProfile();
    const seats: (RoomPlayer | null)[] = Array(n).fill(null);
    seats[0] = { name: p.nick || 'Toi', char: p.char, color: p.color, host: true };
    this.s = { code, n, seats, mySeat: 0, status: 'waiting', variants: { ...DEFAULT_VARIANTS } };
    if (DEMO) {
      // Ordre d'arrivée de la maquette : le partenaire d'abord, puis les adversaires.
      const order = n === 4 ? [2, 3, 1] : [3, 4, 1, 5, 2];
      order.forEach((seat, i) =>
        this.timers.push(window.setTimeout(() => {
          this.s.seats[seat] = { ...DEMO_GUESTS[i], host: false };
          this.emit();
        }, 650 * (i + 1) + 350)));
    }
  }

  snapshot() {
    return this.s;
  }
  subscribe(cb: () => void) {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }
  link() {
    return inviteLink(this.s.code);
  }
  setVariants(v: Variants) {
    this.s.variants = v;
    this.emit();
  }
  fillBots() {
    const used = new Set(this.s.seats.map((x) => x?.name));
    const cast = DEMO_GUESTS.filter((gst) => !used.has(gst.name));
    // Chaque robot s'assoit de préférence à la place de sa couleur, comme dans la maquette.
    const take = (seat: number) => {
      const k = Math.max(0, cast.findIndex((gst) => gst.color === SEAT_COLORS[this.s.n][seat]));
      return cast.splice(k, 1)[0];
    };
    this.s.seats = this.s.seats.map((x, seat) => x ?? { ...take(seat), host: false, bot: true });
    this.emit();
  }
  launch() {
    if (this.s.seats.some((x) => !x) || this.s.status !== 'waiting') return;
    this.s.status = 'countdown';
    this.emit();
  }
  leave() {
    this.timers.forEach(clearTimeout);
    this.subs.clear();
  }
  private emit() {
    this.subs.forEach((cb) => cb());
  }
}
