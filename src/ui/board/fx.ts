// Effets ponctuels de la maquette (FxItem), avec la Web Animations API.
import { h } from '../dom';

const FX_PAL = ['#ff6b4a', '#4a7dff', '#ffc93c', '#2ec4a0', '#9b7bff', '#ff6fae'];

export type Fx =
  | { kind: 'puff'; x: number; y: number; c: string; s?: number; ms?: number }
  | { kind: 'ring'; x: number; y: number; c: string; ms?: number }
  | { kind: 'burst'; x: number; y: number; c: string; ms?: number }
  | { kind: 'confetti'; x: number; y: number; ms?: number }
  | { kind: 'float'; x: number; y: number; c: string; t: string; fs?: number; ms?: number }
  | { kind: 'card'; x0: number; y0: number; x1: number; y1: number; r0: number; r1: number; s0: number; s1: number; r: string; su: string; col: string; ms?: number }
  | { kind: 'banner'; y: number; t: string; ms?: number };

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
    kids.push(div(`left:-12px;top:-12px;width:24px;height:24px;border-radius:50%;border:3px solid ${it.c};box-sizing:border-box;opacity:0`));
  } else if (it.kind === 'burst') {
    for (let i = 0; i < 12; i++) {
      const z = 4 + (i % 3) * 2;
      kids.push(div(`left:${-z / 2}px;top:${-z / 2}px;width:${z}px;height:${z}px;border-radius:50%;background:${i % 3 === 0 ? '#fff' : i % 3 === 1 ? it.c : '#ffc93c'};box-shadow:0 1px 2px rgba(0,0,0,.18)`));
    }
  } else if (it.kind === 'confetti') {
    for (let i = 0; i < 22; i++) kids.push(div(`left:-3px;top:-5px;width:${i % 2 ? 6 : 8}px;height:${i % 2 ? 10 : 6}px;border-radius:2px;background:${FX_PAL[i % 6]}`));
  } else if (it.kind === 'float') {
    kids.push(div(`left:0;top:0;white-space:nowrap;font:800 ${it.fs ?? 20}px/1 var(--display);color:${it.c};opacity:0;` +
      'text-shadow:0 2px 0 #fff,0 -2px 0 #fff,2px 0 0 #fff,-2px 0 0 #fff,2px 2px 0 #fff,-2px -2px 0 #fff,0 6px 10px rgba(0,0,0,.2)', it.t));
  } else if (it.kind === 'card') {
    const c = div('left:-40px;top:-58px;width:80px;height:116px;border-radius:16px;background:#fff;box-shadow:0 6px 0 #e6dccf,0 16px 24px rgba(70,40,20,.25);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px');
    c.append(h('span', { style: { font: '800 40px/1 var(--display)', color: it.col } }, it.r), h('span', { style: { font: '700 22px/1 sans-serif', color: it.col } }, it.su));
    kids.push(c);
  } else if (it.kind === 'banner') {
    y = it.y;
    kids.push(div('left:-20px;top:-46px;width:433px;height:92px;background:linear-gradient(180deg,#ff8466,#f25a38);box-shadow:0 8px 0 #c9401f,0 24px 40px rgba(242,90,56,.35);transform:translateX(-115%)'));
    kids.push(div("left:196px;top:0;white-space:nowrap;font:800 34px/1 var(--display);color:#fff;text-shadow:0 3px 0 #c9401f;opacity:0;padding-top:4px", it.t));
  }
  if (it.kind !== 'card' && it.kind !== 'banner') ({ x, y } = it);
  const root = div(`left:${x}px;top:${y}px;width:0;height:0;pointer-events:none`);
  root.append(...kids);
  layer.append(root);

  const A = (e: HTMLElement | undefined, k: Keyframe[], o: KeyframeAnimationOptions = {}) =>
    e?.animate?.(k, { duration: D, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards', ...o });
  if (it.kind === 'puff') A(kids[0], [{ transform: 'scale(.5)', opacity: 0.7 }, { transform: 'scale(1.9)', opacity: 0 }]);
  else if (it.kind === 'ring') A(kids[0], [{ transform: 'scale(.3)', opacity: 1 }, { transform: 'scale(3.2)', opacity: 0 }]);
  else if (it.kind === 'burst' || it.kind === 'confetti') {
    const cf = it.kind === 'confetti';
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
      { transform: 'translate(-50%,-20%) scale(.3)', opacity: 0 },
      { transform: 'translate(-50%,-110%) scale(1.2)', opacity: 1, offset: 0.22 },
      { transform: 'translate(-50%,-150%) scale(1)', opacity: 1, offset: 0.7 },
      { transform: 'translate(-50%,-230%) scale(.9)', opacity: 0 },
    ], { easing: 'ease-out' });
  else if (it.kind === 'card') {
    const mx = (it.x0 + it.x1) / 2, my = Math.min(it.y0, it.y1) - 70;
    A(kids[0], [
      { transform: `translate(${it.x0}px,${it.y0}px) rotate(${it.r0}deg) scale(${it.s0})` },
      { transform: `translate(${mx}px,${my}px) rotate(${(it.r0 + it.r1) / 2 + 180}deg) scale(${((it.s0 + it.s1) / 2) * 1.2})`, offset: 0.5 },
      { transform: `translate(${it.x1}px,${it.y1}px) rotate(${it.r1 + 360}deg) scale(${it.s1})` },
    ], { easing: 'cubic-bezier(.45,0,.25,1)' });
  } else if (it.kind === 'banner') {
    A(kids[0], [
      { transform: 'translateX(-115%) skewY(-5deg)' }, { transform: 'translateX(0) skewY(-5deg)', offset: 0.2 },
      { transform: 'translateX(2%) skewY(-5deg)', offset: 0.78 }, { transform: 'translateX(115%) skewY(-5deg)' },
    ], { easing: 'cubic-bezier(.6,0,.3,1)' });
    A(kids[1], [
      { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1, offset: 0.24 },
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.76 }, { transform: 'translate(-50%,-50%) scale(1.4)', opacity: 0 },
    ]);
  }
  setTimeout(() => root.remove(), D + 80);
}
