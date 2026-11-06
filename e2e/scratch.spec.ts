import { expect, test } from '@playwright/test';

import { alphaAt, centerPixels, dimensions, line, meanAlphaAt, ready, viewport } from './helpers';

test('starts coated, fills the screen, and exposes only one slider', async ({ page }) => {
  await ready(page);
  const result = await page.locator('.wax-layer').evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('Canvas 2D is unavailable.');
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let maximum = 0;
    let minimum = 255;
    let alphaTotal = 0;
    let thin = 0;
    let bright = 0;
    let minimumAlpha = 255;
    let count = 0;
    let lastRed = 0;
    for (const [index, value] of data.entries()) {
      if (index % 4 === 0) lastRed = value;
      if (index % 4 === 3) {
        alphaTotal += value;
        if (value < 153) thin += 1;
        minimumAlpha = Math.min(minimumAlpha, value);
        count += 1;
        const shaded = (lastRed * value) / 255;
        if (shaded >= 65) bright += 1;
        maximum = Math.max(maximum, shaded);
        minimum = Math.min(minimum, shaded);
      }
    }
    const rect = canvas.getBoundingClientRect();
    return {
      mean: alphaTotal / count,
      thin: thin / count,
      bright: bright / count,
      minimumAlpha,
      maximum,
      minimum,
      pixels: canvas.width * canvas.height,
      width: rect.width,
      height: rect.height,
      screenWidth: innerWidth,
      screenHeight: innerHeight,
      overflow: document.documentElement.scrollHeight > innerHeight,
    };
  });
  expect(result.mean).toBeGreaterThan(240);
  expect(result.minimumAlpha).toBeLessThan(210);
  expect(result.thin).toBeLessThan(0.02);
  expect(result.bright).toBeLessThan(0.001);
  expect(result.maximum - result.minimum).toBeGreaterThan(5);
  expect(result.pixels).toBeLessThanOrEqual(6_000_000);
  expect(result.width).toBe(result.screenWidth);
  expect(result.height).toBe(result.screenHeight);
  expect(result.overflow).toBe(false);
  const slider = page.getByRole('slider', { name: 'Scratch width' });
  await expect(slider).toHaveValue('6.5');
  await expect(slider).toHaveAttribute('min', '1');
  await expect(slider).toHaveAttribute('max', '12');
  await expect(page.getByRole('slider')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'New sheet' })).toBeEnabled();
});

test('scratches a dot and a continuous fast line without changing distant wax', async ({
  page,
}) => {
  await ready(page);
  const size = viewport(page);
  const y = Math.floor(size.height * 0.4);
  const start = Math.floor(size.width * 0.2);
  const end = Math.floor(size.width * 0.8);
  const untouched = await centerPixels(page, '.wax-layer');
  await page.mouse.click(size.width / 2, size.height * 0.2);
  await expect.poll(() => alphaAt(page, size.width / 2, size.height * 0.2)).toBeLessThan(230);
  await line(page, { x: start, y }, { x: end, y });
  await expect
    .poll(async () => {
      const values = await Promise.all(
        Array.from({ length: 15 }, (_, i) =>
          alphaAt(page, start + ((end - start) * (i + 0.5)) / 15, y),
        ),
      );
      return values.filter((value) => value < 220).length;
    })
    .toBe(15);
  expect(await centerPixels(page, '.wax-layer')).toEqual(untouched);
});

