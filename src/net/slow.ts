// Parties à ton rythme : la liste de l'accueil (myGames/<uid>/<code> = true), mise à jour en direct.
import { onValue, set } from 'firebase/database';
import { arr, ensureAuth, node } from './firebase';

export interface SlowGame {
  code: string;
  /** Nom du tournoi, ou « Avec Mimi et Coco » */
  title: string;
  /** mine : à toi de jouer ; theirs : au tour de `who` ; waiting : salle pas encore lancée ; over : terminée */
  status: 'mine' | 'theirs' | 'waiting' | 'over';
  who: string;
  /** Dernier coup (ms) */
  at: number;
}

const BOT = 'bot';
/** Une partie terminée reste deux jours dans la liste. */
const OVER_SHOWN_MS = 2 * 86_400_000;

interface RawRoom {
  meta?: { status?: string; title?: string; n?: number; slow?: boolean };
  players?: Record<string, { name?: string }>;
  seats?: unknown;
  state?: { phase?: string; turn?: number; exchange?: unknown; winner?: number };
  turnAt?: number;
}

function view(code: string, raw: RawRoom | null, me: string): SlowGame | null {
  if (!raw?.meta) return null;
  const n = raw.meta.n === 6 ? 6 : 4;
  const seats = arr<string>(raw.seats, n, () => '');
  const name = (u: string) => (u === BOT ? 'Robot' : raw.players?.[u]?.name ?? '…');
  const others = [...new Set(seats.filter((u) => u && u !== me && u !== BOT))].map(name);
  const title = raw.meta.title ?? (others.length ? 'Avec ' + others.join(', ').replace(/, ([^,]*)$/, ' et $1') : `Salle TOC-${code}`);
  const at = raw.turnAt ?? 0;
  const st = raw.state;
  if (raw.meta.status !== 'playing' || !st) return { code, title, status: 'waiting', who: '', at };
  if (st.phase === 'over') return { code, title, status: 'over', who: '', at };
  const mySeat = seats.indexOf(me);
  if (st.phase === 'exchange') {
    const ex = arr<string>(st.exchange, n, () => '');
    return { code, title, status: mySeat >= 0 && !ex[mySeat] ? 'mine' : 'theirs', who: '', at };
  }
  const turn = st.turn ?? 0;
  return { code, title, status: seats[turn] === me ? 'mine' : 'theirs', who: name(seats[turn]), at };
}

export function watchMyGames(cb: (list: SlowGame[]) => void): () => void {
  const per = new Map<string, () => void>();
  const data = new Map<string, SlowGame>();
  let off = () => {};
  const emit = () => cb([...data.values()].sort((a, b) => Number(b.status === 'mine') - Number(a.status === 'mine') || b.at - a.at));
  void ensureAuth().catch(() => '').then((me) => {
    if (!me) return;
    off = onValue(node('myGames', me), (s) => {
      const codes = Object.keys(s.val() ?? {});
      for (const [c, stop] of per) if (!codes.includes(c)) { stop(); per.delete(c); data.delete(c); }
      for (const c of codes) {
        if (per.has(c)) continue;
        per.set(c, onValue(node('rooms', c), (r) => {
          const g = view(c, r.val(), me);
          // Salle effacée, ou partie finie depuis longtemps : elle sort de la liste.
          if (!g || (g.status === 'over' && g.at < Date.now() - OVER_SHOWN_MS)) {
            data.delete(c);
            set(node('myGames', me, c), null).catch(() => undefined);
          } else data.set(c, g);
          emit();
        }, () => { data.delete(c); emit(); }));
      }
      emit();
    });
  });
  return () => { off(); per.forEach((f) => f()); };
}
