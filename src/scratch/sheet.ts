import { DIRECTIONS, ScratchBrush } from './brush';
import { context2D } from './canvas';
import { paperPoint, paperTransform, resampleSegment, surfaceSize } from './geometry';
import type { Point, Surface } from './geometry';
import { WaxHistory } from './history';
import { freshSeed, hash } from './random';
import { PaperTextures } from './textures';

interface Stroke {
  last: Point;
  carried: number;
  readonly width: number;
  direction: number;
}

interface Dab extends Point {
  readonly width: number;
  readonly direction: number;
  readonly variant: number;
}

export class ScratchSheet {
  #seed = freshSeed();
  readonly #brush = new ScratchBrush();
  readonly #active = new Map<number, Stroke>();
  readonly #pending: Dab[] = [];
  readonly #color: CanvasRenderingContext2D;
  readonly #wax: CanvasRenderingContext2D;
  readonly #surface: Surface;
  readonly #history: WaxHistory;
  readonly #onHistoryChange: ((canUndo: boolean, canRedo: boolean) => void) | undefined;
  readonly #abort = new AbortController();
  #width = 2;
  #frame = 0;
  #dabCount = 0;

  constructor(
    colorCanvas: HTMLCanvasElement,
    waxCanvas: HTMLCanvasElement,
    onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void,
  ) {
    const rect = waxCanvas.getBoundingClientRect();
    this.#surface = surfaceSize(rect.width, rect.height, window.devicePixelRatio);
    for (const canvas of [colorCanvas, waxCanvas]) {
      canvas.width = this.#surface.pixelWidth;
      canvas.height = this.#surface.pixelHeight;
    }
    this.#color = context2D(colorCanvas, { alpha: false });
    this.#wax = context2D(waxCanvas);
    this.#history = new WaxHistory(waxCanvas, this.#surface);
    this.#onHistoryChange = onHistoryChange;
    const textures = new PaperTextures(this.#seed);
    textures.paintColor(this.#color, this.#surface);
    textures.paintWax(this.#wax, this.#surface);
    const options = { signal: this.#abort.signal };
    waxCanvas.addEventListener('pointerdown', this.#onDown, options);
    waxCanvas.addEventListener('pointermove', this.#onMove, options);
    waxCanvas.addEventListener('pointerup', this.#onUp, options);
    waxCanvas.addEventListener('pointercancel', this.#onCancel, options);
    waxCanvas.addEventListener('lostpointercapture', this.#onCancel, options);
    waxCanvas.addEventListener(
      'contextmenu',
      (event) => {
        event.preventDefault();
      },
      options,
    );
    window.addEventListener('blur', this.#clearActive, options);
  }

  setWidth(width: number): void {
    this.#width = Math.max(1, Math.min(12, Math.round(width * 2) / 2));
  }

  undo(): void {
    if (this.#active.size > 0) return;
    this.#flushPending();
    if (this.#history.undo()) this.#notifyHistory();
  }

  redo(): void {
    if (this.#active.size > 0) return;
    this.#flushPending();
    if (this.#history.redo()) this.#notifyHistory();
  }

  /** Replace the sheet with a freshly colored one, as a reload would. */
  reset(): void {
    this.#active.clear();
    this.#pending.length = 0;
    if (this.#frame !== 0) {
      cancelAnimationFrame(this.#frame);
      this.#frame = 0;
    }
    this.#seed = freshSeed();
    this.#dabCount = 0;
    const textures = new PaperTextures(this.#seed);
    textures.paintColor(this.#color, this.#surface);
    textures.paintWax(this.#wax, this.#surface);
    this.#history.clear();
    this.#notifyHistory();
  }

  #eventPoint(event: PointerEvent): Point {
    return paperPoint(
      { x: event.clientX, y: event.clientY },
      this.#wax.canvas.getBoundingClientRect(),
      this.#surface,
    );
  }

  #notifyHistory(): void {
    this.#onHistoryChange?.(this.#history.canUndo, this.#history.canRedo);
  }

  /** Run a scheduled flush now, which also closes the previous stroke. */
  #flushPending(): void {
    if (this.#frame === 0) return;
    cancelAnimationFrame(this.#frame);
    this.#flush();
  }

  /** Record a finished stroke once every pointer has lifted. */
  #finishGesture(): void {
    if (this.#active.size > 0 || this.#frame !== 0) return;
    if (this.#history.endStroke()) this.#notifyHistory();
  }

  readonly #onDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    if (this.#active.size === 0) {
      this.#flushPending();
      this.#history.beginStroke();
      this.#notifyHistory();
    }
    const point = this.#eventPoint(event);
    this.#active.set(event.pointerId, {
      last: point,
      carried: 0,
      width: this.#width,
      direction: 0,
    });
    if (event.isTrusted) this.#wax.canvas.setPointerCapture(event.pointerId);
    this.#enqueue(point, this.#width, 0);
  };

  readonly #onMove = (event: PointerEvent): void => {
    const stroke = this.#active.get(event.pointerId);
    if (stroke === undefined) return;
    event.preventDefault();
    if (event.pointerType === 'mouse' && (event.buttons & 1) === 0) {
      this.#active.delete(event.pointerId);
      this.#finishGesture();
      return;
    }
    const optionalEvent: Partial<PointerEvent> = event;
    const samples = optionalEvent.getCoalescedEvents?.() ?? [];
    for (const sample of samples.length === 0 ? [event] : samples)
      this.#extend(stroke, this.#eventPoint(sample));
  };

  readonly #onUp = (event: PointerEvent): void => {
    const stroke = this.#active.get(event.pointerId);
    if (stroke === undefined) return;
    this.#extend(stroke, this.#eventPoint(event));
    if (stroke.carried > 0.05) this.#enqueue(stroke.last, stroke.width, stroke.direction);
    this.#active.delete(event.pointerId);
    this.#finishGesture();
  };

  readonly #onCancel = (event: PointerEvent): void => {
    this.#active.delete(event.pointerId);
    this.#finishGesture();
  };

  readonly #clearActive = (): void => {
    this.#active.clear();
    this.#finishGesture();
  };

  #extend(stroke: Stroke, point: Point): void {
    const dx = point.x - stroke.last.x;
    const dy = point.y - stroke.last.y;
    if (dx === 0 && dy === 0) return;
    const angle = Math.atan2(dy, dx);
    const direction = (Math.round((angle / (Math.PI * 2)) * DIRECTIONS) + DIRECTIONS) % DIRECTIONS;
    const result = resampleSegment(
      stroke.last,
      point,
      Math.max(0.3, stroke.width * 0.19),
      stroke.carried,
    );
    for (const sample of result.points) this.#enqueue(sample, stroke.width, direction);
    stroke.last = point;
    stroke.carried = result.carried;
    stroke.direction = direction;
  }

  #enqueue(point: Point, width: number, direction: number): void {
    const variant = hash(this.#seed, Math.floor(this.#dabCount / 7), 0, 37) % 4;
    this.#dabCount += 1;
    this.#pending.push({ ...point, width, direction, variant });
    if (this.#frame === 0) this.#frame = requestAnimationFrame(this.#flush);
  }

  readonly #flush = (): void => {
    this.#frame = 0;
    paperTransform(this.#wax, this.#surface);
    this.#wax.globalCompositeOperation = 'destination-out';
    for (const dab of this.#pending) {
      const nib = this.#brush.get(dab.width, dab.direction, dab.variant);
      this.#wax.drawImage(
        nib.canvas,
        dab.x - nib.size / 2,
        dab.y - nib.size / 2,
        nib.size,
        nib.size,
      );
      this.#history.expand(dab.x, dab.y, nib.size);
    }
    this.#pending.length = 0;
    this.#finishGesture();
  };

  dispose(): void {
    this.#abort.abort();
    this.#active.clear();
    this.#pending.length = 0;
    if (this.#frame !== 0) cancelAnimationFrame(this.#frame);
  }
}