test('slider changes the scratch width and never scratches the paper itself', async ({
  page,
}, info) => {
  await ready(page);
  const original = await centerPixels(page, '.wax-layer');
  const slider = page.getByRole('slider');
  await slider.focus();
  await slider.press('Home');
  await slider.press('ArrowRight');
  await expect(slider).toHaveValue('1.5');
  expect(await centerPixels(page, '.wax-layer')).toEqual(original);
  const size = viewport(page);
  const x = Math.floor(size.width / 2);
  const thinY = Math.floor(size.height * 0.3);
  const thickY = Math.floor(size.height * 0.6);
  const thinBase = await alphaAt(page, x, thinY + 4, 0.6);
  await line(page, { x: x - 30, y: thinY }, { x: x + 30, y: thinY });
  const box = await slider.boundingBox();
  if (box === null) throw new Error('The width slider must remain visible.');
  const sliderY = box.y + box.height / 2;
  const sliderLeftBase = await alphaAt(page, box.x + 2, sliderY);
  const sliderRightBase = await alphaAt(page, box.x + box.width - 2, sliderY);
  const pointAt = (clientX: number): Promise<void> =>
    info.project.use.hasTouch === true
      ? page.touchscreen.tap(clientX, sliderY)
      : page.mouse.click(clientX, sliderY);
  await pointAt(box.x + box.width - 1);
  await expect(slider).toHaveValue('12');
  await pointAt(box.x + 1);
  await expect(slider).toHaveValue('1');
  await slider.focus();
  await slider.press('End');
  await expect(slider).toHaveValue('12');
  await line(page, { x: x - 30, y: thickY }, { x: x + 30, y: thickY });
  await expect.poll(() => alphaAt(page, x, thickY + 4, 0.6)).toBeLessThan(230);
  expect(await alphaAt(page, x, thinY + 4, 0.6)).toBe(thinBase);
  expect(await alphaAt(page, box.x + 2, sliderY)).toBe(sliderLeftBase);
  expect(await alphaAt(page, box.x + box.width - 2, sliderY)).toBe(sliderRightBase);
});

test('repeated scratching removes more wax', async ({ page }) => {
  await ready(page);
  const size = viewport(page);
  const y = Math.floor(size.height / 2);
  const x = Math.floor(size.width / 2);
  await line(page, { x: x - 40, y }, { x: x + 40, y });
  await expect.poll(() => alphaAt(page, x, y)).toBeLessThan(220);
  const once = await centerPixels(page, '.wax-layer');
  await line(page, { x: x - 40, y }, { x: x + 40, y });
  await expect
    .poll(async () => {
      const after = await centerPixels(page, '.wax-layer');
      return after.filter((value, i) => i % 4 === 3 && value < (once[i] ?? 0)).length;
    })
    .toBeGreaterThan(0);
});

test('keeps the initial paper intact and pointer input aligned after viewport changes', async ({
  page,
}) => {
  await ready(page);
  const size = viewport(page);
  const canvas = page.locator('.wax-layer');
  const initialDimensions = await dimensions(page);
  await line(
    page,
    { x: size.width / 2 - 35, y: size.height / 2 },
    { x: size.width / 2 + 35, y: size.height / 2 },
  );
  const edge = { x: size.width * 0.8, y: size.height * 0.75 };
  await page.mouse.click(edge.x, edge.y);
  await expect.poll(() => alphaAt(page, edge.x, edge.y)).toBeLessThan(230);
  const edgeAlpha = await alphaAt(page, edge.x, edge.y);
  const color = await centerPixels(page, '.color-layer');
  const wax = await centerPixels(page, '.wax-layer');
  await page.setViewportSize({ width: size.height, height: size.width });
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('The paper must remain visible.');
  expect(box.width / box.height).toBeCloseTo(size.width / size.height, 3);
  expect(box.width).toBeLessThanOrEqual(size.height);
  expect(box.height).toBeLessThanOrEqual(size.width);
  expect(await dimensions(page)).toEqual(initialDimensions);
  expect(await centerPixels(page, '.color-layer')).toEqual(color);
  expect(await centerPixels(page, '.wax-layer')).toEqual(wax);
  const point = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.65 };
  await page.mouse.click(point.x, point.y);
  await expect.poll(() => alphaAt(page, point.x, point.y)).toBeLessThan(230);
  await page.setViewportSize(size);
  expect(await centerPixels(page, '.color-layer')).toEqual(color);
  expect(await centerPixels(page, '.wax-layer')).toEqual(wax);
  expect(await alphaAt(page, edge.x, edge.y)).toBe(edgeAlpha);
  expect(await alphaAt(page, size.width * 0.3, size.height * 0.65)).toBeLessThan(230);
});

test('a reload supplies new colors and a freshly coated sheet', async ({ page }) => {
  await ready(page);
  const color = await centerPixels(page, '.color-layer');
  const size = viewport(page);
  await page.mouse.click(size.width / 2, size.height / 2);
  await expect.poll(() => alphaAt(page, size.width / 2, size.height / 2)).toBeLessThan(230);
  await ready(page);
  expect(await centerPixels(page, '.color-layer')).not.toEqual(color);
  await expect.poll(() => meanAlphaAt(page, size.width / 2, size.height / 2)).toBeGreaterThan(200);
});

