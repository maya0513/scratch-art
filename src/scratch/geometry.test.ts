import { describe, expect, it } from 'vite-plus/test';

import { MAX_PIXELS, paperPoint, resampleSegment, surfaceSize } from './geometry';

describe('paper coordinates', () => {
  it('keeps a mark at the same paper position across orientation changes', () => {
    const paper = surfaceSize(400, 600, 2);
    const portrait = paperPoint(
      { x: 310, y: 270 },
      { left: 10, top: 20, width: 400, height: 600 },
      paper,
    );
    const landscape = paperPoint(
      { x: 180, y: 165 },
      { left: 30, top: 40, width: 200, height: 300 },
      paper,
    );
    expect(portrait).toEqual({ x: 100, y: -50 });
    expect(landscape).toEqual(portrait);
  });
});

describe('rendering budget', () => {
  it('caps high-density phones at twice the CSS resolution', () => {
    expect(surfaceSize(390, 844, 3)).toEqual({
      width: 390,
      height: 844,
      pixelWidth: 780,
      pixelHeight: 1688,
    });
  });

  it('keeps large displays within the pixel budget', () => {
    for (const [width, height] of [
      [3840, 2160],
      [8000, 6000],
      [5120, 1440],
    ] as const) {
      const size = surfaceSize(width, height, 3);
      expect(size.pixelWidth * size.pixelHeight).toBeLessThanOrEqual(MAX_PIXELS);
      expect(size.pixelWidth / size.pixelHeight).toBeCloseTo(width / height, 2);
    }
  });
});

describe('scratch interpolation', () => {
  it('fills the gaps in a fast pointer movement', () => {
    const result = resampleSegment({ x: 0, y: 0 }, { x: 12, y: 0 }, 2, 0);
    expect(result.points.map((point) => point.x)).toEqual([2, 4, 6, 8, 10, 12]);
    expect(result.carried).toBe(0);
  });

  it('produces the same positions for many small events as one long event', () => {
    const xs: number[] = [];
    let carried = 0;
    let previous = 0;
    for (const x of [0.6, 1.3, 1.99, 2.01, 3.7, 5.4, 8.3, 10]) {
      const result = resampleSegment({ x: previous, y: 0 }, { x, y: 0 }, 2, carried);
      xs.push(...result.points.map((point) => point.x));
      carried = result.carried;
      previous = x;
    }
    expect(xs).toHaveLength(5);
    xs.forEach((x, index) => {
      expect(x).toBeCloseTo((index + 1) * 2, 8);
    });
    expect(carried).toBeCloseTo(0, 8);
  });

  it('does not add dabs when the pointer is stationary', () => {
    expect(resampleSegment({ x: 1, y: 2 }, { x: 1, y: 2 }, 0.5, 0.3)).toEqual({
      points: [],
      carried: 0.3,
    });
  });
});
