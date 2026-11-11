import { afterEach, describe, expect, it, vi } from 'vitest';
import { HAPTICS, type Haptic, admit, canHaptic, canTick, canVibrate, hapticsOn, lengthOf, strengthOf } from '../src/ui/haptics';

describe('retour haptique', () => {
  it('chaque motif alterne vibrations et silences, en durées raisonnables', () => {
    for (const name of Object.keys(HAPTICS) as Haptic[]) {
      const p = HAPTICS[name];
      const parts = typeof p === 'number' ? [p] : [...p];
      // Un motif commence et finit par une vibration.
      expect(parts.length % 2, name).toBe(1);
      for (const ms of parts) {
        expect(ms, name).toBeGreaterThanOrEqual(10);
        expect(ms, name).toBeLessThanOrEqual(250);
      }
      // Jamais plus d'une demi-seconde : le retour reste un clin d'œil, pas une alarme.
      expect(lengthOf(p), name).toBeLessThanOrEqual(500);
    }
  });

  it('les gestes sont plus légers que les évènements de la partie', () => {
    for (const geste of ['touche', 'carte', 'bille', 'pas'] as const)
      for (const fort of ['boum', 'aie', 'tour', 'victoire'] as const)
        expect(strengthOf(HAPTICS[geste])).toBeLessThan(strengthOf(HAPTICS[fort]));
    // Perdre une bille se sent plus fort qu'en renvoyer une, et bien plus qu'un BOUM entre les autres.
    expect(strengthOf(HAPTICS.aie)).toBeGreaterThan(strengthOf(HAPTICS.boum));
    expect(strengthOf(HAPTICS.boum)).toBeGreaterThan(strengthOf(HAPTICS.choc));
  });

  it('la donne claque au rythme de son bruit : cinq cartes, une toutes les 85 ms', () => {
    const p = [...HAPTICS.donne];
    expect(p.filter((_, i) => i % 2 === 0)).toHaveLength(5);
    for (let i = 0; i + 2 < p.length; i += 2) expect(p[i] + p[i + 1]).toBe(85);
  });

  it('un petit coup ne coupe pas une vibration plus forte en cours', () => {
    const idle = { until: 0, level: 0 };
    const boum = admit(idle, HAPTICS.aie, 1000)!;
    expect(boum).toEqual({ until: 1000 + 290, level: 220 });
    // Pendant le BOUM, la bille qui se pose ne vibre pas ; un motif aussi fort, lui, prend la place.
    expect(admit(boum, HAPTICS.pose, 1100)).toBeNull();
    expect(admit(boum, HAPTICS.aie, 1100)).not.toBeNull();
    // Une fois le BOUM fini, tout repart.
    expect(admit(boum, HAPTICS.pose, 1300)).toEqual({ until: 1320, level: 20 });
  });

  it('un motif plus fort prend la place d’un plus léger : la bille se pose, puis le BOUM part aussitôt', () => {
    const pose = admit({ until: 0, level: 0 }, HAPTICS.pose, 500)!;
    expect(admit(pose, HAPTICS.boum, 500)).toEqual({ until: 650, level: 80 });
  });
});

describe('retour haptique : ce que le téléphone permet, et le réglage d’office', () => {
  afterEach(() => vi.unstubAllGlobals());
  /** Le réglage enregistré sur ce téléphone (null : le joueur n'a rien choisi). */
  const stored = (v: string | null) => vi.stubGlobal('localStorage', { getItem: () => v, setItem: () => undefined });
  /** Un navigateur qui connaît (ou non) le vrai interrupteur. */
  const browser = (userAgent: string, o: { vibrate?: boolean; nativeSwitch?: boolean } = {}) => {
    vi.stubGlobal('navigator', o.vibrate ? { userAgent, vibrate: () => true } : { userAgent });
    vi.stubGlobal('HTMLInputElement', o.nativeSwitch ? class { get switch() { return false; } } : class {});
  };
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1';

  it('Android : le téléphone vibre ; allumé d’office, coupé si le joueur le coupe', () => {
    browser('Mozilla/5.0 (Linux; Android 16; Pixel 9) Chrome/156.0 Mobile', { vibrate: true });
    stored(null);
    expect([canVibrate(), canTick(), hapticsOn()]).toEqual([true, false, true]);
    stored('0');
    expect(hapticsOn()).toBe(false);
  });

  it('iPhone : pas de vibration, mais le tic d’un vrai interrupteur ; coupé d’office, allumé si le joueur l’allume', () => {
    browser(IPHONE, { nativeSwitch: true });
    stored(null);
    expect([canVibrate(), canTick(), hapticsOn()]).toEqual([false, true, false]);
    stored('1');
    expect(hapticsOn()).toBe(true);
  });

  it('iPhone trop ancien pour l’interrupteur, iPad (pas de moteur), ordinateur : rien', () => {
    browser(IPHONE.replace('Version/26.5', 'Version/16.0'));
    expect(canHaptic()).toBe(false);
    browser('Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/26.5 Mobile/15E148 Safari/604.1', { nativeSwitch: true });
    expect(canHaptic()).toBe(false);
    browser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.5 Safari/605.1.15', { nativeSwitch: true });
    expect(canHaptic()).toBe(false);
  });
});
