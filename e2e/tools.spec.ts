import { expect, test } from '@playwright/test';

import { alphaAt, line, ready, viewport } from './helpers';

test('fill black paints the wax back, and undo and redo treat it as a stroke', async ({ page }) => {
  await ready(page);
  const size = viewport(page);
  const x = Math.floor(size.width / 2);
  const y = Math.floor(size.height * 0.35);
  await line(page, { x: x - 40, y }, { x: x + 40, y });
  await expect.poll(() => alphaAt(page, x, y)).toBeLessThan(220);
  await page.getByRole('button', { name: 'Fill black' }).click();
  await line(page, { x: x - 40, y }, { x: x + 40, y });
  await expect.poll(() => alphaAt(page, x, y)).toBeGreaterThan(160);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => alphaAt(page, x, y)).toBeLessThan(220);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect.poll(() => alphaAt(page, x, y)).toBeGreaterThan(160);
  await page.getByRole('button', { name: 'Scratch' }).click();
  await line(page, { x: x - 40, y }, { x: x + 40, y });
  await expect.poll(() => alphaAt(page, x, y)).toBeLessThan(220);
});

test('ctrl+wheel zooms the paper and drawing stays aligned', async ({ page }, info) => {
  if (info.project.name === 'iphone') test.skip();
  await ready(page);
  const size = viewport(page);
  const x = Math.floor(size.width / 2);
  const y = Math.floor(size.height * 0.4);
  const paper = page.locator('.paper');
  const before = await paper.boundingBox();
  await page.mouse.move(x, y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -600);
  await page.keyboard.up('Control');
  await expect
    .poll(async () => (await paper.boundingBox())?.width ?? 0)
    .toBeGreaterThan((before?.width ?? 0) * 1.5);
  await line(page, { x: x - 30, y }, { x: x + 30, y });
  await expect.poll(() => alphaAt(page, x, y)).toBeLessThan(220);
});
