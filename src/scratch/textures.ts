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
const MAX_CELL = 220;
const MIN_CELL = 88;
const GRAIN_SIZE = 256;

export function colorCellSize(width: number, height: number): number {
  return Math.min(MAX_CELL, Math.max(MIN_CELL, Math.min(width, height) / 3));
}

export interface Patch {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly radius: number;
  readonly color: number;
  readonly seed: number;
}

export function crayonPatch(seed: number, column: number, row: number, cell: number): Patch {
  const patchSeed = hash(seed, column, row);
  const next = random(patchSeed);
  return {
    x: column * cell + (next() - 0.5) * cell * 0.4,
    y: row * cell + (next() - 0.5) * cell * 0.4,
    radius: cell * (0.92 + next() * 0.4),
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

function holeTile(seed: number): HTMLCanvasElement {
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

function patternAt(patterns: readonly CanvasPattern[], index: number): CanvasPattern {
  const pattern = patterns[index];
  if (pattern === undefined) throw new RangeError('Unknown crayon pigment.');
  return pattern;
}

export class PaperTextures {
  readonly #colorTiles: HTMLCanvasElement[];
  readonly #waxTile: HTMLCanvasElement;
  readonly #holeTile: HTMLCanvasElement;

  readonly #seed: number;

  constructor(seed: number) {
    this.#seed = seed;
    this.#colorTiles = COLORS.map((color) => crayonGrain(color, seed));
    this.#waxTile = blackGrain(seed);
    this.#holeTile = holeTile(seed);
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
    const cell = colorCellSize(surface.width, surface.height);
    const firstColumn = Math.floor(-surface.width / 2 / cell) - 2;
    const lastColumn = Math.ceil(surface.width / 2 / cell) + 2;
    const firstRow = Math.floor(-surface.height / 2 / cell) - 2;
    const lastRow = Math.ceil(surface.height / 2 / cell) + 2;
    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = firstColumn; column <= lastColumn; column++) {
        const patch = crayonPatch(this.#seed, column, row, cell);
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
    const next = random(hash(this.#seed, 41, 17, 3));
    const { width, height } = surface;
    const minDim = Math.min(width, height);
    ctx.fillStyle = 'rgba(13,13,17,0.88)';
    ctx.fillRect(-width / 2, -height / 2, width, height);
    ctx.strokeStyle = this.#pattern(ctx, this.#waxTile);
    ctx.lineCap = 'round';
    const baseAngle = -0.62 + (next() - 0.5) * 0.24;
    this.#strokePass(ctx, next, surface, baseAngle, minDim * 0.0128, minDim * 0.021, 0.985);
    this.#strokePass(ctx, next, surface, baseAngle + 0.15, minDim * 0.0165, minDim * 0.017, 0.855);
    this.#strokePass(ctx, next, surface, baseAngle - 0.5, minDim * 0.03, minDim * 0.013, 0.625);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.#pattern(ctx, this.#holeTile);
    ctx.fillRect(-width / 2, -height / 2, width, height);
    this.#speckle(ctx, next, surface);
    ctx.globalAlpha = 1;
  }

  #strokePass(
    ctx: CanvasRenderingContext2D,
    next: () => number,
    surface: Surface,
    angle: number,
    spacing: number,
    strokeWidth: number,
    alpha: number,
  ): void {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const diag = Math.hypot(surface.width, surface.height);
    for (let d = -diag / 2; d < diag / 2; d += spacing * (0.75 + next() * 0.5)) {
      const cx = -dy * d + (next() - 0.5) * spacing;
      const cy = dx * d + (next() - 0.5) * spacing;
      const length = diag * (0.92 + next() * 0.2);
      const segments = 6;
      let px = cx - (dx * length) / 2;
      let py = cy - (dy * length) / 2;
      for (let s = 1; s <= segments; s++) {
        const t = s / segments;
        const wander = s === segments ? 0 : (next() - 0.5) * strokeWidth * 0.35;
        const qx = cx + dx * length * (t - 0.5) - dy * wander;
        const qy = cy + dy * length * (t - 0.5) + dx * wander;
        ctx.globalAlpha = Math.min(1, alpha * (0.78 + next() * 0.4));
        ctx.lineWidth = strokeWidth * (0.7 + next() * 0.6);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(qx, qy);
        ctx.stroke();
        px = qx;
        py = qy;
      }
    }
  }

  #speckle(ctx: CanvasRenderingContext2D, next: () => number, surface: Surface): void {
    const scale = surface.pixelWidth / surface.width;
    const area = surface.pixelWidth * surface.pixelHeight;
    const left = -surface.width / 2;
    const top = -surface.height / 2;
    ctx.globalCompositeOperation = 'source-over';
    const flecks = Math.round(area * 0.0019);
    for (let i = 0; i < flecks; i++) {
      const size = (1 + next() * 2.6) / scale;
      ctx.globalAlpha = 0.05 + next() * 0.15;
      ctx.fillStyle = next() > 0.5 ? 'rgb(196,188,172)' : 'rgb(70,72,84)';
      ctx.fillRect(left + next() * surface.width, top + next() * surface.height, size, size);
    }
  }
}
