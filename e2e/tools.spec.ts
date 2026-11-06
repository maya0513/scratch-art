import { expect, test } from '@playwright/test';

import { alphaAt, line, ready, regionPixels, viewport } from './helpers';

test('fill black restores the original wax, and undo and redo treat it as a stroke', async ({
  page,
}) => {
  await ready(page);
  const size = viewport(page);
  const x = Math.floor(size.width / 2);
  const y = Math.floor(size.height * 0.35);
  const original = await regionPixels(page, x, y, 40, 5);
  // A refill blits the pristine coating back, so the stroked band must come
  // back as the same image: most pixels byte-identical, the rest within a
  // step or two where the nib left residue for the blit to top up. A refill
  // painted any other way (the old nib stamps were flat black) matches
  // almost none of it.
  const restoration = async (): Promise<{ exact: number; meanAbs: number }> => {
    const now = await regionPixels(page, x, y, 40, 5);
    let exact = 0;
    let pixels = 0;
    let absTotal = 0;
    for (let offset = 0; offset < now.length; offset += 4) {
      pixels += 1;
      let same = true;
      for (let channel = 0; channel < 4; channel++) {
        const diff = Math.abs((now[offset + channel] ?? 0) - (original[offset + channel] ?? 0));
        absTotal += diff;
        if (diff !== 0) same = false;
      }
      if (same) exact += 1;
    }
    return { exact: exact / pixels, meanAbs: absTotal / (pixels * 4) };
  };
  const expectRestored = async (): Promise<void> => {
    await expect.poll(async () => (await restoration()).exact).toBeGreaterThanOrEqual(0.6);
    expect((await restoration()).meanAbs).toBeLessThanOrEqual(1.5);
  };
  await line(page, { x: x - 40, y }, { x: x + 40, y });
  await expect.poll(() => alphaAt(page, x, y)).toBeLessThan(220);
  await page.getByRole('button', { name: 'Fill black' }).click();
  await line(page, { x: x - 40, y }, { x: x + 40, y });
  await expectRestored();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => alphaAt(page, x, y)).toBeLessThan(220);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expectRestored();
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
