// Carte de fin de partie à partager : une image dessinée sur le téléphone (résultat, équipe, chiffres, moments forts),
// envoyée par le menu de partage du téléphone, ou enregistrée quand il n'y en a pas.
import { type MascotMood, mascotSvg } from './mascot';

export interface ShareCard {
  won: boolean;
  /** Couleur de l'équipe gagnante, et sa version foncée */
  color: string;
  dark: string;
  kicker: string;
  title: string;
  /** Les deux joueurs de l'équipe gagnante */
  names: string[];
  /** Chiffres de la partie (« 4 BOUM », « 2 manches »…) */
  chips: string[];
  /** Phrases en plus (roi du BOUM, moments forts) */
  lines: string[];
  /** Message qui accompagne l'image */
  text: string;
}

const W = 1080, H = 1350;
const DISPLAY = '"Baloo 2 Variable", "Baloo 2", system-ui, sans-serif';
const TEXT = '"Nunito Variable", Nunito, system-ui, sans-serif';

const loadImage = (src: string) => new Promise<HTMLImageElement | null>((res) => {
  const img = new Image();
  img.onload = () => res(img);
  img.onerror = () => res(null);
  img.src = src;
});

function pill(x: CanvasRenderingContext2D, cx: number, y: number, h: number, text: string, bg: string, fg: string, font: string) {
  x.font = font;
  const w = x.measureText(text).width + h * 0.9;
  x.fillStyle = bg;
  x.beginPath();
  x.roundRect(cx - w / 2, y, w, h, h / 2);
  x.fill();
  x.fillStyle = fg;
  x.fillText(text, cx, y + h / 2 + 4);
  return w;
}

/** Dessine la carte et rend l'image (PNG), ou null si le téléphone ne sait pas la produire. */
export async function drawShareCard(o: ShareCard): Promise<Blob | null> {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const x = cv.getContext('2d');
  if (!x || !x.roundRect) return null;
  await Promise.all([document.fonts?.load(`800 100px ${DISPLAY}`), document.fonts?.load(`800 40px ${TEXT}`)]).catch(() => undefined);
  const mood: MascotMood = o.won ? 'vainqueur' : 'surpris';
  const toc = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(mascotSvg(mood).replace('<svg ', '<svg width="512" height="512" ')));

  // Fond aux couleurs de l'équipe gagnante, avec les rayons de l'écran de victoire.
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, o.won ? o.color : '#5b5975');
  bg.addColorStop(1, o.won ? o.dark : '#3a384f');
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(255,255,255,.1)';
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2;
    x.beginPath();
    x.moveTo(W / 2, 520);
    x.arc(W / 2, 520, 1500, a, a + Math.PI / 20);
    x.fill();
  }

  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = '#fff';
  x.font = `900 34px ${TEXT}`;
  x.letterSpacing = '6px';
  x.fillText(o.kicker.toUpperCase(), W / 2, 110);
  x.letterSpacing = '0px';
  x.font = `800 150px ${DISPLAY}`;
  x.fillStyle = 'rgba(0,0,0,.18)';
  x.fillText(o.title, W / 2, 232);
  x.fillStyle = '#fff';
  x.fillText(o.title, W / 2, 222);
  if (toc) x.drawImage(toc, W / 2 - 220, 300, 440, 440);
  pill(x, W / 2, 760, 84, o.names.join('  &  '), 'rgba(255,255,255,.22)', '#fff', `800 48px ${DISPLAY}`);

  // Carte blanche : les chiffres, puis les phrases.
  const lines = o.lines.slice(0, 3);
  const top = 890, ch = 150 + lines.length * 62 + (lines.length ? 16 : 0);
  x.fillStyle = 'rgba(0,0,0,.18)';
  x.beginPath();
  x.roundRect(70, top + 14, W - 140, ch, 54);
  x.fill();
  x.fillStyle = '#fff';
  x.beginPath();
  x.roundRect(70, top, W - 140, ch, 54);
  x.fill();
  const font = `900 34px ${TEXT}`;
  x.font = font;
  const widths = o.chips.map((t) => x.measureText(t).width + 66), gap = 16;
  let cx = W / 2 - (widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1)) / 2;
  o.chips.forEach((t, i) => {
    pill(x, cx + widths[i] / 2, top + 40, 72, t, '#fff1c9', '#8a6510', font);
    cx += widths[i] + gap;
  });
  x.fillStyle = '#2b2a3d';
  x.font = `800 40px ${DISPLAY}`;
  lines.forEach((t, i) => x.fillText(t, W / 2, top + 172 + i * 62, W - 220));

  x.fillStyle = 'rgba(255,255,255,.9)';
  x.font = `800 44px ${DISPLAY}`;
  x.fillText('TOC', W / 2, H - 92);
  x.font = `800 28px ${TEXT}`;
  x.fillStyle = 'rgba(255,255,255,.75)';
  x.fillText(new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }), W / 2, H - 46);
  return new Promise((res) => cv.toBlob(res, 'image/png'));
}

/** Partage la carte par le menu du téléphone ; sans menu de partage, l'image est enregistrée. */
export async function shareCard(o: ShareCard): Promise<'partagee' | 'enregistree' | 'annulee' | 'impossible'> {
  const blob = await drawShareCard(o).catch(() => null);
  if (!blob) return 'impossible';
  const file = new File([blob], 'toc-partie.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: o.text });
      return 'partagee';
    } catch (e) {
      // Menu refermé sans rien envoyer : ce n'est pas une panne.
      if ((e as Error).name === 'AbortError') return 'annulee';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return 'enregistree';
}
