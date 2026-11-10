// Sons, musique et vibrations du jeu : produits par le téléphone (Web Audio), sans fichier à télécharger.
// Les navigateurs n'autorisent le son qu'après un toucher : unlockAudio() au premier geste.
// Vibrations : Android seulement (l'iPhone ne les permet pas aux apps web).
import { h } from './dom';

export type Sfx = 'toc' | 'carte' | 'donne' | 'sortie' | 'maison' | 'echange' | 'elan' | 'boum' | 'roule' | 'moment' | 'tour' | 'victoire' | 'defaite';

const SOUND_KEY = 'toc.sons';
const MUSIC_KEY = 'toc.musique';
const BUZZ_KEY = 'toc.vibrations';
const pref = (k: string) => { try { return localStorage.getItem(k) !== '0'; } catch { return true; } };
const setPref = (k: string, on: boolean) => { try { localStorage.setItem(k, on ? '1' : '0'); } catch { /* sans stockage, réglage pour cette visite */ } };

export const soundOn = () => pref(SOUND_KEY);
export const musicOn = () => pref(MUSIC_KEY);
export const buzzOn = () => pref(BUZZ_KEY);
export const canBuzz = () => typeof navigator.vibrate === 'function';

let ctx: AudioContext | null = null;
/** Le moteur n'a pas voulu repartir après un toucher : on en crée un neuf au toucher suivant. */
let stuck = false;
let check = 0;

/**
 * Au toucher : crée (ou réveille) le moteur de son. Après un passage en arrière-plan, l'iPhone le laisse
 * « interrompu » (et pas seulement « en pause ») : on le relance quel que soit son état, avec un son muet
 * joué pendant le toucher, et s'il reste bloqué on le remplace par un neuf.
 */
export function unlockAudio() {
  try {
    if (ctx && (stuck || ctx.state === 'closed')) {
      ctx.close().catch(() => undefined);
      ctx = null;
      stuck = false;
    }
    ctx ??= new AudioContext();
    if (ctx.state === 'running') return;
    const c = ctx;
    c.resume().catch(() => undefined);
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, 22050);
    src.connect(c.destination);
    src.start(0);
    clearTimeout(check);
    check = window.setTimeout(() => { if (ctx === c && c.state !== 'running') stuck = true; }, 800);
  } catch { /* pas de son sur ce navigateur */ }
}

// Retour dans l'app : on tente de relancer le son tout de suite (sinon le prochain toucher s'en charge).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running') ctx.resume().catch(() => undefined);
});

// ---------- Sortie commune ----------
// Tous les sons passent par un limiteur (rien ne sature), avec un peu de réverbération : la pièce autour de la table.
interface Graph { c: AudioContext; dry: GainNode; wet: GainNode; music: GainNode; noise: AudioBuffer }
let graph: Graph | null = null;
/** Volume de la musique demandé en dernier (-1 : moteur neuf, rien de demandé). */
let musicTarget = -1;

function out(): Graph {
  const c = ctx!;
  if (graph && graph.c === c) return graph;
  musicTarget = -1;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 5;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;
  comp.connect(c.destination);
  const dry = c.createGain();
  dry.connect(comp);
  // Réverbération : une réponse fabriquée sur place (bruit qui s'éteint), assourdie comme dans un salon.
  const len = Math.ceil(c.sampleRate * 1.1), ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  const conv = c.createConvolver(), damp = c.createBiquadFilter(), wetOut = c.createGain(), wet = c.createGain();
  conv.buffer = ir;
  damp.type = 'lowpass';
  damp.frequency.value = 3200;
  wetOut.gain.value = 0.5;
  wet.connect(conv).connect(damp).connect(wetOut).connect(comp);
  const music = c.createGain(), musicRev = c.createGain();
  music.gain.value = 0;
  musicRev.gain.value = 0.5;
  music.connect(comp);
  music.connect(musicRev).connect(wet);
  const noise = c.createBuffer(1, c.sampleRate, c.sampleRate), nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  return (graph = { c, dry, wet, music, noise });
}

/** at : départ (s après maintenant) ; rev : part envoyée dans la réverbération ; to : autre sortie (la musique). */
interface Opt { at?: number; rev?: number; to?: AudioNode }
function route(g: GainNode, o: Opt) {
  const G = out();
  if (o.to) { g.connect(o.to); return; }
  g.connect(G.dry);
  if (o.rev) {
    const s = G.c.createGain();
    s.gain.value = o.rev;
    g.connect(s).connect(G.wet);
  }
}

