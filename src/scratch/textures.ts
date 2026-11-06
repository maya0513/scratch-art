import { context2D } from './canvas';
import { ColourSurface } from './colour';
import type { Surface } from './geometry';
import { WaxCoating } from './wax';

export { colorCellSize, crayonPatch } from './colour';
export type { Patch } from './colour';

/** All of a sheet's generated surfaces, painted from one seed. */
export class PaperTextures {
  readonly #colour: ColourSurface;
  readonly #wax: WaxCoating;

  constructor(seed: number) {
    this.#colour = new ColourSurface(seed);
    this.#wax = new WaxCoating(seed);
  }

  paintColor(ctx: CanvasRenderingContext2D, surface: Surface): void {
    this.#colour.paint(ctx, surface);
  }

  /** Render this sheet's wax coating onto its own canvas, for exact refills. */
  pristineWax(surface: Surface): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = surface.pixelWidth;
    canvas.height = surface.pixelHeight;
    this.paintWax(context2D(canvas), surface);
    return canvas;
  }

  paintWax(ctx: CanvasRenderingContext2D, surface: Surface): void {
    this.#wax.paint(ctx, surface);
  }
}
