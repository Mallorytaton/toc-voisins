// Effets ponctuels du plateau, façon BD : étoiles d'explosion, lettrage cerné d'encre, bandeaux qui claquent.
// Chaque effet est joué avec la Web Animations API puis retiré.
import { h } from '../dom';
import { suitPath } from '../kit/kit';

const INK = '#16131f';
const FX_PAL = ['#ff5433', '#3b5bff', '#ffcf1f', '#19c6a4', '#9b6bff', '#ff7ab8'];
/** Contour d'encre d'un lettrage (n px), suivi de son ombre dure. */
const stroke = (n: number, dx = n + 1, dy = n + 2) =>
  [[-n, -n], [n, -n], [-n, n], [n, n], [0, -n], [0, n], [-n, 0], [n, 0]].map(([x, y]) => `${x}px ${y}px 0 ${INK}`).join(',') + `,${dx}px ${dy}px 0 ${INK}`;

/** Étoile d'explosion en pourcentages (pour clip-path) : n pointes, irrégulières mais toujours les mêmes. */
export function burstPath(n: number, r1 = 50, r2 = 34, rot = 0, wob = 0.12): string {
  const out: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = ((rot + (i * 180) / n) * Math.PI) / 180, k = 1 - (wob * ((i * 7) % 5)) / 5, r = (i % 2 ? r2 : r1) * k;
    out.push(`${(50 + r * Math.cos(a)).toFixed(1)}% ${(50 + r * Math.sin(a)).toFixed(1)}%`);
  }
  return `polygon(${out.join(',')})`;
}

export type Fx =
  | { kind: 'puff'; x: number; y: number; c: string; s?: number; ms?: number }
  | { kind: 'ring'; x: number; y: number; c: string; ms?: number }
  | { kind: 'burst'; x: number; y: number; c: string; ms?: number }
  | { kind: 'confetti'; x: number; y: number; ms?: number }
  | { kind: 'hearts'; x: number; y: number; ms?: number }
  | { kind: 'splat'; x: number; y: number; c: string; ms?: number }
  | { kind: 'float'; x: number; y: number; c: string; t: string; fs?: number; ms?: number }
  /** Carte qui vole de la main (ou d'un perso) vers la défausse. r : rang ('' pour le joker), k : couleur (S, H, D, C, X). */
  | { kind: 'card'; x0: number; y0: number; x1: number; y1: number; r0: number; r1: number; s0: number; s1: number; r: string; k: string; col: string; ms?: number }
  | { kind: 'banner'; y: number; t: string; ms?: number }
  /** Le cri d'un BOUM : lettrage sur une étoile d'explosion. */
  | { kind: 'sticker'; x: number; y: number; t: string; ms?: number }
  /** Étoile d'explosion seule (choc). */
  | { kind: 'star'; x: number; y: number; c: string; s?: number; ms?: number };

const div = (style: string, text?: string) => {
  const el = h('div', null, text ?? null);
  el.style.cssText = 'position:absolute;' + style;
  return el;
};

