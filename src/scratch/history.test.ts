import { describe, expect, it } from 'vite-plus/test';

import type { Surface } from './geometry';
import { WaxHistory } from './history';
import { alphaOf, fakeCanvas, fillAlpha, installFakeDocument, setAlpha } from './test-fakes';

installFakeDocument();

const SURFACE: Surface = { width: 100, height: 100, pixelWidth: 100, pixelHeight: 100 };
const COATED = 200;

interface Fixture {
  readonly wax: HTMLCanvasElement;
  readonly history: WaxHistory;
}

function fixture(): Fixture {
  const wax = fakeCanvas(100, 100);
  fillAlpha(wax, COATED);
  return { wax, history: new WaxHistory(wax, SURFACE) };
}

/** Simulate one dab of a stroke at a paper point: erase, register, as the painter does. */
function dab(f: Fixture, paperX: number, paperY: number): void {
  setAlpha(f.wax, paperX + 50, paperY + 50, 0);
  f.history.expand(paperX, paperY, 20);
}

describe('wax history', () => {
  it('restores the exact pixels a stroke removed, and redo removes them again', () => {
    const f = fixture();
    f.history.beginStroke();
    dab(f, 0, 0);
    expect(f.history.endStroke()).toBe(true);
    expect(f.history.canUndo).toBe(true);
    expect(alphaOf(f.wax, 50, 50)).toBe(0);
    expect(f.history.undo()).toBe(true);
    expect(alphaOf(f.wax, 50, 50)).toBe(COATED);
    expect(f.history.canRedo).toBe(true);
    expect(f.history.redo()).toBe(true);
    expect(alphaOf(f.wax, 50, 50)).toBe(0);
  });

  it('undoes several strokes in reverse order', () => {
    const f = fixture();
    f.history.beginStroke();
    dab(f, -20, 0);
    f.history.endStroke();
    f.history.beginStroke();
    dab(f, 20, 0);
    f.history.endStroke();
    expect(f.history.undo()).toBe(true);
    expect(alphaOf(f.wax, 70, 50)).toBe(COATED);
    expect(alphaOf(f.wax, 30, 50)).toBe(0);
    expect(f.history.undo()).toBe(true);
    expect(alphaOf(f.wax, 30, 50)).toBe(COATED);
    expect(f.history.undo()).toBe(false);
  });

  it('drops the redo stack as soon as a new stroke begins', () => {
    const f = fixture();
    f.history.beginStroke();
    dab(f, 0, 0);
    f.history.endStroke();
    expect(f.history.undo()).toBe(true);
    expect(f.history.canRedo).toBe(true);
    f.history.beginStroke();
    expect(f.history.canRedo).toBe(false);
    dab(f, 10, 10);
    f.history.endStroke();
    expect(f.history.redo()).toBe(false);
  });

  it('records nothing for a stroke that never touches the paper', () => {
    const f = fixture();
    f.history.beginStroke();
    expect(f.history.endStroke()).toBe(false);
    expect(f.history.canUndo).toBe(false);
    expect(f.history.undo()).toBe(false);
    expect(f.history.redo()).toBe(false);
  });

  it('clear forgets both stacks', () => {
    const f = fixture();
    f.history.beginStroke();
    dab(f, 0, 0);
    f.history.endStroke();
    f.history.undo();
    f.history.clear();
    expect(f.history.canUndo).toBe(false);
    expect(f.history.canRedo).toBe(false);
  });

  it('keeps at most fifty strokes of history', () => {
    const f = fixture();
    for (let i = 0; i < 55; i++) {
      f.history.beginStroke();
      dab(f, 0, 0);
      f.history.endStroke();
    }
    let undone = 0;
    while (f.history.undo()) undone += 1;
    expect(undone).toBe(50);
  });
});
