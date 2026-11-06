import { context2D } from './canvas';
import { paperTransform } from './geometry';
import type { Point, Surface } from './geometry';
import { blackGrain, crayonGrain, holeTile } from './grain';
import type { Color } from './grain';
import { hash, random } from './random';

const COLORS: readonly Color[] = [
  [238, 58, 70],
  [244, 136, 47],
  [245, 202, 61],
  [95, 206, 70],
  [51, 192, 193],
  [63, 130, 228],
  [156, 90, 216],
  [233, 73, 145],
];
const MAX_CELL = 220;
const MIN_CELL = 88;

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

function patternAt(patterns: readonly CanvasPattern[], index: number): CanvasPattern {
  const pattern = patterns[index];
  if (pattern === undefined) throw new RangeError('Unknown crayon pigment.');
  return pattern;
}

interface Pigments {
  readonly base: CanvasPattern;
  readonly light: CanvasPattern;
  readonly dark: CanvasPattern;
}

function silhouettePath(right: readonly Point[], left: readonly Point[]): Path2D {
  const path = new Path2D();
  for (const [index, edge] of right.entries()) {
    if (index === 0) path.moveTo(edge.x, edge.y);
    else path.lineTo(edge.x, edge.y);
  }
  for (let i = left.length - 1; i >= 0; i--) {
    const edge = left[i];
    if (edge !== undefined) path.lineTo(edge.x, edge.y);
  }
  path.closePath();
  return path;
}

export class PaperTextures {
  readonly #colorTiles: HTMLCanvasElement[];
  readonly #lightTiles: HTMLCanvasElement[];
  readonly #darkTiles: HTMLCanvasElement[];
  readonly #waxTile: HTMLCanvasElement;
  readonly #holeTile: HTMLCanvasElement;

  readonly #seed: number;

  constructor(seed: number) {
    this.#seed = seed;
    this.#colorTiles = COLORS.map((color) => crayonGrain(color, seed, 'base'));
    this.#lightTiles = COLORS.map((color) => crayonGrain(color, hash(seed, 7, 1), 'light'));
    this.#darkTiles = COLORS.map((color) => crayonGrain(color, hash(seed, 7, 2), 'dark'));
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
    const lightPatterns = this.#lightTiles.map((tile) => this.#pattern(ctx, tile));
    const darkPatterns = this.#darkTiles.map((tile) => this.#pattern(ctx, tile));
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
        this.#paintPatch(ctx, patch, {
          base: patternAt(patterns, patch.color),
          light: patternAt(lightPatterns, patch.color),
          dark: patternAt(darkPatterns, patch.color),
        });
      }
    }
  }

  #paintPatch(ctx: CanvasRenderingContext2D, patch: Patch, pigments: Pigments): void {
    const next = random(patch.seed ^ 0x53a8f0e7);
    const cosine = Math.cos(patch.angle);
    const sine = Math.sin(patch.angle);
    const height = patch.radius * 0.78;
    const rows = Math.ceil((height * 2) / 3.4);
    const pigment = new Path2D();
    const lightRows = new Path2D();
    const darkRows = new Path2D();
    const lightPools = new Path2D();
    const darkPools = new Path2D();
    const strands = new Path2D();
    const right: Point[] = [];
    const left: Point[] = [];
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
      right.push(point(end + 4, y));
      left.push(point(start - 4, y));
      if (next() > 0.45) rowPath(lightRows, start + 4, end - 4, y + 1.1, bend);
      if (next() > 0.5) rowPath(darkRows, start + 4, end - 4, y - 1.1, bend);
      if (next() > 0.86) rowPath(next() > 0.5 ? lightPools : darkPools, start, end, y, bend);
      if (next() > 0.72) rowPath(strands, start - next() * 7, end + next() * 7, y + 1.5, bend);
    }
    ctx.save();
    ctx.clip(silhouettePath(right, left));
    ctx.lineCap = 'round';
    ctx.strokeStyle = pigments.base;
    ctx.lineWidth = 6.4;
    ctx.stroke(pigment);
    ctx.globalAlpha = 0.12;
    ctx.lineWidth = patch.radius * 0.55;
    ctx.strokeStyle = pigments.light;
    ctx.stroke(lightPools);
    ctx.strokeStyle = pigments.dark;
    ctx.stroke(darkPools);
    ctx.globalAlpha = 0.38;
    ctx.lineWidth = 4.6;
    ctx.strokeStyle = pigments.light;
    ctx.stroke(lightRows);
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = pigments.dark;
    ctx.stroke(darkRows);
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = pigments.base;
    ctx.stroke(strands);
    ctx.restore();
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