/** Une note : fréquence de départ (et d'arrivée), forme d'onde, volume, durée (s). */
function tone(f0: number, f1: number, type: OscillatorType, vol: number, dur: number, o: Opt = {}) {
  const c = ctx!, t = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  route(g, o);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

/** Un souffle filtré (cartes, choc, élan) : bruit passé dans un filtre dont la fréquence peut glisser. */
function noise(filter: BiquadFilterType, f0: number, f1: number, vol: number, dur: number, o: Opt & { q?: number; swell?: boolean } = {}) {
  const G = out(), c = G.c, t = c.currentTime + (o.at ?? 0);
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = G.noise;
  src.loop = true;
  f.type = filter;
  f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  // swell : le souffle enfle jusqu'à la fin (l'élan avant un choc) ; sinon il claque puis s'éteint.
  g.gain.exponentialRampToValueAtTime(vol, t + (o.swell ? dur * 0.92 : 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g);
  route(g, o);
  src.start(t, Math.random() * 0.8);
  src.stop(t + dur + 0.03);
}

/** Bois frappé (bille dans son trou, lame de marimba) : trois résonances qui s'éteignent vite, plus le claquement. */
function wood(f: number, vol: number, dur: number, o: Opt & { click?: number } = {}) {
  tone(f, f * 0.985, 'sine', vol, dur, o);
  tone(f * 2.76, f * 2.74, 'sine', vol * 0.42, dur * 0.5, o);
  tone(f * 5.4, f * 5.4, 'sine', vol * 0.18, dur * 0.28, o);
  if (o.click) noise('bandpass', 3200, 3200, o.click, 0.018, { at: o.at, q: 0.8, to: o.to });
}

/** Clochette (maison, victoire) : son clair qui résonne. */
function bell(f: number, vol: number, dur: number, o: Opt = {}) {
  tone(f, f, 'sine', vol, dur, o);
  tone(f * 2, f * 2, 'sine', vol * 0.35, dur * 0.6, o);
  tone(f * 3.01, f * 3.01, 'sine', vol * 0.14, dur * 0.35, o);
}

const semi = (n: number) => Math.pow(2, n / 12);
// Gamme des pas : chaque saut monte d'un cran, une longue avance devient une petite mélodie.
const STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];

/** n : rang du saut pour 'toc' (la note monte à chaque trou). */
export function sfx(s: Sfx, n = 0) {
  if (!soundOn() || !ctx || ctx.state !== 'running') return;
  switch (s) {
    case 'toc': // bille qui tombe dans le trou suivant
      wood(392 * semi(STEPS[Math.max(0, Math.min(n, STEPS.length - 1))]) * (1 + (Math.random() - 0.5) * 0.012), 0.2, 0.11, { rev: 0.25, click: 0.07 });
      break;
    case 'carte': // la carte fend l'air puis claque sur la pile
      noise('bandpass', 900, 3600, 0.13, 0.2, { q: 1.4 });
      noise('highpass', 1800, 1800, 0.16, 0.035, { at: 0.42 });
      tone(170, 90, 'sine', 0.2, 0.07, { at: 0.42 });
      break;
    case 'donne':
      for (let k = 0; k < 5; k++) {
        noise('bandpass', 1500 + k * 180, 3200, 0.12, 0.07, { at: k * 0.085, q: 1.6 });
        noise('highpass', 2400, 2400, 0.06, 0.02, { at: k * 0.085 + 0.06 });
      }
      break;
    case 'sortie':
      [0, 4, 7, 12].forEach((d, k) => wood(523 * semi(d), 0.2, 0.22, { at: k * 0.07, rev: 0.4, click: k ? 0 : 0.06 }));
      break;
    case 'maison':
      [0, 4, 7, 12, 16].forEach((d, k) => bell(659 * semi(d), 0.13, 0.7, { at: k * 0.08, rev: 0.6 }));
      break;
    case 'echange':
      noise('bandpass', 500, 3000, 0.14, 0.3, { q: 3 });
      noise('bandpass', 3000, 500, 0.14, 0.3, { at: 0.16, q: 3 });
      wood(587, 0.14, 0.16, { at: 0.5, rev: 0.4 });
      wood(880, 0.14, 0.16, { at: 0.58, rev: 0.4 });
      break;
    case 'elan': // juste avant un choc : le souffle monte
      noise('bandpass', 300, 2600, 0.16, 0.5, { q: 2.5, swell: true, rev: 0.3 });
      tone(110, 330, 'sine', 0.12, 0.5);
      break;
    case 'boum': // le choc : claquement sec, coup sourd, grondement, puis des éclats de bois
      noise('highpass', 2600, 2600, 0.4, 0.03);
      tone(190, 36, 'sine', 0.8, 0.55, { rev: 0.2 });
      tone(95, 30, 'triangle', 0.4, 0.4);
      noise('lowpass', 1400, 120, 0.5, 0.45, { rev: 0.5 });
      for (let k = 0; k < 4; k++) wood(300 + Math.random() * 500, 0.1, 0.09, { at: 0.12 + k * 0.07 + Math.random() * 0.03, rev: 0.5, click: 0.04 });
      break;
    case 'roule': // la bille renvoyée retombe dans sa réserve et rebondit
      wood(330, 0.22, 0.12, { rev: 0.35, click: 0.08 });
      wood(300, 0.1, 0.08, { at: 0.13, rev: 0.35, click: 0.04 });
      wood(290, 0.05, 0.06, { at: 0.22, click: 0.02 });
      break;
    case 'moment': // un moment fort (vengeance, doublé…) : deux accords qui claquent
      [[0, 7, 12], [5, 12, 17]].forEach((ch, k) => ch.forEach((d) => {
        tone(261.6 * semi(d), 261.6 * semi(d), 'sawtooth', 0.05, k ? 0.6 : 0.16, { at: k * 0.17, rev: 0.5 });
        bell(523.2 * semi(d), 0.06, k ? 0.7 : 0.2, { at: k * 0.17, rev: 0.5 });
      }));
      noise('highpass', 5000, 9000, 0.05, 0.5, { at: 0.17, rev: 0.4 });
      break;
    case 'tour':
      wood(784, 0.2, 0.2, { rev: 0.4 });
      wood(1047, 0.2, 0.32, { at: 0.13, rev: 0.5 });
      break;
    case 'victoire':
      [0, 4, 7, 12, 16, 19, 24].forEach((d, k) => bell(523 * semi(d), 0.13, k === 6 ? 1.4 : 0.35, { at: k * 0.1, rev: 0.6 }));
      [0, 7, 12, 16].forEach((d) => tone(130.8 * semi(d), 130.8 * semi(d), 'triangle', 0.1, 1.3, { at: 0.6, rev: 0.4 }));
      noise('highpass', 5000, 10000, 0.05, 1.1, { at: 0.6, rev: 0.5 });
      break;
    case 'defaite':
      [7, 3, 0, -5].forEach((d, k) => wood(392 * semi(d), 0.18, k === 3 ? 0.7 : 0.26, { at: k * 0.2, rev: 0.6 }));
      break;
  }
}

// ---------- Musique de table ----------
// Une petite boucle jouée par le téléphone, qui s'étoffe quand la partie se tend : marimba seul, puis basse,
// puis mélodie et shaker, puis un cœur qui bat quand une équipe n'a plus qu'une bille à rentrer.
// Elle est calée sur l'heure : les téléphones posés autour de la même table jouent la même mesure au même moment.
const STEP_MS = 165; // une double croche (environ 91 à la noire)
const MUSIC_VOL = 0.16;
const C4 = 261.63;
const CHORDS = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]]; // Do, La mineur, Fa, Sol : une mesure chacun
const ARP = [0, -1, 1, -1, 2, -1, 1, -1, 0, -1, 2, -1, 1, -1, 2, -1];
const MELODY = [
  12, -1, 16, -1, 19, 16, -1, 12, 14, -1, 12, -1, 16, -1, -1, -1,
  12, -1, 16, -1, 21, 16, -1, 12, 9, -1, 12, -1, 16, -1, -1, -1,
  12, -1, 17, -1, 21, 17, -1, 12, 9, -1, 12, -1, 17, -1, -1, -1,
  14, -1, 19, -1, 23, 19, -1, 14, 11, -1, 14, -1, 19, -1, 17, 14,
];
let playing = false;
let tension = 0;
let ticker = 0;
let nextStep = 0;

