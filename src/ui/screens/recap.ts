// Récap de la soirée dans la page du tournoi, et son image à partager (dessinée sur un canvas, sans service).
import { type Recap, soireeRecap } from '../../app/recap';
import type { League } from '../../net/league';
import { h, toast } from '../dom';
import { COL, SEAT_COLORS, TEAM_NAMES } from '../kit/data';
import { button } from '../kit/kit';
import { mascot, mascotSvg } from '../mascot';

const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
const day = (t: number) => { const s = dayFmt.format(t); return s.charAt(0).toUpperCase() + s.slice(1); };
/** « 1 h 52 », « 41 min » */
const hm = (ms: number) => {
  const m = Math.max(1, Math.round(ms / 60_000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}`;
};

interface RecapText { headline: string; lines: [string, string][]; sub: string }

/** Les phrases du récap, partagées par la carte et l'image. */
function texts(l: League, r: Recap): RecapText {
  const teams = l.n / 2;
  const name = (seat: number) => l.members[l.seats[seat]]?.name ?? '…';
  const top = Math.max(...r.wins);
  const leaders = r.wins.map((w, t) => (w === top ? t : -1)).filter((t) => t >= 0);
  const score = teams === 2 ? `${top} à ${Math.min(...r.wins)}` : r.wins.map((w, t) => `${TEAM_NAMES[t]} ${w}`).join(' · ');
  const headline = leaders.length === 1 ? `L’équipe ${TEAM_NAMES[leaders[0]]} gagne ${teams === 2 ? score : ''}`.trim() : `Égalité${teams === 2 ? ' ' + score : ''}`;
  const lines: [string, string][] = [];
  if (r.boum) lines.push(['Roi du BOUM', `${name(r.boum.seat)} · ${r.boum.n} bille${r.boum.n > 1 ? 's' : ''} renvoyée${r.boum.n > 1 ? 's' : ''}`]);
  if (r.exits) lines.push(['Le plus de billes sorties', `${name(r.exits.seat)} · ${r.exits.n}`]);
  if (r.longest) lines.push(['Partie la plus longue', hm(r.longest)]);
  if (teams > 2) lines.unshift(['Score', score]);
  const sub = `${r.count} partie${r.count > 1 ? 's' : ''}${r.playMs ? ` · ${hm(r.playMs)} de jeu` : ''}`;
  return { headline, lines, sub };
}

/** La carte « Le récap » du tournoi, ou null s'il n'y a pas eu de soirée ces 3 derniers jours. */
export function recapCard(l: League): HTMLElement | null {
  const r = soireeRecap(l.games, l.n / 2, l.n);
  if (!r) return null;
  const t = texts(l, r);
  return h('div', { class: 'hero hero--yellow recap' },
    h('span', { class: 'tag' }, `LE RÉCAP · ${day(r.end).toUpperCase()}`),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
      mascot('vainqueur', 72, 'buste'),
      h('div', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 } },
        h('span', { class: 'recap__headline' }, t.headline),
        h('span', { class: 'recap__sub' }, t.sub))),
    h('div', { class: 'recap__lines' }, ...t.lines.map(([k, v]) => h('div', { class: 'recap__line' }, h('span', null, k), h('b', null, v)))),
    button('Partager l’image', 'dark', () => void shareRecap(l, r).catch(() => toast('Image indisponible pour l’instant.')), { size: 'sm', block: true }));
}

/** Dessine l'image du récap (1080 × 1350) et la partage (WhatsApp, Messages…) ou la télécharge. */
async function shareRecap(l: League, r: Recap) {
  const t = texts(l, r);
  const W = 1080, H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const css = getComputedStyle(document.documentElement);
  const display = css.getPropertyValue('--display').trim() || 'sans-serif';
  const text = css.getPropertyValue('--text').trim() || 'sans-serif';
  await Promise.all([document.fonts.load(`800 72px ${display}`), document.fonts.load(`700 40px ${text}`)]).catch(() => undefined);
  /** Rectangle arrondi (repli pour les navigateurs sans roundRect, iOS 15). */
  const round = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else {
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    ctx.fill();
  };
  // Fond crème et carte blanche arrondie
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fbf6ef';
  round(60, 60, W - 120, H - 120, 56);
  const center = (s: string, y: number, font: string, color: string) => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(s, W / 2, y, W - 200);
  };
  center('SOIRÉE TOC', 170, `800 40px ${text}`, '#8a8398');
  center(l.name, 250, `800 72px ${display}`, '#2b2a3d');
  center(day(r.end), 310, `700 40px ${text}`, '#6b6880');
  // Toc vainqueur
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(mascotSvg('vainqueur', { viewBox: '84 10 344 344', ground: false }));
  await img.decode();
  ctx.drawImage(img, W / 2 - 190, 340, 380, 380);
  center(t.headline, 800, `800 68px ${display}`, '#2b2a3d');
  center(t.sub, 860, `700 38px ${text}`, '#6b6880');
  // Les lignes du récap
  let y = 960;
  ctx.textAlign = 'left';
  for (const [k, v] of t.lines) {
    ctx.fillStyle = '#ffffff';
    round(140, y - 56, W - 280, 84, 26);
    ctx.font = `700 34px ${text}`;
    ctx.fillStyle = '#6b6880';
    ctx.textAlign = 'left';
    ctx.fillText(k, 180, y, 360);
    ctx.font = `800 38px ${display}`;
    ctx.fillStyle = '#2b2a3d';
    ctx.textAlign = 'right';
    ctx.fillText(v, W - 180, y, 460);
    y += 104;
  }
  // Pastilles des équipes, en bas
  const teams = l.n / 2;
  for (let k = 0; k < teams; k++) {
    ctx.fillStyle = COL[SEAT_COLORS[l.n][k]].c;
    ctx.beginPath();
    ctx.arc(W / 2 + (k - (teams - 1) / 2) * 60, H - 130, 18, 0, Math.PI * 2);
    ctx.fill();
  }
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('image');
  const file = new File([blob], `recap-${l.name.replace(/[^\p{L}\p{N}]+/gu, '-')}.png`, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: `Soirée TOC · ${l.name}`, text: `${t.headline} !` }).catch(() => undefined);
    return;
  }
  const a = h('a', { href: URL.createObjectURL(blob), download: file.name }) as HTMLAnchorElement;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Image enregistrée.');
}
