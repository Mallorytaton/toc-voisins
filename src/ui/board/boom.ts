// Effet de BOUM selon ce que porte le joueur qui renvoie la bille (boutique) : confettis, cœurs,
// feu d'artifice, éclair ou peinture, puis son cri (« BOUM ! », « PAF ! »…).
import { type Look, criOf, lookOf } from '../../app/shop';
import type { Fx } from './fx';

/** Joue l'effet en (x, y) ; c : couleur du joueur ; sticker : où poser le cri (rien si absent). */
export function boomFx(play: (it: Fx) => void, look: Look | undefined, x: number, y: number, c: string, sticker?: { x: number; y: number }) {
  const b = lookOf(look).boom;
  if (b === 'coeurs') {
    play({ kind: 'hearts', x, y, ms: 1300 });
    play({ kind: 'ring', x, y, c: '#ff6fae', ms: 650 });
  } else if (b === 'artifice') {
    play({ kind: 'burst', x, y, c: '#ffc93c', ms: 900 });
    play({ kind: 'ring', x, y, c: '#ffc93c', ms: 600 });
    setTimeout(() => play({ kind: 'ring', x, y, c: '#ff6fae', ms: 700 }), 160);
    setTimeout(() => play({ kind: 'burst', x, y, c: '#4a7dff', ms: 900 }), 240);
  } else if (b === 'eclair') {
    play({ kind: 'puff', x, y, c: '#fff', s: 70, ms: 380 });
    play({ kind: 'ring', x, y, c: '#ffc93c', ms: 600 });
    play({ kind: 'float', x, y: y + 12, c: '#ffc93c', t: '⚡', fs: 46, ms: 1000 });
  } else if (b === 'peinture') {
    play({ kind: 'splat', x, y, c, ms: 1500 });
  } else {
    play({ kind: 'confetti', x, y, ms: 1100 });
    play({ kind: 'ring', x, y, c: '#fff', ms: 650 });
  }
  if (sticker) play({ kind: 'sticker', x: sticker.x, y: sticker.y, t: criOf(look), ms: 1300 });
}
