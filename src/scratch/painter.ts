import { ScratchBrush } from './brush';
import type { WaxCoat } from './coat';
import { paperTransform } from './geometry';
import type { Point, Surface } from './geometry';
import type { WaxHistory } from './history';
import { hash } from './random';

export type Tool = 'coat' | 'scratch';

interface Dab extends Point {
  readonly width: number;
  readonly direction: number;
  readonly variant: number;
  readonly tool: Tool;
}

/** Queues stroke dabs and renders them onto the wax layer on animation frames. */
export class StrokePainter {
  readonly #brush = new ScratchBrush();
  readonly #wax: CanvasRenderingContext2D;
  readonly #surface: Surface;
  readonly #history: WaxHistory;
  readonly #onFlush: () => void;
  readonly #pending: Dab[] = [];
  #seed: number;
  #coat: WaxCoat;
  #frame = 0;
  #dabCount = 0;

  constructor(
    wax: CanvasRenderingContext2D,
    surface: Surface,
    history: WaxHistory,
    seed: number,
    coat: WaxCoat,
    onFlush: () => void,
  ) {
    this.#wax = wax;
    this.#surface = surface;
    this.#history = history;
    this.#seed = seed;
    this.#coat = coat;
    this.#onFlush = onFlush;
  }

  /** Whether a frame is scheduled, so a flush is still outstanding. */
  get scheduled(): boolean {
    return this.#frame !== 0;
  }

  /** Start over with a fresh sheet: new seed and coating, nothing queued. */
  reset(seed: number, coat: WaxCoat): void {
    this.#seed = seed;
    this.#coat = coat;
    this.#dabCount = 0;
    this.#pending.length = 0;
    if (this.#frame !== 0) cancelAnimationFrame(this.#frame);
    this.#frame = 0;
  }

  enqueue(point: Point, width: number, direction: number, tool: Tool): void {
    const variant = hash(this.#seed, Math.floor(this.#dabCount / 7), 0, 37) % 4;
    this.#dabCount += 1;
    this.#pending.push({ ...point, width, direction, variant, tool });
    if (this.#frame === 0) this.#frame = requestAnimationFrame(this.#flush);
  }

  /** Run a scheduled flush now, which also closes the previous stroke. */
  flushPending(): void {
    if (this.#frame === 0) return;
    cancelAnimationFrame(this.#frame);
    this.#flush();
  }

  dispose(): void {
    this.#pending.length = 0;
    if (this.#frame !== 0) cancelAnimationFrame(this.#frame);
  }

  readonly #flush = (): void => {
    this.#frame = 0;
    paperTransform(this.#wax, this.#surface);
    for (const dab of this.#pending) {
      const nib = this.#brush.get(dab.width, dab.direction, dab.variant);
      const size = nib.size;
      const x = dab.x - size / 2;
      const y = dab.y - size / 2;
      if (dab.tool === 'coat') {
        this.#coat.stamp(this.#wax, x, y, size);
      } else {
        this.#wax.globalCompositeOperation = 'destination-out';
        this.#wax.drawImage(nib.canvas, x, y, size, size);
      }
      this.#history.expand(dab.x, dab.y, size);
    }
    this.#pending.length = 0;
    this.#onFlush();
  };
}
