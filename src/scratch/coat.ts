import { paperTransform } from './geometry';
import type { Surface } from './geometry';

/**
 * Refills wax from a pristine copy of the sheet's own coating, so a refilled
 * area matches the surrounding wax in colour and texture exactly.
 */
export class WaxCoat {
  readonly #pristine: HTMLCanvasElement;
  readonly #surface: Surface;

  constructor(pristine: HTMLCanvasElement, surface: Surface) {
    this.#pristine = pristine;
    this.#surface = surface;
  }

  /** Paint the pristine coating across a whole wax layer. */
  apply(ctx: CanvasRenderingContext2D): void {
    paperTransform(ctx, this.#surface);
    ctx.globalCompositeOperation = 'source-over';
    this.#blit(ctx);
  }

  /** Refill one dab-sized disc of wax, clipped to the dab's footprint. */
  stamp(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalCompositeOperation = 'source-over';
    this.#blit(ctx);
    ctx.restore();
  }

  #blit(ctx: CanvasRenderingContext2D): void {
    const width = this.#surface.width;
    const height = this.#surface.height;
    ctx.drawImage(this.#pristine, -width / 2, -height / 2, width, height);
  }
}
