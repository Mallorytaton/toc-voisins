// Le plateau en relief : quand on incline le téléphone, on regarde le plateau d'un peu plus à gauche, à droite, de plus
// haut ou de plus bas, comme un objet posé derrière une vitre. Ce fichier lit le capteur d'orientation et en tire le
// regard (de -1 à 1 sur chaque axe) ; l'écran de partie recalcule alors la perspective du plateau (src/ui/screens/game.ts).
// Le regard revient tout seul droit devant : la position de repos suit la façon dont on tient le téléphone.

/** L'inclinaison lue par le capteur, en degrés, dans le repère de l'écran : avant/arrière (beta) et gauche/droite (gamma). */
export interface Lean { beta: number; gamma: number }
/** La position de repos, qui rattrape lentement la tenue du téléphone (null : pas encore de mesure). */
export interface ReliefState { base: Lean | null }

/** Degrés d'inclinaison qui donnent l'effet complet */
const FULL = 14;
/** La position de repos rattrape la tenue du téléphone en quelques secondes : tenu immobile, le regard revient droit devant */
const REST_MS = 7000;
/** Au-delà, ce n'est plus un petit mouvement (téléphone posé, repris, retourné) : on repart de cette position */
const JUMP = 50;
/** En dessous, on ne bouge pas : les tremblements de la main et du capteur ne font pas frémir le plateau */
const DEAD = 0.035;
/** De -1 à 1, avec une zone morte autour de zéro (l'effet repart ensuite de zéro, sans à-coup). */
const clamp = (v: number) => {
  const a = Math.min(1, Math.abs(v));
  return a <= DEAD ? 0 : Math.sign(v) * (a - DEAD) / (1 - DEAD);
};

/**
 * Fait avancer le relief d'une mesure du capteur (dt : millisecondes depuis la précédente).
 * Renvoie d'où on regarde le plateau, de -1 à 1 : x positif, on le voit de la gauche (le bord droit du téléphone
 * s'éloigne) ; y positif, on le voit d'en dessous (le haut du téléphone s'éloigne).
 */
export function leanStep(s: ReliefState, now: Lean, dt: number): { state: ReliefState; x: number; y: number } {
  const b = s.base;
  if (!b || Math.abs(now.beta - b.beta) > JUMP || Math.abs(now.gamma - b.gamma) > JUMP) return { state: { base: { ...now } }, x: 0, y: 0 };
  const x = clamp((now.gamma - b.gamma) / FULL), y = clamp((b.beta - now.beta) / FULL);
  const k = 1 - Math.exp(-Math.max(0, dt) / REST_MS);
  return { state: { base: { beta: b.beta + (now.beta - b.beta) * k, gamma: b.gamma + (now.gamma - b.gamma) * k } }, x, y };
}

/** L'inclinaison du téléphone ramenée au repère de l'écran, tourné de `angle` degrés (0, 90, 180 ou 270). */
export function toScreen(beta: number, gamma: number, angle: number): Lean {
  return angle === 90 ? { beta: -gamma, gamma: beta } : angle === 270 ? { beta: gamma, gamma: -beta } : angle === 180 ? { beta: -beta, gamma: -gamma } : { beta, gamma };
}

// ---------- Le capteur et l'affichage ----------


const KEY = 'toc.relief';
type Asking = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied' | 'prompt'> };
/** Le choix du joueur dans la pause ('' : il n'a rien choisi, le relief marche là où le téléphone le permet d'office). */
function choice(): 'oui' | 'non' | '' {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'oui' || v === 'non' ? v : '';
  } catch {
    return '';
  }
}
export function setReliefPref(on: boolean) {
  try { localStorage.setItem(KEY, on ? 'oui' : 'non'); } catch { /* sans stockage : pour cette partie seulement */ }
}
/** Le capteur a déjà donné une vraie mesure : le téléphone laisse lire ses mouvements. */
let live = false;
/** Un téléphone ou une tablette qui sait dire comment on le tient (et dont le propriétaire ne veut pas moins d'animations). */
export const reliefAvailable = () => typeof DeviceOrientationEvent !== 'undefined' && matchMedia('(pointer: coarse)').matches
  && !matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Le relief est-il en marche ? Sans choix du joueur, oui dès que le capteur répond (sur iPhone, il faut d'abord l'activer). */
