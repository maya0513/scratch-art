import { paperTransform } from './geometry';
import type { Surface } from './geometry';
import { blackGrain, holeTile, tilePattern } from './grain';
import { hash, random } from './random';

/** The black crayon coating: layered strokes over a veil, with paper tooth. */
export class WaxCoating {
  readonly #waxTile: HTMLCanvasElement;
  readonly #holeTile: HTMLCanvasElement;
  readonly #seed: number;

  constructor(seed: number) {
    this.#seed = seed;
    this.#waxTile = blackGrain(seed);
    this.#holeTile = holeTile(seed);
  }

  paint(ctx: CanvasRenderingContext2D, surface: Surface): void {
    paperTransform(ctx, surface);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const next = random(hash(this.#seed, 41, 17, 3));
    const { width, height } = surface;
    const minDim = Math.min(width, height);
    ctx.fillStyle = 'rgba(13,13,17,0.88)';
    ctx.fillRect(-width / 2, -height / 2, width, height);
    ctx.strokeStyle = tilePattern(ctx, this.#waxTile);
    ctx.lineCap = 'round';
    const baseAngle = -0.62 + (next() - 0.5) * 0.24;
    this.#strokePass(ctx, next, surface, baseAngle, minDim * 0.0128, minDim * 0.021, 0.985);
    this.#strokePass(ctx, next, surface, baseAngle + 0.15, minDim * 0.0165, minDim * 0.017, 0.855);
    this.#strokePass(ctx, next, surface, baseAngle - 0.5, minDim * 0.03, minDim * 0.013, 0.625);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    ctx.fillStyle = tilePattern(ctx, this.#holeTile);
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