/** Joue un effet dans `layer` (un calque en position absolue) puis le retire. */
export function playFx(layer: HTMLElement, it: Fx) {
  const D = it.ms ?? 600;
  const kids: HTMLElement[] = [];
  let x = 0, y = 0;
  if (it.kind === 'puff') {
    const s = it.s ?? 16;
    kids.push(div(`left:${-s / 2}px;top:${-s / 2}px;width:${s}px;height:${s}px;border-radius:50%;background:${it.c};opacity:0`));
  } else if (it.kind === 'ring') {
    kids.push(div(`left:-12px;top:-12px;width:24px;height:24px;border-radius:50%;border:3px solid ${it.c};box-sizing:border-box;box-shadow:0 0 0 1.5px ${INK},inset 0 0 0 1.5px ${INK};opacity:0`));
  } else if (it.kind === 'burst') {
    for (let i = 0; i < 12; i++) {
      const z = 5 + (i % 3) * 2;
      kids.push(div(`left:${-z / 2}px;top:${-z / 2}px;width:${z}px;height:${z}px;border-radius:50%;box-sizing:border-box;border:1.5px solid ${INK};background:${i % 3 === 0 ? '#fff' : i % 3 === 1 ? it.c : '#ffcf1f'}`));
    }
  } else if (it.kind === 'confetti') {
    for (let i = 0; i < 22; i++) kids.push(div(`left:-3px;top:-5px;width:${i % 2 ? 7 : 9}px;height:${i % 2 ? 11 : 7}px;border-radius:2px;box-sizing:border-box;border:1.5px solid ${INK};background:${FX_PAL[i % 6]}`));
  } else if (it.kind === 'hearts') {
    for (let i = 0; i < 12; i++) kids.push(div(`left:-8px;top:-9px;font:900 ${15 + (i % 3) * 5}px/1 sans-serif;color:${['#ff5433', '#ff7ab8', '#e0331b'][i % 3]};text-shadow:${stroke(1.5, 2, 2)}`, '♥'));
  } else if (it.kind === 'splat') {
    kids.push(div(`left:-30px;top:-30px;width:60px;height:60px;border-radius:46% 54% 42% 58% / 52% 44% 56% 48%;box-sizing:border-box;border:3px solid ${INK};background:${it.c};opacity:0`));
    for (let i = 0; i < 8; i++) { const z = 7 + (i % 3) * 4; kids.push(div(`left:${-z / 2}px;top:${-z / 2}px;width:${z}px;height:${z}px;border-radius:50%;box-sizing:border-box;border:2px solid ${INK};background:${it.c}`)); }
  } else if (it.kind === 'float') {
    kids.push(div(`left:0;top:0;white-space:nowrap;font:400 ${Math.round((it.fs ?? 20) * 1.25)}px/1 var(--fx);letter-spacing:.03em;color:${it.c};opacity:0;text-shadow:${stroke(2)}`, it.t));
  } else if (it.kind === 'star') {
    const s = it.s ?? 70;
    const wrap = div(`left:${-s / 2}px;top:${-s / 2}px;width:${s}px;height:${s}px;opacity:0`);
    wrap.append(div(`inset:-4px;background:${INK};clip-path:${burstPath(11)}`), div(`inset:0;background:${it.c};clip-path:${burstPath(11)}`), div(`inset:26%;background:#fff;clip-path:${burstPath(9, 50, 32, 14)}`));
    kids.push(wrap);
  } else if (it.kind === 'sticker') {
    // Le cri sur son étoile : l'étoile est dimensionnée par le texte.
    const wrap = div('left:0;top:0;opacity:0;display:grid;place-items:center;padding:16px 22px 12px');
    const txt = h('span', null, it.t);
    txt.style.cssText = `position:relative;white-space:nowrap;font:400 34px/1 var(--fx);letter-spacing:.03em;color:#ff5433;text-shadow:${stroke(2.5, 4, 5)}`;
    wrap.append(div(`left:5px;top:7px;width:100%;height:100%;background:${INK};clip-path:${burstPath(13, 50, 38)}`), div(`inset:-5px;background:${INK};clip-path:${burstPath(13, 50, 38)}`),
      div(`inset:0;background:#ffcf1f;clip-path:${burstPath(13, 50, 38)}`), txt);
    kids.push(wrap);
  } else if (it.kind === 'card') {
    const c = div(`left:-46px;top:-66px;width:92px;height:132px;box-sizing:border-box;border:3px solid ${INK};border-radius:13px;background:#fffdf6;box-shadow:0 5px 0 ${INK};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:${it.col}`);
    const suit = h('span', { style: { width: it.r ? 30 : 54, height: it.r ? 30 : 54, lineHeight: 0 } });
    suit.innerHTML = `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="${suitPath(it.k)}" fill="currentColor"/></svg>`;
    if (it.r) c.append(h('span', { style: { font: '400 54px/.9 var(--fx)' } }, it.r));
    c.append(suit);
    kids.push(c);
  } else if (it.kind === 'banner') {
    y = it.y;
    // Bandeau d'encre incliné qui porte son lettrage : ils entrent et sortent ensemble, le texte reste dans l'axe du bandeau.
    // Le balayage passe par clip-path sur un cadre plus grand que le bandeau, pour garder son liseré.
    const wrap = div('left:-30px;top:-40px;width:453px;height:80px;transform:rotate(-4deg);clip-path:inset(-80px 100% -80px -30px)');
    const band = div(`inset:0;overflow:hidden;display:flex;align-items:center;justify-content:center;background:${INK};box-shadow:0 7px 0 #ff5433,0 -5px 0 #ffcf1f`);
    const shine = div('left:0;top:-20%;bottom:-20%;width:70px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.28),transparent);transform:translateX(-100px) skewX(-20deg)');
    const text = div('position:relative;white-space:nowrap;font:400 46px/1 var(--fx);letter-spacing:.05em;color:#fff;text-shadow:3px 4px 0 #ff5433;padding-top:5px;opacity:0', it.t);
    band.append(shine, text);
    wrap.append(band);
    kids.push(wrap, text, shine);
  }
  if (it.kind !== 'card' && it.kind !== 'banner') ({ x, y } = it);
  const root = div(`left:${x}px;top:${y}px;width:0;height:0;pointer-events:none`);
  root.append(...(it.kind === 'banner' ? kids.slice(0, 1) : kids));
  layer.append(root);

  const A = (e: HTMLElement | undefined, k: Keyframe[], o: KeyframeAnimationOptions = {}) =>
    e?.animate?.(k, { duration: D, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards', ...o });
  if (it.kind === 'puff') A(kids[0], [{ transform: 'scale(.5)', opacity: 0.7 }, { transform: 'scale(1.9)', opacity: 0 }]);
  else if (it.kind === 'ring') A(kids[0], [{ transform: 'scale(.3)', opacity: 1 }, { transform: 'scale(3.2)', opacity: 0 }]);
  else if (it.kind === 'star')
    A(kids[0], [
      { transform: 'scale(.2) rotate(-20deg)', opacity: 1 }, { transform: 'scale(1.15) rotate(6deg)', opacity: 1, offset: 0.25 },
      { transform: 'scale(1) rotate(0deg)', opacity: 1, offset: 0.7 }, { transform: 'scale(1.2) rotate(8deg)', opacity: 0 },
    ], { easing: 'ease-out' });
  else if (it.kind === 'splat') {
    A(kids[0], [{ transform: 'scale(.2) rotate(-20deg)', opacity: 0.95 }, { transform: 'scale(1.18) rotate(4deg)', opacity: 0.95, offset: 0.12 },
      { transform: 'scale(1) rotate(0deg)', opacity: 0.9, offset: 0.2 }, { transform: 'scale(1)', opacity: 0.85, offset: 0.75 }, { transform: 'scale(1.05)', opacity: 0 }]);
    kids.slice(1).forEach((k, i) => {
      const a = (i / 8) * Math.PI * 2 + 0.3, d = 34 + (i % 3) * 9;
      A(k, [{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px)`, opacity: 1, offset: 0.15 },
        { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px)`, opacity: 0.85, offset: 0.75 }, { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d + 6}px)`, opacity: 0 }]);
    });
  } else if (it.kind === 'burst' || it.kind === 'confetti' || it.kind === 'hearts') {
    const cf = it.kind !== 'burst';
    kids.forEach((k, i) => {
      const a = (i / kids.length) * Math.PI * 2 + Math.random() * 0.5, d = (cf ? 55 : 26) + Math.random() * (cf ? 50 : 20);
      const dx = Math.cos(a) * d, dy = Math.sin(a) * d, r = (Math.random() - 0.5) * 720;
      A(k, [
        { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px,${dy - 18}px) rotate(${r / 2}deg) scale(1)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx * 1.15}px,${dy + 34}px) rotate(${r}deg) scale(.5)`, opacity: 0 },
      ]);
    });
  } else if (it.kind === 'float')
    A(kids[0], [
      { transform: 'translate(-50%,-20%) scale(.3) rotate(-6deg)', opacity: 0 },
      { transform: 'translate(-50%,-110%) scale(1.2) rotate(-6deg)', opacity: 1, offset: 0.22 },
      { transform: 'translate(-50%,-150%) scale(1) rotate(-4deg)', opacity: 1, offset: 0.7 },
      { transform: 'translate(-50%,-230%) scale(.9) rotate(-4deg)', opacity: 0 },
    ], { easing: 'ease-out' });
  else if (it.kind === 'sticker')
    A(kids[0], [
      { transform: 'translate(-50%,-50%) rotate(-8deg) scale(1.9)', opacity: 0 },
      { transform: 'translate(-50%,-50%) rotate(-11deg) scale(.92)', opacity: 1, offset: 0.14 },
      { transform: 'translate(-50%,-50%) rotate(-7deg) scale(1)', opacity: 1, offset: 0.26 },
      { transform: 'translate(-50%,-50%) rotate(-7deg) scale(1)', opacity: 1, offset: 0.82 },
      { transform: 'translate(-50%,-70%) rotate(-7deg) scale(.9)', opacity: 0 },
    ], { easing: 'ease-out' });
  else if (it.kind === 'card') {
    const mx = (it.x0 + it.x1) / 2, my = Math.min(it.y0, it.y1) - 70;
    A(kids[0], [
      { transform: `translate(${it.x0}px,${it.y0}px) rotate(${it.r0}deg) scale(${it.s0})` },
      { transform: `translate(${mx}px,${my}px) rotate(${(it.r0 + it.r1) / 2 + 180}deg) scale(${((it.s0 + it.s1) / 2) * 1.2})`, offset: 0.5 },
      { transform: `translate(${it.x1}px,${it.y1}px) rotate(${it.r1 + 360}deg) scale(${it.s1})` },
    ], { easing: 'cubic-bezier(.45,0,.25,1)' });
  } else if (it.kind === 'banner') {
    const [wrap, text, shine] = kids;
    // Le bandeau se déroule de gauche à droite, tient, puis s'efface vers la droite.
    A(wrap, [
      { clipPath: 'inset(-80px 100% -80px -30px)' },
      { clipPath: 'inset(-80px -30px -80px -30px)', offset: 0.2 },
      { clipPath: 'inset(-80px -30px -80px -30px)', offset: 0.8 },
      { clipPath: 'inset(-80px -30px -80px 100%)' },
    ], { easing: 'cubic-bezier(.65,0,.35,1)' });
    // Le texte glisse dans le même sens, juste derrière le balayage, puis repart avec lui.
    A(text, [
      { transform: 'translateX(-40px)', opacity: 0 },
      { transform: 'translateX(-40px)', opacity: 0, offset: 0.06 },
      { transform: 'translateX(4px)', opacity: 1, offset: 0.24 },
      { transform: 'translateX(0)', opacity: 1, offset: 0.3 },
      { transform: 'translateX(0)', opacity: 1, offset: 0.8 },
      { transform: 'translateX(40px)', opacity: 0, offset: 0.96 },
      { transform: 'translateX(40px)', opacity: 0 },
    ], { easing: 'ease-out' });
    // Un reflet traverse le bandeau une fois, quand il est en place.
    A(shine, [
      { transform: 'translateX(-100px) skewX(-20deg)' },
      { transform: 'translateX(-100px) skewX(-20deg)', offset: 0.28 },
      { transform: 'translateX(520px) skewX(-20deg)', offset: 0.6 },
      { transform: 'translateX(520px) skewX(-20deg)' },
    ], { easing: 'ease-in-out' });
  }
  setTimeout(() => root.remove(), D + 80);
}
