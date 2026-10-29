// Sons et vibrations du jeu : produits par le téléphone (Web Audio), sans fichier à télécharger.
// Les navigateurs n'autorisent le son qu'après un toucher : unlockAudio() au premier geste.
// Vibrations : Android seulement (l'iPhone ne les permet pas aux apps web).
import { h } from './dom';

export type Sfx = 'toc' | 'carte' | 'donne' | 'sortie' | 'maison' | 'echange' | 'boum' | 'tour' | 'victoire' | 'defaite';

const SOUND_KEY = 'toc.sons';
const BUZZ_KEY = 'toc.vibrations';
const pref = (k: string) => { try { return localStorage.getItem(k) !== '0'; } catch { return true; } };
const setPref = (k: string, on: boolean) => { try { localStorage.setItem(k, on ? '1' : '0'); } catch { /* sans stockage, réglage pour cette visite */ } };

export const soundOn = () => pref(SOUND_KEY);
export const buzzOn = () => pref(BUZZ_KEY);
export const canBuzz = () => typeof navigator.vibrate === 'function';

let ctx: AudioContext | null = null;

/** Au toucher : crée (ou réveille, après un passage en arrière-plan) le moteur de son. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* pas de son sur ce navigateur */ }
}

/** Une note : fréquence de départ (et d'arrivée), forme d'onde, volume, durée (s), départ (s après maintenant). */
function tone(f0: number, f1: number, type: OscillatorType, vol: number, dur: number, at = 0) {
  const c = ctx!, t = c.currentTime + at;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Un souffle filtré (cartes, choc) : bruit blanc passé dans un filtre. */
function noise(filter: BiquadFilterType, freq: number, vol: number, dur: number, at = 0) {
  const c = ctx!, t = c.currentTime + at;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = buf;
  f.type = filter;
  f.frequency.value = freq;
  g.gain.value = vol;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

export function sfx(s: Sfx) {
  if (!soundOn() || !ctx || ctx.state !== 'running') return;
  switch (s) {
    case 'toc': // bille qui saute d'un trou au suivant : petit claquement de bois
      tone(700 + Math.random() * 120, 380, 'triangle', 0.16, 0.06);
      noise('highpass', 2500, 0.05, 0.02);
      break;
    case 'carte':
      noise('bandpass', 2200, 0.16, 0.09);
      break;
    case 'donne':
      for (let k = 0; k < 4; k++) noise('bandpass', 2000 + k * 150, 0.12, 0.07, k * 0.09);
      break;
    case 'sortie':
      tone(420, 880, 'sine', 0.2, 0.18);
      break;
    case 'maison':
      [660, 880, 1320].forEach((f, k) => tone(f, f, 'sine', 0.16, 0.16, k * 0.09));
      break;
    case 'echange':
      tone(520, 780, 'triangle', 0.14, 0.12);
      tone(780, 520, 'triangle', 0.14, 0.12, 0.12);
      break;
    case 'boum':
      tone(170, 42, 'sine', 0.55, 0.4);
      noise('lowpass', 500, 0.35, 0.25);
      break;
    case 'tour':
      tone(880, 880, 'sine', 0.18, 0.14);
      tone(1175, 1175, 'sine', 0.18, 0.2, 0.13);
      break;
    case 'victoire':
      [523, 659, 784, 1047].forEach((f, k) => tone(f, f, 'triangle', 0.18, k === 3 ? 0.5 : 0.14, k * 0.12));
      break;
    case 'defaite':
      [392, 330, 262].forEach((f, k) => tone(f, f, 'triangle', 0.15, k === 2 ? 0.45 : 0.16, k * 0.16));
      break;
  }
}

/** Vibration (Android), si elle n'est pas coupée. */
export function buzz(pattern: number | number[]) {
  if (buzzOn() && canBuzz()) try { navigator.vibrate(pattern); } catch { /* refusée : rien à faire */ }
}

/** Interrupteurs « Sons » et « Vibrations » (pause du jeu, Ton compte). */
export function soundSettings(): HTMLElement {
  const row = (label: string, sub: string, on: boolean, set: (v: boolean) => void) => {
    const sw = h('input', { type: 'checkbox', class: 'switch', role: 'switch', checked: on, 'aria-label': label }) as HTMLInputElement;
    sw.addEventListener('change', () => { set(sw.checked); if (sw.checked && label === 'Sons') { unlockAudio(); sfx('tour'); } });
    return h('label', { class: 'push-row' },
      h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 } }, h('b', null, label), h('span', { class: 'push-row__text' }, sub)), sw);
  };
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
    row('Sons', 'Billes, BOUM, ton tour…', soundOn(), (v) => setPref(SOUND_KEY, v)),
    canBuzz() && row('Vibrations', 'Ton tour, une bille renvoyée.', buzzOn(), (v) => { setPref(BUZZ_KEY, v); if (v) buzz(60); }));
}
