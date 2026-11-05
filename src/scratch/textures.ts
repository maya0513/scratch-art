import { context2D } from './canvas';
import { paperTransform } from './geometry';
import type { Point, Surface } from './geometry';
import { hash, random } from './random';

type Color = readonly [number, number, number];
const COLORS: readonly Color[] = [
  [234, 69, 80],
  [242, 139, 53],
  [249, 207, 69],
  [112, 182, 96],
  [61, 173, 174],
  [70, 127, 211],
  [147, 99, 190],
  [221, 85, 146],
];
const CELL = 220;
const GRAIN_SIZE = 256;

export interface Patch {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly radius: number;
  readonly color: number;
  readonly seed: number;
}

export function crayonPatch(seed: number, column: number, row: number): Patch {
  const patchSeed = hash(seed, column, row);
  const next = random(patchSeed);
  return {
    x: column * CELL + (next() - 0.5) * CELL * 0.4,
    y: row * CELL + (next() - 0.5) * CELL * 0.4,
    radius: CELL * (0.92 + next() * 0.4),
    angle: next() * Math.PI,
    color: Math.floor(next() * COLORS.length),
    seed: patchSeed,
  };
}

function textureCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = GRAIN_SIZE;
  canvas.height = GRAIN_SIZE;
  const context = context2D(canvas);
  return [canvas, context];
}

