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

export async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await expect
    .poll(
      () =>
        page.locator('.wax-layer').evaluate((canvas: HTMLCanvasElement) => {
          const context = canvas.getContext('2d');
          if (context === null) throw new Error('Canvas 2D is unavailable.');
          const data = context.getImageData(
            Math.floor(canvas.width / 2) - 64,
            Math.floor(canvas.height / 2) - 64,
            128,
            128,
          ).data;
          let total = 0;
          let count = 0;
          for (const [index, value] of data.entries()) {
            if (index % 4 === 3) {
              total += value;
              count += 1;
            }
          }
          return total / count;
        }),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(200);
}

export function alphaAt(page: Page, x: number, y: number, radius = 2): Promise<number> {
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
      let minimum = 255;
      for (const [index, value] of pixels.entries()) {
        if (index % 4 === 3) minimum = Math.min(minimum, value);
      }
      return minimum;
    },
    { x, y, radius },
  );
}

export function meanAlphaAt(page: Page, x: number, y: number, radius = 3): Promise<number> {
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
      for (const [index, value] of pixels.entries()) {
        if (index % 4 === 3) {
          total += value;
          count += 1;
        }
      }
      return total / count;
    },
    { x, y, radius },
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
