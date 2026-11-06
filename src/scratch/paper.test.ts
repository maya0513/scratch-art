import { describe, expect, it } from 'vite-plus/test';

import { hash, random } from './random';
import { colorCellSize, crayonPatch } from './textures';

describe('a fresh but stable sheet', () => {
  it('regenerates identical patches regardless of viewport traversal', () => {
    const original = crayonPatch(17403, -2, 3, 220);
    for (let row = -8; row < 8; row++) crayonPatch(17403, row, row + 1, 220);
    expect(crayonPatch(17403, -2, 3, 220)).toEqual(original);
    expect(crayonPatch(17404, -2, 3, 220)).not.toEqual(original);
  });

  it('uses independent seeds for adjacent and negative paper regions', () => {
    const seeds = new Set<number>();
    for (let row = -10; row <= 10; row++) {
      for (let column = -10; column <= 10; column++) seeds.add(hash(123, column, row));
    }
    expect(seeds.size).toBe(441);
  });

  it('reproduces the texture sequence for the same seed', () => {
    const first = random(42);
    const replay = random(42);
    const other = random(43);
    const values = Array.from({ length: 100 }, first);
    expect(Array.from({ length: 100 }, replay)).toEqual(values);
    expect(Array.from({ length: 100 }, other)).not.toEqual(values);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
  });

  it('shrinks colour cells on small sheets and keeps the classic size on large ones', () => {
    expect(colorCellSize(390, 844)).toBeCloseTo(390 / 3.5);
    expect(colorCellSize(844, 390)).toBeCloseTo(390 / 3.5);
    expect(colorCellSize(1440, 900)).toBe(220);
    expect(colorCellSize(200, 200)).toBe(88);
  });
});
