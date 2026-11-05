import { context2D } from './canvas';
import { hash } from './random';

export const DIRECTIONS = 32;
const RESOLUTION = 3;

interface Nib {
  readonly canvas: HTMLCanvasElement;
  readonly size: number;
}

/** Tiny, cached alpha stamps: a hard irregular tip with grooves along its travel. */
export class ScratchBrush {
  readonly #cache = new Map<number, Nib>();

  get(width: number, direction: number, variant: number): Nib {
    const key = Math.round(width * 2) * 128 + direction * 4 + variant;
    const cached = this.#cache.get(key);
    if (cached !== undefined) return cached;
    const size = width + 3;
    const pixels = Math.ceil(size * RESOLUTION);
    const canvas = document.createElement('canvas');
    canvas.width = pixels;
    canvas.height = pixels;
    const ctx = context2D(canvas);
    const image = ctx.createImageData(pixels, pixels);
    const angle = (direction / DIRECTIONS) * Math.PI * 2;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    for (let y = 0; y < pixels; y++) {
      for (let x = 0; x < pixels; x++) {
        const dx = ((x + 0.5) / pixels) * size - size / 2;
        const dy = ((y + 0.5) / pixels) * size - size / 2;
        const along = dx * cosine + dy * sine;
        const across = -dx * sine + dy * cosine;
        const theta = Math.atan2(across, along);
        const radius =
          (width / 2) *
          (1 + Math.sin(theta * 7 + variant * 2) * 0.07 + Math.cos(theta * 11 - variant) * 0.035);
        const distance = Math.hypot(along / 0.92, across);
        const edge = Math.max(0, Math.min(1, (radius - distance) * RESOLUTION));
        const grain = hash(variant + 17, x, y) / 4294967296;
        const groove = Math.sin(across * RESOLUTION * 3.1 + variant) > 0.68 ? 0.24 : 0.77;
        const opacity = grain < 0.13 ? 0.035 : groove * (0.62 + grain * 0.38);
        const index = (y * pixels + x) * 4;
        image.data[index + 3] = Math.round(edge * opacity * 255);
      }
    }
    ctx.putImageData(image, 0, 0);
    const nib = { canvas, size };
    this.#cache.set(key, nib);
    return nib;
  }
}