function musicStep(n: number, at: number) {
  const o = { at, to: out().music as AudioNode };
  const pos = ((n % 64) + 64) % 64, beat = pos % 16, ch = CHORDS[pos >> 4];
  // Marimba : l'accord égrené, toujours là.
  if (ARP[beat] >= 0) wood(C4 * semi(ch[ARP[beat]]), beat === 0 ? 0.5 : 0.32, 0.3, o);
  if (tension >= 1 && (beat === 0 || beat === 8 || beat === 11)) {
    const f = (C4 / 4) * semi(ch[0] + 12);
    tone(f, f, 'triangle', 0.5, 0.36, o);
  }
  if (tension >= 2) {
    if (beat % 2 === 0) noise('highpass', 6500, 6500, beat % 4 === 2 ? 0.14 : 0.07, 0.04, o);
    if (MELODY[pos] >= 0) bell(C4 * semi(MELODY[pos]), 0.16, 0.4, o);
  }
  // Le cœur : deux coups sourds, deux fois par mesure.
  if (tension >= 3 && (beat === 0 || beat === 3 || beat === 8 || beat === 11)) tone(92, 40, 'sine', beat % 8 === 0 ? 0.9 : 0.6, 0.2, o);
}

function musicGain(v: number, secs: number) {
  if (!ctx || ctx.state !== 'running') return;
  const g = out().music.gain, t = ctx.currentTime;
  if (v === musicTarget) return;
  musicTarget = v;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(v, t + secs);
}