export const reliefOn = () => reliefAvailable() && (choice() === 'oui' || (choice() === '' && live));
/**
 * Demande l'accès au capteur. Certains téléphones (iPhone) ne le donnent qu'après un accord, demandé depuis un toucher ;
 * les autres répondent oui tout de suite. Renvoie false si l'accès est refusé, ou s'il faut un toucher pour le demander.
 */
export async function askRelief(): Promise<boolean> {
  // Le capteur répond déjà : rien à demander.
  if (live) return true;
  const ask = typeof DeviceOrientationEvent !== 'undefined' ? (DeviceOrientationEvent as Asking).requestPermission : undefined;
  if (typeof ask !== 'function') return true;
  try {
    // Seul un refus net compte. Certains navigateurs répondent « à demander » sans jamais rien demander, et envoient
    // quand même leurs mesures : les prendre pour un refus empêchait de rallumer le relief après l'avoir coupé.
    return (await ask.call(DeviceOrientationEvent)) !== 'denied';
  } catch {
    return false;
  }
}

/**
 * Branche le relief : `look(x, y)` reçoit le regard à chaque image où il change (0, 0 : droit devant).
 * `sync` relit le réglage du joueur ; `stop` débranche tout.
 */
export function relief(look: (x: number, y: number) => void): { sync: () => void; stop: () => void } {
  let state: ReliefState = { base: null };
  let tx = 0, ty = 0, cx = 0, cy = 0, last = 0, raf = 0, listening = false;
  let waiting: (() => void) | null = null;

  const paint = () => {
    raf = 0;
    cx += (tx - cx) * 0.14;
    cy += (ty - cy) * 0.14;
    if (Math.abs(tx) < 0.004 && Math.abs(ty) < 0.004 && Math.abs(cx) < 0.006 && Math.abs(cy) < 0.006) cx = cy = 0;
    look(cx, cy);
    if (Math.abs(tx - cx) > 0.003 || Math.abs(ty - cy) > 0.003) raf = requestAnimationFrame(paint);
  };
  const onLean = (e: DeviceOrientationEvent) => {
    if (e.beta === null || e.gamma === null) return;
    live = true;
    const now = performance.now(), dt = last ? Math.min(250, now - last) : 16;
    last = now;
    // L'app redressée (html[data-rot]) reste droite par rapport au téléphone : ses axes sont ceux du capteur.
    const angle = document.documentElement.dataset.rot ? 0 : (((screen.orientation?.angle ?? 0) % 360) + 360) % 360;
    const r = leanStep(state, toScreen(e.beta, e.gamma, angle), dt);
    state = r.state;
    tx = r.x;
    ty = r.y;
    if (!raf) raf = requestAnimationFrame(paint);
  };
  // De retour dans l'app, ou l'écran tourné : on repart de la tenue du moment.
  const reset = () => { state = { base: null }; };
  const unwait = () => {
    if (waiting) window.removeEventListener('pointerdown', waiting);
    waiting = null;
  };
  const listen = () => {
    if (listening) return;
    listening = true;
    window.addEventListener('deviceorientation', onLean);
    document.addEventListener('visibilitychange', reset);
    screen.orientation?.addEventListener?.('change', reset);
  };
  const unlisten = () => {
    unwait();
    if (!listening) return;
    listening = false;
    window.removeEventListener('deviceorientation', onLean);
    document.removeEventListener('visibilitychange', reset);
    screen.orientation?.removeEventListener?.('change', reset);
    cancelAnimationFrame(raf);
    raf = 0;
    tx = ty = cx = cy = last = 0;
    reset();
    look(0, 0);
  };
  const sync = () => {
    if (!reliefAvailable() || choice() === 'non') return unlisten();
    // On écoute toujours : un téléphone qui n'a pas donné son accord n'envoie simplement rien.
    listen();
    if (live || waiting) return;
    // Sans toucher, la demande passe sans rien afficher là où l'accord est d'office, et échoue sans bruit ailleurs.
    void askRelief().then((ok) => {
      // Le joueur a activé le relief et son téléphone redemande l'accord à chaque lancement : on le demande au premier toucher.
      if (ok || live || waiting || !listening || choice() !== 'oui') return;
      waiting = () => { waiting = null; void askRelief(); };
      window.addEventListener('pointerdown', waiting, { once: true });
    });
  };
  return { sync, stop: unlisten };
}