test('a second touch stops drawing until every pointer has lifted', async ({ page }, info) => {
  await ready(page);
  const size = viewport(page);
  const x = Math.floor(size.width / 2);
  const y = Math.floor(size.height * 0.3);
  if (info.project.use.hasTouch === true) {
    await page.touchscreen.tap(x, y);
    await expect.poll(() => alphaAt(page, x, y)).toBeLessThan(230);
  }
  const canvas = page.locator('.wax-layer');
  const send = (type: string, id: number, kind: string, cx: number, cy: number): Promise<void> =>
    canvas.dispatchEvent(type, { pointerId: id, pointerType: kind, clientX: cx, clientY: cy });
  const spots: [number, number][] = [
    [x, y + 50],
    [x + 30, y + 50],
    [x - 30, y + 80],
    [x, y + 80],
    [x, y + 65],
    [x + 30, y + 110],
  ];
  const baselines = await Promise.all(spots.map(([px, py]) => alphaAt(page, px, py)));
  await send('pointerdown', 21, 'pen', x - 30, y + 50);
  await send('pointerdown', 22, 'touch', x - 30, y + 80);
  await send('pointermove', 21, 'pen', x + 30, y + 50);
  await send('pointermove', 21, 'pen', x - 30, y + 50);
  await send('pointercancel', 21, 'pen', x - 30, y + 50);
  await send('pointerup', 22, 'touch', x + 30, y + 80);
  await send('pointermove', 21, 'pen', x + 30, y + 120);
  await expect.poll(() => alphaAt(page, x - 30, y + 50)).toBeLessThan(220);
  const alphas = await Promise.all(spots.map(([px, py]) => alphaAt(page, px, py)));
  for (const [index, alpha] of alphas.entries()) expect(alpha).toBe(baselines[index] ?? -1);
  await page.mouse.click(x, y + 140);
  await expect.poll(() => alphaAt(page, x, y + 140)).toBeLessThan(230);
  const cancelBase = await alphaAt(page, x + 30, y + 170);
  await send('pointerdown', 31, 'touch', x - 30, y + 170);
  await send('pointermove', 31, 'touch', x, y + 170);
  await send('pointercancel', 31, 'touch', x, y + 170);
  await send('pointermove', 31, 'touch', x + 30, y + 170);
  await expect.poll(() => alphaAt(page, x, y + 170)).toBeLessThan(220);
  expect(await alphaAt(page, x + 30, y + 170)).toBe(cancelBase);
});

test('undo restores the wax and redo scratches it again', async ({ page }) => {
  await ready(page);
  const size = viewport(page);
  const x = Math.floor(size.width / 2);
  const y = Math.floor(size.height * 0.35);
  const base = await alphaAt(page, x, y);
  await line(page, { x: x - 40, y }, { x: x + 40, y });
  await expect.poll(() => alphaAt(page, x, y)).toBeLessThan(220);
  const undo = page.getByRole('button', { name: 'Undo' });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect.poll(() => alphaAt(page, x, y)).toBe(base);
  await expect(undo).toBeDisabled();
  const redo = page.getByRole('button', { name: 'Redo' });
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect.poll(() => alphaAt(page, x, y)).toBeLessThan(220);
});

test('starting a new sheet asks first, then replaces colors and wax', async ({ page }) => {
  await ready(page);
  const size = viewport(page);
  const x = Math.floor(size.width / 2);
  const y = Math.floor(size.height * 0.35);
  const color = await centerPixels(page, '.color-layer');
  await line(page, { x: x - 40, y }, { x: x + 40, y });
  await expect.poll(() => alphaAt(page, x, y)).toBeLessThan(220);
  await page.getByRole('button', { name: 'New sheet' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect(await alphaAt(page, x, y)).toBeLessThan(220);
  await page.getByRole('button', { name: 'New sheet' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'New sheet' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect.poll(() => meanAlphaAt(page, x, y)).toBeGreaterThan(200);
  expect(await centerPixels(page, '.color-layer')).not.toEqual(color);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
});
