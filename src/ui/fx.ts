// Effets de jeu : sons synthétisés (aucun fichier audio), vibrations et confettis.

let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem('toc.muted') === '1';
  } catch {
    return false;
  }
})();

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem('toc.muted', m ? '1' : '0');
  } catch {
    /* indisponible */
  }
}

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.15, slide = 0) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Petit choc de bois (bruit filtré). */
function knock(start = 0, pitch = 900, gain = 0.35) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const len = Math.floor(a.sampleRate * 0.06);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = pitch;
  f.Q.value = 3;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export const sfx = {
  tap: () => knock(0, 1800, 0.18),
  card: () => {
    knock(0, 2600, 0.12);
    tone(520, 0, 0.05, 'triangle', 0.04);
  },
  steps: (n: number, stepMs: number) => {
    for (let k = 0; k < Math.min(n, 13); k++) knock((k * stepMs) / 1000, 700 + (k % 2) * 120, 0.28);
  },
  capture: () => {
    tone(440, 0, 0.35, 'sawtooth', 0.06, 0.35);
    knock(0.02, 400, 0.4);
  },
  turn: () => {
    tone(660, 0, 0.18, 'sine', 0.12);
    tone(990, 0.12, 0.28, 'sine', 0.1);
  },
  home: () => [523, 659, 784].forEach((f, i) => tone(f, i * 0.08, 0.25, 'triangle', 0.09)),
  win: () => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, i * 0.12, 0.35, 'triangle', 0.1)),
  error: () => tone(220, 0, 0.18, 'square', 0.04),
};

export function haptic(pattern: number | number[] = 12) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* non supporté */
  }
}

/** Pluie de confettis plein écran. */
export function confetti(colors: string[], ms = 3200) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  const dpr = Math.min(2, devicePixelRatio || 1);
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  document.body.append(c);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const parts = Array.from({ length: 140 }, () => ({
    x: Math.random() * innerWidth,
    y: -20 - Math.random() * innerHeight * 0.5,
    vx: (Math.random() - 0.5) * 2.5,
    vy: 2 + Math.random() * 3,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    w: 6 + Math.random() * 6,
    h: 8 + Math.random() * 8,
    col: colors[Math.floor(Math.random() * colors.length)],
  }));
  const t0 = performance.now();
  const frame = (t: number) => {
    g.clearRect(0, 0, innerWidth, innerHeight);
    const fade = Math.max(0, 1 - (t - t0 - ms * 0.7) / (ms * 0.3));
    g.globalAlpha = fade;
    for (const p of parts) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.04;
      p.r += p.vr;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.r);
      g.fillStyle = p.col;
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
      g.restore();
    }
    if (t - t0 < ms) requestAnimationFrame(frame);
    else c.remove();
  };
  requestAnimationFrame(frame);
}
