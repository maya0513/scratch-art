import { describe, expect, it } from 'vite-plus/test';

import { paperPoint } from './geometry';
import type { Point, Surface } from './geometry';
import { fakePaper, installFakeWindow } from './test-fakes';
import { PaperView } from './view';

installFakeWindow(1000, 800);

const SURFACE: Surface = { width: 800, height: 600, pixelWidth: 800, pixelHeight: 600 };
const CENTER: Point = { x: 400, y: 300 };

interface Fixture {
  readonly view: PaperView;
  readonly element: HTMLElement;
}

function fixture(): Fixture {
  const paper = fakePaper(800, 600);
  return { view: new PaperView(paper.canvas, SURFACE), element: paper.element };
}

describe('paper view', () => {
  it('keeps the paper point under the cursor fixed while zooming', () => {
    const { view, element } = fixture();
    const before = paperPoint(CENTER, element.getBoundingClientRect(), SURFACE);
    view.zoomAt(CENTER, 2);
    expect(view.scale).toBe(2);
    const after = paperPoint(CENTER, element.getBoundingClientRect(), SURFACE);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('clamps the scale to five and snaps back to identity at one', () => {
    const { view, element } = fixture();
    view.zoomAt(CENTER, 100);
    expect(view.scale).toBe(5);
    view.zoomAt(CENTER, 0.5);
    expect(view.scale).toBe(1);
    expect(element.style.transform).toBe('');
  });

  it('reset returns a zoomed paper to identity', () => {
    const { view, element } = fixture();
    view.zoomAt({ x: 200, y: 150 }, 3);
    expect(view.scale).toBe(3);
    view.reset();
    expect(view.scale).toBe(1);
    expect(element.style.transform).toBe('');
  });

  it('pinching scales around the midpoint of the two pointers', () => {
    const { view, element } = fixture();
    const first: Point = { x: 350, y: 300 };
    const second: Point = { x: 450, y: 300 };
    const before = paperPoint(CENTER, element.getBoundingClientRect(), SURFACE);
    view.beginPinch([first, second]);
    expect(view.pinching).toBe(true);
    view.updatePinch([
      { x: 300, y: 300 },
      { x: 500, y: 300 },
    ]);
    expect(view.scale).toBeCloseTo(2, 6);
    const after = paperPoint(CENTER, element.getBoundingClientRect(), SURFACE);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    view.endPinch();
    expect(view.pinching).toBe(false);
  });
});