/** Grain belongs to the paper, rather than moving with each colored stroke. */
function crayonGrain(color: Color, seed: number): HTMLCanvasElement {
  const [canvas, ctx] = textureCanvas();
  const pixels = ctx.createImageData(GRAIN_SIZE, GRAIN_SIZE);
  const [red, green, blue] = color;
  for (let y = 0; y < GRAIN_SIZE; y++) {
    for (let x = 0; x < GRAIN_SIZE; x++) {
      const fine = hash(seed, x, y) / 4294967296;
      const tooth = hash(seed, Math.floor(x / 3), Math.floor(y / 3), 1) / 4294967296;
      const fiber = Math.sin(y * 1.7 + Math.sin(x * 0.05) * 2) * 0.025;
      const pigment = 0.79 + fine * 0.21 + tooth * 0.13 + fiber;
      const pore = Math.max(0, (fine - 0.87) / 0.13) * (0.22 + tooth * 0.23);
      const index = (y * GRAIN_SIZE + x) * 4;
      const wax = pigment * (1 - pore);
      pixels.data[index] = red * wax + 239 * pore;
      pixels.data[index + 1] = green * wax + 224 * pore;
      pixels.data[index + 2] = blue * wax + 196 * pore;
      pixels.data[index + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

function blackGrain(seed: number): HTMLCanvasElement {
  const [canvas, ctx] = textureCanvas();
  const pixels = ctx.createImageData(GRAIN_SIZE, GRAIN_SIZE);
  for (let y = 0; y < GRAIN_SIZE; y++) {
    for (let x = 0; x < GRAIN_SIZE; x++) {
      const fine = hash(seed, x, y, 9) / 4294967296;
      const tooth = hash(seed, Math.floor(x / 3), Math.floor(y / 3), 1) / 4294967296;
      const ridge = Math.sin(y * 1.9 + Math.sin(x * 0.025) * 2.5);
      const value = 10 + fine * 8 + tooth * 4 + ridge * 1.4;
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

function patternAt(patterns: readonly CanvasPattern[], index: number): CanvasPattern {
  const pattern = patterns[index];
  if (pattern === undefined) throw new RangeError('Unknown crayon pigment.');
  return pattern;
}

export class PaperTextures {
  readonly #colorTiles: HTMLCanvasElement[];
  readonly #waxTile: HTMLCanvasElement;

  readonly #seed: number;

  constructor(seed: number) {
    this.#seed = seed;
    this.#colorTiles = COLORS.map((color) => crayonGrain(color, seed));
    this.#waxTile = blackGrain(seed);
  }

  #pattern(ctx: CanvasRenderingContext2D, tile: HTMLCanvasElement): CanvasPattern {
    const pattern = ctx.createPattern(tile, 'repeat');
    if (pattern === null) throw new Error('Cannot create a paper texture.');
    pattern.setTransform(new DOMMatrix().scale(0.5));
    return pattern;
  }

  paintColor(ctx: CanvasRenderingContext2D, surface: Surface): void {
    paperTransform(ctx, surface);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const patterns = this.#colorTiles.map((tile) => this.#pattern(ctx, tile));
    ctx.fillStyle = patternAt(patterns, this.#seed % COLORS.length);
    ctx.fillRect(-surface.width / 2, -surface.height / 2, surface.width, surface.height);

    // Include neighboring patches that can reach the paper's edges.
    const firstColumn = Math.floor(-surface.width / 2 / CELL) - 2;
    const lastColumn = Math.ceil(surface.width / 2 / CELL) + 2;
    const firstRow = Math.floor(-surface.height / 2 / CELL) - 2;
    const lastRow = Math.ceil(surface.height / 2 / CELL) + 2;
    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = firstColumn; column <= lastColumn; column++) {
        const patch = crayonPatch(this.#seed, column, row);
        const reach = patch.radius * 1.3 + 12;
        if (
          Math.abs(patch.x) > surface.width / 2 + reach ||
          Math.abs(patch.y) > surface.height / 2 + reach
        )
          continue;
        this.#paintPatch(ctx, patch, patternAt(patterns, patch.color));
      }
    }
  }

  #paintPatch(ctx: CanvasRenderingContext2D, patch: Patch, pattern: CanvasPattern): void {
    const next = random(patch.seed ^ 0x53a8f0e7);
    const cosine = Math.cos(patch.angle);
    const sine = Math.sin(patch.angle);
    const height = patch.radius * 0.78;
    const rows = Math.ceil((height * 2) / 3.4);
    const pigment = new Path2D();
    const strands = new Path2D();
    const lightRidges = new Path2D();
    const darkRidges = new Path2D();
    // Work in paper coordinates so all pigments share the same underlying tooth.
    const point = (x: number, localY: number): Point => ({
      x: patch.x + x * cosine - localY * sine,
      y: patch.y + x * sine + localY * cosine,
    });
    const rowPath = (path: Path2D, start: number, end: number, y: number, bend: number): void => {
      const from = point(start, y);
      const first = point(start * 0.4, y + bend);
      const second = point(end * 0.4, y - bend);
      const to = point(end, y + bend * 0.35);
      path.moveTo(from.x, from.y);
      path.bezierCurveTo(first.x, first.y, second.x, second.y, to.x, to.y);
    };
    for (let i = 0; i <= rows; i++) {
      const normalized = (i / rows) * 2 - 1;
      const profile = Math.pow(Math.max(0, 1 - normalized ** 4), 0.25);
      const y = normalized * height + (next() - 0.5) * 1.6;
      const start = -patch.radius * profile * (0.79 + next() * 0.19);
      const end = patch.radius * profile * (0.77 + next() * 0.21);
      const bend = (next() - 0.5) * 4;
      rowPath(pigment, start, end, y, bend);

      // Uneven stroke ends and dry strands replace a sharply clipped silhouette.
      if (next() > 0.72) {
        rowPath(strands, start - next() * 7, end + next() * 7, y + 1.5, bend);
      }
      if (next() > 0.55) {
        rowPath(next() > 0.45 ? lightRidges : darkRidges, start + 4, end - 4, y + 0.7, bend);
      }
    }

    // One textured stroke per path avoids repeatedly rasterizing the same grain.
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = pattern;
    ctx.lineWidth = 6.4;
    ctx.stroke(pigment);
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.stroke(strands);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(255,239,196,0.065)';
    ctx.stroke(lightRidges);
    ctx.strokeStyle = 'rgba(30,20,18,0.06)';
    ctx.stroke(darkRidges);
    ctx.restore();
  }

  paintWax(ctx: CanvasRenderingContext2D, surface: Surface): void {
    paperTransform(ctx, surface);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.#pattern(ctx, this.#waxTile);
    ctx.fillRect(-surface.width / 2, -surface.height / 2, surface.width, surface.height);
    const size = 300;
    for (
      let row = Math.floor(-surface.height / 2 / size) - 1;
      row <= Math.ceil(surface.height / 2 / size) + 1;
      row++
    ) {
      for (
        let column = Math.floor(-surface.width / 2 / size) - 1;
        column <= Math.ceil(surface.width / 2 / size) + 1;
        column++
      ) {
        const next = random(hash(this.#seed, column, row, 28));
        ctx.save();
        ctx.translate(column * size, row * size);
        ctx.rotate((next() - 0.5) * 0.65);
        for (let i = 0; i < 48; i++) {
          const y = (next() - 0.5) * size;
          ctx.strokeStyle = next() > 0.4 ? 'rgba(176,172,166,0.018)' : 'rgba(0,0,0,0.09)';
          ctx.lineWidth = 0.3 + next() * 2;
          ctx.beginPath();
          ctx.moveTo(-size * 0.6, y);
          ctx.quadraticCurveTo(0, y + (next() - 0.5) * 5, size * 0.6, y + (next() - 0.5) * 5);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }
}
