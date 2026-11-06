import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

interface Size {
  readonly width: number;
  readonly height: number;
}

interface Position {
  readonly x: number;
  readonly y: number;
}

interface AlphaSample {
  readonly mean: number;
  readonly minimum: number;
}

export function viewport(page: Page): Size {
  const size = page.viewportSize();
  if (size === null) throw new Error('Tests require a fixed viewport.');
  return size;
}

export function dimensions(page: Page): Promise<Size> {
  return page.locator('.wax-layer').evaluate((canvas: HTMLCanvasElement) => ({
    width: canvas.width,
    height: canvas.height,
  }));
}

/** Mean and minimum wax alpha in a disc around a client point. */
function sampleAlpha(page: Page, x: number, y: number, radius: number): Promise<AlphaSample> {
  return page.locator('.wax-layer').evaluate(
    (canvas: HTMLCanvasElement, point) => {
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('Canvas 2D is unavailable.');
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width;
      const sy = canvas.height / rect.height;
      const pixels = context.getImageData(
        Math.floor((point.x - rect.left - point.radius) * sx),
        Math.floor((point.y - rect.top - point.radius) * sy),
        Math.max(1, Math.ceil(point.radius * 2 * sx)),
        Math.max(1, Math.ceil(point.radius * 2 * sy)),
      ).data;
      let total = 0;
      let count = 0;
      let minimum = 255;
      for (const [index, value] of pixels.entries()) {
        if (index % 4 === 3) {
          total += value;
          count += 1;
          minimum = Math.min(minimum, value);
        }
      }
      return { mean: total / count, minimum };
    },
    { x, y, radius },
  );
}

export async function ready(page: Page): Promise<void> {
  await page.goto('/');
  const size = viewport(page);
  await expect
    .poll(async () => (await sampleAlpha(page, size.width / 2, size.height / 2, 64)).mean, {
      // Painting a sheet is CPU-bound; allow for a heavily loaded machine.
      timeout: 30_000,
    })
    .toBeGreaterThan(200);
}

export async function alphaAt(page: Page, x: number, y: number, radius = 2): Promise<number> {
  return (await sampleAlpha(page, x, y, radius)).minimum;
}

export async function meanAlphaAt(page: Page, x: number, y: number, radius = 3): Promise<number> {
  return (await sampleAlpha(page, x, y, radius)).mean;
}

/** Raw RGBA of the wax in a block around a client point, in device pixels. */
export function regionPixels(
  page: Page,
  cx: number,
  cy: number,
  halfWidth: number,
  halfHeight: number,
): Promise<readonly number[]> {
  return page.locator('.wax-layer').evaluate(
    (canvas: HTMLCanvasElement, block) => {
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('Canvas 2D is unavailable.');
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width;
      const sy = canvas.height / rect.height;
      const x = Math.floor((block.cx - rect.left - block.halfWidth) * sx);
      const y = Math.floor((block.cy - rect.top - block.halfHeight) * sy);
      const width = Math.ceil(block.halfWidth * 2 * sx);
      const height = Math.ceil(block.halfHeight * 2 * sy);
      return Array.from(context.getImageData(x, y, width, height).data);
    },
    { cx, cy, halfWidth, halfHeight },
  );
}

export function centerPixels(page: Page, layer: string): Promise<number[]> {
  return page.locator(layer).evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('Canvas 2D is unavailable.');
    return Array.from(
      context.getImageData(
        Math.floor(canvas.width / 2) - 8,
        Math.floor(canvas.height / 2) - 8,
        16,
        16,
      ).data,
    );
  });
}

export async function line(page: Page, start: Position, end: Position): Promise<void> {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 2 });
  await page.mouse.up();
  // Pointer input is queued until the next animation frame.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      }),
  );
}
