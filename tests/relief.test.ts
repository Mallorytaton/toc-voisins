import { describe, expect, it } from 'vitest';
import { type ReliefState, leanStep, toScreen } from '../src/ui/board/relief';

/** Tient le téléphone dans cette position pendant `ms` millisecondes (une mesure toutes les 16 ms). */
function hold(s: ReliefState, beta: number, gamma: number, ms: number) {
  let out = leanStep(s, { beta, gamma }, 16);
  for (let t = 16; t < ms; t += 16) out = leanStep(out.state, { beta, gamma }, 16);
  return out;
}

describe('plateau en relief', () => {
  it('la première mesure fixe la position de repos : le plateau reste à plat', () => {
    const r = leanStep({ base: null }, { beta: 52, gamma: -3 }, 16);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.state.base).toEqual({ beta: 52, gamma: -3 });
  });

  it('incliner le bord droit vers l’arrière fait voir le plateau de la gauche', () => {
    const rest = leanStep({ base: null }, { beta: 50, gamma: 0 }, 16).state;
    const r = leanStep(rest, { beta: 50, gamma: 7 }, 16);
    expect(r.x).toBeGreaterThan(0.4);
    expect(r.x).toBeLessThan(0.5);
    expect(r.y).toBe(0);
    // Le bord gauche qui s'éloigne : on le voit de la droite, autant.
    expect(leanStep(rest, { beta: 50, gamma: -7 }, 16).x).toBeCloseTo(-r.x, 9);
  });

  it('coucher le téléphone fait voir le plateau d’en dessous, sans jamais dépasser 1', () => {
    const rest = leanStep({ base: null }, { beta: 50, gamma: 0 }, 16).state;
    const half = leanStep(rest, { beta: 43, gamma: 0 }, 16).y;
    expect(half).toBeGreaterThan(0.4);
    expect(half).toBeLessThan(0.5);
    expect(leanStep(rest, { beta: 20, gamma: 0 }, 16).y).toBe(1);
    expect(leanStep(rest, { beta: 80, gamma: 0 }, 16).y).toBe(-1);
  });

  it('tenu immobile dans sa nouvelle position, le plateau revient à plat tout seul', () => {
    const rest = leanStep({ base: null }, { beta: 50, gamma: 0 }, 16).state;
    const soon = hold(rest, 50, 10, 300), later = hold(rest, 50, 10, 25_000);
    expect(soon.x).toBeGreaterThan(0.6);
    expect(later.x).toBe(0);
  });

  it('un tremblement de la main ne fait pas bouger le plateau', () => {
    const rest = leanStep({ base: null }, { beta: 50, gamma: 0 }, 16).state;
    const r = leanStep(rest, { beta: 50.3, gamma: -0.4 }, 16);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });

  it('un grand mouvement (téléphone posé, retourné) repart de la nouvelle position', () => {
    const rest = leanStep({ base: null }, { beta: 50, gamma: 0 }, 16).state;
    const r = leanStep(rest, { beta: -10, gamma: 0 }, 16);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.state.base).toEqual({ beta: -10, gamma: 0 });
  });

  it('écran tourné : l’inclinaison est ramenée au repère de l’écran', () => {
    expect(toScreen(10, 4, 0)).toEqual({ beta: 10, gamma: 4 });
    expect(toScreen(10, 4, 90)).toEqual({ beta: -4, gamma: 10 });
    expect(toScreen(10, 4, 270)).toEqual({ beta: 4, gamma: -10 });
    expect(toScreen(10, 4, 180)).toEqual({ beta: -10, gamma: -4 });
  });
});
