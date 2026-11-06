import { paperPoint } from './geometry';
import type { Point, Surface } from './geometry';

const MAX_SCALE = 5;

interface Pinch {
  readonly anchor: Point;
  readonly distance: number;
  readonly scale: number;
}

function midpoint(first: Point, second: Point): Point {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function distance(first: Point, second: Point): number {
  return Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
}

/** Pinch and wheel zoom plus pan, applied as a transform on the paper. */
export class PaperView {
  readonly #element: HTMLElement;
  readonly #surface: Surface;
  #scale = 1;
  #tx = 0;
  #ty = 0;
  #pinch: Pinch | null = null;

  constructor(canvas: HTMLCanvasElement, surface: Surface) {
    this.#element = canvas.parentElement ?? canvas;
    this.#surface = surface;
  }

  get scale(): number {
    return this.#scale;
  }

  get pinching(): boolean {
    return this.#pinch !== null;
  }

  reset(): void {
    this.#pinch = null;
    this.#scale = 1;
    this.#tx = 0;
    this.#ty = 0;
    this.#apply();
  }

  beginPinch(points: readonly Point[]): void {
    const [first, second] = points;
    if (first === undefined || second === undefined) return;
    const rect = this.#element.getBoundingClientRect();
    this.#pinch = {
      anchor: paperPoint(midpoint(first, second), rect, this.#surface),
      distance: distance(first, second),
      scale: this.#scale,
    };
  }

  updatePinch(points: readonly Point[]): void {
    const [first, second] = points;
    if (this.#pinch === null || first === undefined || second === undefined) return;
    const ratio = distance(first, second) / this.#pinch.distance;
    this.#zoom(this.#pinch.anchor, midpoint(first, second), this.#pinch.scale * ratio);
  }

  endPinch(): void {
    this.#pinch = null;
  }

  /** Zoom around a client point, keeping the paper point beneath it fixed. */
  zoomAt(client: Point, scale: number): void {
    const rect = this.#element.getBoundingClientRect();
    this.#zoom(paperPoint(client, rect, this.#surface), client, scale);
  }

  #zoom(anchor: Point, client: Point, scale: number): void {
    const next = Math.max(1, Math.min(MAX_SCALE, scale));
    if (next <= 1.001) {
      this.#scale = 1;
      this.#tx = 0;
      this.#ty = 0;
      this.#apply();
      return;
    }
    const rect = this.#element.getBoundingClientRect();
    const layoutX = rect.left - this.#tx;
    const layoutY = rect.top - this.#ty;
    const layoutW = rect.width / this.#scale;
    const layoutH = rect.height / this.#scale;
    const fx = (anchor.x + this.#surface.width / 2) / this.#surface.width;
    const fy = (anchor.y + this.#surface.height / 2) / this.#surface.height;
    let tx = client.x - layoutX - fx * layoutW * next;
    let ty = client.y - layoutY - fy * layoutH * next;
    const left = layoutX + tx;
    const top = layoutY + ty;
    const right = left + layoutW * next;
    const bottom = top + layoutH * next;
    if (right < window.innerWidth * 0.3) tx += window.innerWidth * 0.3 - right;
    if (left > window.innerWidth * 0.7) tx -= left - window.innerWidth * 0.7;
    if (bottom < window.innerHeight * 0.3) ty += window.innerHeight * 0.3 - bottom;
    if (top > window.innerHeight * 0.7) ty -= top - window.innerHeight * 0.7;
    this.#scale = next;
    this.#tx = tx;
    this.#ty = ty;
    this.#apply();
  }

  #apply(): void {
    this.#element.style.transform =
      this.#scale === 1 && this.#tx === 0 && this.#ty === 0
        ? ''
        : `translate(${this.#tx}px, ${this.#ty}px) scale(${this.#scale})`;
  }
}
