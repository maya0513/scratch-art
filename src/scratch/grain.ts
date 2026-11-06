import { context2D } from './canvas';
import { hash } from './random';

export type Color = readonly [number, number, number];
export type Tone = 'dark' | 'base' | 'light';

const GRAIN_SIZE = 256;

function textureCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = GRAIN_SIZE;
  canvas.height = GRAIN_SIZE;
  const context = context2D(canvas);
  return [canvas, context];
}

/** Grain belongs to the paper, rather than moving with each colored stroke. */
export function crayonGrain(color: Color, seed: number, tone: Tone): HTMLCanvasElement {
  const [canvas, ctx] = textureCanvas();
  const pixels = ctx.createImageData(GRAIN_SIZE, GRAIN_SIZE);
  const mix = tone === 'light' ? 0.22 : 0;
  const scale = tone === 'dark' ? 0.8 : 1;
  const red = color[0] + (239 - color[0]) * mix;
  const green = color[1] + (224 - color[1]) * mix;
  const blue = color[2] + (196 - color[2]) * mix;
  for (let y = 0; y < GRAIN_SIZE; y++) {
    for (let x = 0; x < GRAIN_SIZE; x++) {
      const fine = hash(seed, x, y) / 4294967296;
      const tooth = hash(seed, Math.floor(x / 3), Math.floor(y / 3), 1) / 4294967296;
      const fiber = Math.sin(y * 1.7 + Math.sin(x * 0.05) * 2) * 0.025;
      const pigment = 0.79 + fine * 0.21 + tooth * 0.13 + fiber;
      const pore = Math.max(0, (fine - 0.87) / 0.13) * (0.22 + tooth * 0.23);
      const index = (y * GRAIN_SIZE + x) * 4;
      const wax = pigment * (1 - pore) * scale;
      pixels.data[index] = red * wax + 239 * pore;
      pixels.data[index + 1] = green * wax + 224 * pore;
      pixels.data[index + 2] = blue * wax + 196 * pore;
      pixels.data[index + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

export function blackGrain(seed: number): HTMLCanvasElement {
  const [canvas, ctx] = textureCanvas();
  const pixels = ctx.createImageData(GRAIN_SIZE, GRAIN_SIZE);
  for (let y = 0; y < GRAIN_SIZE; y++) {
    for (let x = 0; x < GRAIN_SIZE; x++) {
      const fine = hash(seed, x, y, 9) / 4294967296;
      const tooth = hash(seed, Math.floor(x / 3), Math.floor(y / 3), 1) / 4294967296;
      const ridge = Math.sin(y * 1.9 + Math.sin(x * 0.025) * 2.5);
      const value = 9 + fine * 9 + tooth * 5 + ridge * 1.6;
      const index = (y * GRAIN_SIZE + x) * 4;
      pixels.data[index] = value;
      pixels.data[index + 1] = value;
      pixels.data[index + 2] = value + 1;
      pixels.data[index + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

export function holeTile(seed: number): HTMLCanvasElement {
  const [canvas, ctx] = textureCanvas();
  const pixels = ctx.createImageData(GRAIN_SIZE, GRAIN_SIZE);
  for (let y = 0; y < GRAIN_SIZE; y++) {
    for (let x = 0; x < GRAIN_SIZE; x++) {
      const fine = hash(seed, x, y, 21) / 4294967296;
      const tooth = hash(seed, Math.floor(x / 3), Math.floor(y / 3), 22) / 4294967296;
      const strength = Math.max(0, fine * 0.55 + tooth * 0.45 - 0.905) / 0.095;
      pixels.data[(y * GRAIN_SIZE + x) * 4 + 3] = Math.min(180, strength * 180);
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

/** A repeating pattern of a grain tile, at the scale pigment is laid down. */
export function tilePattern(ctx: CanvasRenderingContext2D, tile: HTMLCanvasElement): CanvasPattern {
  const pattern = ctx.createPattern(tile, 'repeat');
  if (pattern === null) throw new Error('Cannot create a paper texture.');
  pattern.setTransform(new DOMMatrix().scale(0.5));
  return pattern;
}
