/* eslint-disable typescript/no-unsafe-type-assertion -- Test doubles cross
   the DOM type boundary on purpose: they are the one place a hand-built
   object must stand in for a canvas or element, and every crossing is
   verified by the behaviour tests that use them. */
// In-memory stand-ins for the small slice of DOM canvas the unit tests
// exercise. The fake canvas keeps a real pixel buffer, so crop, restore
// and transform assertions read actual data rather than recorded calls.

interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const rasters = new WeakMap<object, Raster>();

function rasterOf(canvas: HTMLCanvasElement): Raster {
  const raster = rasters.get(canvas);
  if (raster === undefined) throw new Error('Not a fake canvas.');
  return raster;
}

function createRaster(width: number, height: number): Raster {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

class FakeCanvas {
  readonly #raster: Raster;
  readonly #context: CanvasRenderingContext2D;

  constructor(width = 300, height = 150) {
    const raster = createRaster(width, height);
    this.#raster = raster;
    this.#context = {
      globalAlpha: 1,
      globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
      setTransform(): void {
        // The history only ever resets to the identity transform.
      },
      clearRect(x: number, y: number, w: number, h: number): void {
        for (let row = y; row < y + h; row++) {
          for (let column = x; column < x + w; column++) {
            if (column < 0 || row < 0 || column >= raster.width || row >= raster.height) continue;
            const offset = (row * raster.width + column) * 4;
            raster.data.fill(0, offset, offset + 4);
          }
        }
      },
      drawImage(source: HTMLCanvasElement, ...args: readonly number[]): void {
        const sourceRaster = rasters.get(source);
        if (sourceRaster === undefined) throw new Error('Not a fake canvas.');
        const regional = args.length >= 8;
        const sx = regional ? (args[0] ?? 0) : 0;
        const sy = regional ? (args[1] ?? 0) : 0;
        const sw = regional ? (args[2] ?? 0) : sourceRaster.width;
        const sh = regional ? (args[3] ?? 0) : sourceRaster.height;
        const dx = regional ? (args[4] ?? 0) : (args[0] ?? 0);
        const dy = regional ? (args[5] ?? 0) : (args[1] ?? 0);
        const dw = regional ? (args[6] ?? 0) : sourceRaster.width;
        const dh = regional ? (args[7] ?? 0) : sourceRaster.height;
        for (let row = 0; row < dh; row++) {
          const sourceRow = sy + Math.floor((row * sh) / dh);
          const targetRow = dy + row;
          if (sourceRow < 0 || sourceRow >= sourceRaster.height) continue;
          if (targetRow < 0 || targetRow >= raster.height) continue;
          for (let column = 0; column < dw; column++) {
            const sourceColumn = sx + Math.floor((column * sw) / dw);
            const targetColumn = dx + column;
            if (sourceColumn < 0 || sourceColumn >= sourceRaster.width) continue;
            if (targetColumn < 0 || targetColumn >= raster.width) continue;
            const from = (sourceRow * sourceRaster.width + sourceColumn) * 4;
            const to = (targetRow * raster.width + targetColumn) * 4;
            raster.data.set(sourceRaster.data.subarray(from, from + 4), to);
          }
        }
      },
    } as unknown as CanvasRenderingContext2D;
    rasters.set(this, raster);
  }

  get width(): number {
    return this.#raster.width;
  }

  set width(value: number) {
    this.#resize(value, this.#raster.height);
  }

  get height(): number {
    return this.#raster.height;
  }

  set height(value: number) {
    this.#resize(this.#raster.width, value);
  }

  getContext(kind: string): CanvasRenderingContext2D | null {
    return kind === '2d' ? this.#context : null;
  }

  #resize(width: number, height: number): void {
    this.#raster.width = width;
    this.#raster.height = height;
    this.#raster.data = new Uint8ClampedArray(width * height * 4);
  }
}

/** A canvas with a real pixel buffer, for tests running outside a browser. */
export function fakeCanvas(width: number, height: number): HTMLCanvasElement {
  return new FakeCanvas(width, height) as unknown as HTMLCanvasElement;
}

/** Let code that creates its own canvases (history snapshots) use fakes. */
export function installFakeDocument(): void {
  const fake = {
    createElement(tag: string): FakeCanvas {
      if (tag !== 'canvas') throw new Error(`Fake document cannot create ${tag}.`);
      return new FakeCanvas();
    },
  };
  (globalThis as unknown as { document: unknown }).document = fake;
}

/** PaperView reads the window size when clamping pan; give it fixed bounds. */
export function installFakeWindow(width: number, height: number): void {
  (globalThis as unknown as { window: unknown }).window = {
    innerWidth: width,
    innerHeight: height,
  };
}

export function fillAlpha(canvas: HTMLCanvasElement, alpha: number): void {
  const raster = rasterOf(canvas);
  for (let offset = 3; offset < raster.data.length; offset += 4) {
    raster.data[offset] = alpha;
  }
}

export function setAlpha(canvas: HTMLCanvasElement, x: number, y: number, alpha: number): void {
  const raster = rasterOf(canvas);
  raster.data[(y * raster.width + x) * 4 + 3] = alpha;
}

export function alphaOf(canvas: HTMLCanvasElement, x: number, y: number): number {
  const raster = rasterOf(canvas);
  return raster.data[(y * raster.width + x) * 4 + 3] ?? 0;
}

interface FakePaper {
  readonly canvas: HTMLCanvasElement;
  readonly element: HTMLElement;
}

/**
 * A paper element whose bounding rect follows the transform the view sets,
 * like a real element laid out at the given size in the top-left corner.
 */
export function fakePaper(width: number, height: number): FakePaper {
  const style = { transform: '' };
  const element = {
    style,
    getBoundingClientRect(): DOMRect {
      const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/u.exec(
        style.transform,
      );
      const tx = match?.[1] === undefined ? 0 : Number(match[1]);
      const ty = match?.[2] === undefined ? 0 : Number(match[2]);
      const scale = match?.[3] === undefined ? 1 : Number(match[3]);
      const rect = {
        x: tx,
        y: ty,
        left: tx,
        top: ty,
        width: width * scale,
        height: height * scale,
        right: tx + width * scale,
        bottom: ty + height * scale,
      };
      return rect as DOMRect;
    },
  };
  const canvas = { parentElement: element };
  return {
    canvas: canvas as unknown as HTMLCanvasElement,
    element: element as unknown as HTMLElement,
  };
}