function tick() {
  if (!ctx || ctx.state !== 'running' || document.hidden) return;
  if (!playing || !soundOn() || !musicOn()) { musicGain(0, 0.5); return; }
  musicGain(MUSIC_VOL, 1.5);
  const now = Date.now(), cur = Math.floor(now / STEP_MS);
  // Retard (app en arrière-plan, moteur relancé) : on reprend à la mesure en cours, sans rattraper.
  if (nextStep < cur + 1 || nextStep > cur + 8) nextStep = cur + 1;
  while (nextStep * STEP_MS < now + 260) {
    musicStep(nextStep, Math.max(0, (nextStep * STEP_MS - now) / 1000));
    nextStep++;
  }
}

/** Lance la musique de la partie, ou l'arrête en douceur. Muette tant que « Sons » ou « Musique » est éteint. */
export function music(on: boolean) {
  playing = on;
  clearInterval(ticker);
  if (on) ticker = window.setInterval(tick, 80);
  else tick();
}

/** Tension de la partie, de 0 (début tranquille) à 3 (une équipe n'a plus qu'une bille à rentrer). */
export function musicTension(level: number) { tension = Math.max(0, Math.min(3, level)); }

/** Vibration (Android), si elle n'est pas coupée. */
export function buzz(pattern: number | number[]) {
  if (buzzOn() && canBuzz()) try { navigator.vibrate(pattern); } catch { /* refusée : rien à faire */ }
}

/** Interrupteurs « Sons », « Musique » et « Vibrations » (pause du jeu, Ton compte). */
export function soundSettings(): HTMLElement {
  const row = (label: string, sub: string, on: boolean, set: (v: boolean) => void) => {
    const sw = h('input', { type: 'checkbox', class: 'switch', role: 'switch', checked: on, 'aria-label': label }) as HTMLInputElement;
    sw.addEventListener('change', () => { set(sw.checked); if (sw.checked && label === 'Sons') { unlockAudio(); sfx('tour'); } });
    return h('label', { class: 'push-row' },
      h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 } }, h('b', null, label), h('span', { class: 'push-row__text' }, sub)), sw);
  };
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
    row('Sons', 'Billes, cartes, BOUM, ton tour…', soundOn(), (v) => setPref(SOUND_KEY, v)),
    row('Musique', 'Pendant la partie, elle monte avec la tension.', musicOn(), (v) => setPref(MUSIC_KEY, v)),
    canBuzz() && row('Vibrations', 'Ton tour, une bille renvoyée.', buzzOn(), (v) => { setPref(BUZZ_KEY, v); if (v) buzz(60); }));
}
