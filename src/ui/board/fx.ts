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
  | { kind: 'banner'; y: number; t: string; ms?: number }
  | { kind: 'sticker'; x: number; y: number; t: string; ms?: number };

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
  } else if (it.kind === 'sticker') {
    kids.push(div('left:0;top:0;white-space:nowrap;font:800 34px/1 var(--display);color:#fff;padding:9px 16px 5px;border-radius:18px;background:#2b2a3d;'
      + 'box-shadow:0 5px 0 #15141f,0 14px 24px rgba(0,0,0,.25);opacity:0', it.t));
  } else if (it.kind === 'card') {
    const c = div('left:-40px;top:-58px;width:80px;height:116px;border-radius:16px;background:#fff;box-shadow:0 6px 0 #e6dccf,0 16px 24px rgba(70,40,20,.25);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px');
    c.append(h('span', { style: { font: '800 40px/1 var(--display)', color: it.col } }, it.r), h('span', { style: { font: '700 22px/1 sans-serif', color: it.col } }, it.su));
    kids.push(c);
  } else if (it.kind === 'banner') {
    y = it.y;
    // Bandeau incliné qui porte son texte : ils entrent et sortent ensemble, le texte reste dans l'axe du bandeau.
    // Le balayage passe par clip-path sur un cadre plus grand que le bandeau, pour garder son relief et son ombre.
    const wrap = div('left:-30px;top:-42px;width:453px;height:84px;transform:rotate(-4deg);clip-path:inset(-80px 100% -80px -30px)');
    const band = div('inset:0;overflow:hidden;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#ff8466,#f25a38);'
      + 'box-shadow:0 8px 0 #c9401f,0 24px 40px rgba(242,90,56,.35),inset 0 3px 0 rgba(255,255,255,.3)');
    const shine = div('left:0;top:-20%;bottom:-20%;width:70px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent);transform:translateX(-100px) skewX(-20deg)');
    const text = div('position:relative;white-space:nowrap;font:800 36px/1 var(--display);letter-spacing:.02em;color:#fff;text-shadow:0 3px 0 #c9401f;padding-top:5px;opacity:0', it.t);
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
  else if (it.kind === 'sticker')
    A(kids[0], [
      { transform: 'translate(-50%,-50%) rotate(-8deg) scale(.2)', opacity: 0 },
      { transform: 'translate(-50%,-50%) rotate(-11deg) scale(1.25)', opacity: 1, offset: 0.16 },
      { transform: 'translate(-50%,-50%) rotate(-6deg) scale(1)', opacity: 1, offset: 0.3 },
      { transform: 'translate(-50%,-50%) rotate(-6deg) scale(1)', opacity: 1, offset: 0.82 },
      { transform: 'translate(-50%,-90%) rotate(-6deg) scale(.9)', opacity: 0 },
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
