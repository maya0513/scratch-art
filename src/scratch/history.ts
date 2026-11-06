import { context2D } from './canvas';
import type { Surface } from './geometry';

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Snapshot extends Rect {
  readonly canvas: HTMLCanvasElement;
}

type StackName = 'undo' | 'redo';

const MAX_SNAPSHOTS = 50;
const MAX_SNAPSHOT_PIXELS = 16_000_000;

function crop(source: HTMLCanvasElement, rect: Rect): Snapshot {
  const canvas = document.createElement('canvas');
  canvas.width = rect.width;
  canvas.height = rect.height;
  context2D(canvas).drawImage(
    source,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    rect.width,
    rect.height,
  );
  return { ...rect, canvas };
}

/**
 * Undo history for the wax layer. A stroke keeps only the rectangle it
 * touched, cropped from a full copy taken before the stroke began, so a
 * long session stays light on memory.
 */
export class WaxHistory {
  readonly #wax: HTMLCanvasElement;
  readonly #surface: Surface;
  readonly #base: HTMLCanvasElement;
  #undoStack: Snapshot[] = [];
  #redoStack: Snapshot[] = [];
  #pixels = 0;
  #open = false;
  #hasExtent = false;
  #minX = 0;
  #minY = 0;
  #maxX = 0;
  #maxY = 0;

  constructor(wax: HTMLCanvasElement, surface: Surface) {
    this.#wax = wax;
    this.#surface = surface;
    this.#base = document.createElement('canvas');
    this.#base.width = surface.pixelWidth;
    this.#base.height = surface.pixelHeight;
  }

  get canUndo(): boolean {
    return this.#undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.#redoStack.length > 0;
  }

  /** Snapshot the untouched wax and start collecting a stroke's bounds. */
  beginStroke(): void {
    const ctx = context2D(this.#base);
    ctx.clearRect(0, 0, this.#base.width, this.#base.height);
    ctx.drawImage(this.#wax, 0, 0);
    this.#open = true;
    this.#hasExtent = false;
    this.#drop('redo');
    this.#redoStack = [];
  }

  /** Grow the current stroke's bounds by one dab, in paper coordinates. */
  expand(x: number, y: number, size: number): void {
    if (!this.#open) return;
    const scaleX = this.#surface.pixelWidth / this.#surface.width;
    const scaleY = this.#surface.pixelHeight / this.#surface.height;
    const left = Math.floor((x - size / 2 + this.#surface.width / 2) * scaleX) - 1;
    const top = Math.floor((y - size / 2 + this.#surface.height / 2) * scaleY) - 1;
    const right = Math.ceil((x + size / 2 + this.#surface.width / 2) * scaleX) + 1;
    const bottom = Math.ceil((y + size / 2 + this.#surface.height / 2) * scaleY) + 1;
    if (!this.#hasExtent) {
      this.#minX = left;
      this.#minY = top;
      this.#maxX = right;
      this.#maxY = bottom;
      this.#hasExtent = true;
      return;
    }
    this.#minX = Math.min(this.#minX, left);
    this.#minY = Math.min(this.#minY, top);
    this.#maxX = Math.max(this.#maxX, right);
    this.#maxY = Math.max(this.#maxY, bottom);
  }

  /** Close the current stroke and keep its pre-stroke rectangle for undo. */
  endStroke(): boolean {
    if (!this.#open) return false;
    this.#open = false;
    if (!this.#hasExtent) return false;
    const x = Math.max(0, this.#minX);
    const y = Math.max(0, this.#minY);
    const width = Math.min(this.#surface.pixelWidth, this.#maxX) - x;
    const height = Math.min(this.#surface.pixelHeight, this.#maxY) - y;
    if (width <= 0 || height <= 0) return false;
    this.#push('undo', crop(this.#base, { x, y, width, height }));
    return true;
  }

  undo(): boolean {
    return this.#step('undo', 'redo');
  }

  redo(): boolean {
    return this.#step('redo', 'undo');
  }

  clear(): void {
    this.#undoStack = [];
    this.#redoStack = [];
    this.#pixels = 0;
    this.#open = false;
    this.#hasExtent = false;
  }

  #stack(name: StackName): Snapshot[] {
    return name === 'undo' ? this.#undoStack : this.#redoStack;
  }

  #step(from: StackName, to: StackName): boolean {
    const snapshot = this.#stack(from).pop();
    if (snapshot === undefined) return false;
    this.#pixels -= snapshot.width * snapshot.height;
    this.#push(to, crop(this.#wax, snapshot));
    const ctx = context2D(this.#wax);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(snapshot.x, snapshot.y, snapshot.width, snapshot.height);
    ctx.drawImage(snapshot.canvas, snapshot.x, snapshot.y);
    return true;
  }

  #push(name: StackName, snapshot: Snapshot): void {
    const stack = this.#stack(name);
    stack.push(snapshot);
    this.#pixels += snapshot.width * snapshot.height;
    while (
      stack.length > 1 &&
      (stack.length > MAX_SNAPSHOTS || this.#pixels > MAX_SNAPSHOT_PIXELS)
    ) {
      const dropped = stack.shift();
      if (dropped === undefined) break;
      this.#pixels -= dropped.width * dropped.height;
    }
  }

  #drop(name: StackName): void {
    for (const snapshot of this.#stack(name)) {
      this.#pixels -= snapshot.width * snapshot.height;
    }
  }
}
