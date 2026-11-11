import { describe, expect, it } from 'vitest';
import { type Reading, poseOf, shapeOf } from '../src/ui/fold';

/** Un écran tactile à plat, sans pliure annoncée. */
const flat = (w: number, h: number, more: Partial<Reading> = {}): Reading => ({ w, h, coarse: true, cols: 1, rows: 1, folded: null, ...more });

describe('pliants : la tenue suit la forme de l’écran et la pliure, jamais un modèle', () => {
  it('un téléphone reste un téléphone, en portrait comme en paysage', () => {
    expect(poseOf(flat(393, 852))).toBe('phone');
    expect(poseOf(flat(360, 640))).toBe('phone');
    expect(poseOf(flat(852, 393))).toBe('phone');
    expect(poseOf(flat(430, 932))).toBe('phone');
  });

  it('un grand écran tactile à plat ouvre la double page, quel que soit son format', () => {
    // étroit, référence, presque carré, large 4:3, trois volets, tablette
    for (const [w, h] of [[690, 829], [752, 832], [792, 820], [904, 640], [1080, 760], [820, 1180], [832, 752]]) expect(poseOf(flat(w, h))).toBe('open');
  });

  it('un ordinateur (pas de doigt) garde l’écran du téléphone', () => {
    expect(poseOf(flat(1280, 800, { coarse: false }))).toBe('phone');
  });

  it('un écran trop allongé n’est pas une double page', () => {
    expect(poseOf(flat(1400, 600))).toBe('phone');
    expect(poseOf(flat(560, 1200))).toBe('phone');
  });

  it('entrouvert comme un livre : une page de chaque côté de la pliure', () => {
    expect(poseOf(flat(752, 832, { cols: 2 }))).toBe('book');
    expect(poseOf(flat(752, 832, { cols: 2, folded: true }))).toBe('book');
  });

  it('deux volets annoncés mais appareil à plat : la double page, pliure comprise', () => {
    expect(poseOf(flat(752, 832, { cols: 2, folded: false }))).toBe('open');
    expect(poseOf(flat(832, 752, { rows: 2, folded: false }))).toBe('open');
  });

  it('posé en chevalet : le grand écran plié à l’horizontale', () => {
    expect(poseOf(flat(832, 752, { rows: 2 }))).toBe('tent');
    expect(poseOf(flat(752, 832, { rows: 2, folded: true }))).toBe('tent');
  });

  it('pliant à clapet entrouvert : un écran de téléphone plié à l’horizontale', () => {
    expect(poseOf(flat(360, 840, { rows: 2 }))).toBe('flip');
    expect(poseOf(flat(412, 780, { rows: 2, folded: true }))).toBe('flip');
  });

  it('un clapet couché sur le côté reste un téléphone (mode manette)', () => {
    expect(poseOf(flat(840, 360, { cols: 2 }))).toBe('phone');
  });
});

describe('pliants : la forme de la double page', () => {
  it('deux pages tant que l’écran n’est pas nettement plus large que haut', () => {
    expect(shapeOf(690, 829)).toBe('duo');
    expect(shapeOf(752, 832)).toBe('duo');
    expect(shapeOf(792, 820)).toBe('duo');
    expect(shapeOf(832, 752)).toBe('duo');
  });
  it('des colonnes sur les côtés dès 5 de large pour 4 de haut', () => {
    expect(shapeOf(904, 640)).toBe('wide');
    expect(shapeOf(1000, 800)).toBe('wide');
  });
  it('trois volets sur un écran très large', () => {
    expect(shapeOf(1080, 760)).toBe('trio');
    expect(shapeOf(1200, 800)).toBe('trio');
  });
});
