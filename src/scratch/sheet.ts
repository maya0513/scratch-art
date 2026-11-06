import { DIRECTIONS, ScratchBrush } from './brush';
import { context2D } from './canvas';
import { paperPoint, paperTransform, resampleSegment, surfaceSize } from './geometry';
import type { Point, Surface } from './geometry';
import { WaxHistory } from './history';
import { freshSeed, hash } from './random';
import { PaperTextures } from './textures';
import { PaperView } from './view';

export type Tool = 'coat' | 'scratch';

interface Stroke {
  last: Point;
  carried: number;
  readonly width: number;
  readonly tool: Tool;
  direction: number;
}

interface Dab extends Point {
  readonly width: number;
  readonly direction: number;
  readonly variant: number;
  readonly tool: Tool;
}

export class ScratchSheet {
  #seed = freshSeed();
  readonly #brush = new ScratchBrush();
  readonly #points = new Map<number, Point>();
  readonly #pending: Dab[] = [];
  readonly #color: CanvasRenderingContext2D;
  readonly #wax: CanvasRenderingContext2D;
  readonly #surface: Surface;
  readonly #history: WaxHistory;
  readonly #view: PaperView;
  readonly #onHistoryChange: ((canUndo: boolean, canRedo: boolean) => void) | undefined;
  readonly #abort = new AbortController();
  #drawing: Stroke | null = null;
  #drawingId = -1;
  #locked = false;
  #tool: Tool = 'scratch';
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
    this.#view = new PaperView(waxCanvas, this.#surface);
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
    waxCanvas.addEventListener('wheel', this.#onWheel, {
      passive: false,
      signal: this.#abort.signal,
    });
  }

  setWidth(width: number): void {
    this.#width = Math.max(1, Math.min(12, Math.round(width * 2) / 2));
  }

  setTool(tool: Tool): void {
    this.#tool = tool;
  }

  undo(): void {
    if (this.#drawing !== null) return;
    this.#flushPending();
    if (this.#history.undo()) this.#notifyHistory();
  }

  redo(): void {
    if (this.#drawing !== null) return;
    this.#flushPending();
    if (this.#history.redo()) this.#notifyHistory();
  }

  /** Replace the sheet with a freshly colored one, as a reload would. */
  reset(): void {
    this.#drawing = null;
    this.#drawingId = -1;
    this.#points.clear();
    this.#locked = false;
    this.#view.reset();
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
    const rect = this.#wax.canvas.getBoundingClientRect();
    return paperPoint({ x: event.clientX, y: event.clientY }, rect, this.#surface);
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

  /** Record a finished stroke once the drawing pointer has lifted. */
  #finishGesture(): void {
    if (this.#drawing !== null || this.#frame !== 0) return;
    if (this.#history.endStroke()) this.#notifyHistory();
  }

  readonly #onDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    if (this.#points.has(event.pointerId)) return;
    this.#points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.#points.size === 2) {
      // A second pointer starts a pinch: end the stroke, hand over the view.
      this.#stopDrawing();
      this.#locked = true;
      this.#finishGesture();
      this.#view.beginPinch([...this.#points.values()]);
      return;
    }
    if (this.#points.size > 2 || this.#locked || this.#drawing !== null) return;
    this.#flushPending();
    this.#history.beginStroke();
    this.#notifyHistory();
    const point = this.#eventPoint(event);
    this.#drawing = {
      last: point,
      carried: 0,
      width: this.#width,
      tool: this.#tool,
      direction: 0,
    };
    this.#drawingId = event.pointerId;
    if (event.isTrusted) this.#wax.canvas.setPointerCapture(event.pointerId);
    this.#enqueue(point, this.#width, 0, this.#tool);
  };

  readonly #onMove = (event: PointerEvent): void => {
    if (this.#points.has(event.pointerId)) {
      this.#points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (this.#view.pinching) {
      event.preventDefault();
      this.#view.updatePinch([...this.#points.values()]);
      return;
    }
    if (this.#drawing === null || event.pointerId !== this.#drawingId) return;
    const stroke = this.#drawing;
    event.preventDefault();
    if (event.pointerType === 'mouse' && (event.buttons & 1) === 0) {
      this.#stopDrawing();
      this.#release(event.pointerId);
      this.#finishGesture();
      return;
    }
    const optionalEvent: Partial<PointerEvent> = event;
    const samples = optionalEvent.getCoalescedEvents?.() ?? [];
    for (const sample of samples.length === 0 ? [event] : samples)
      this.#extend(stroke, this.#eventPoint(sample));
  };

  readonly #onUp = (event: PointerEvent): void => {
    this.#release(event.pointerId);
    if (this.#drawing === null || event.pointerId !== this.#drawingId) return;
    const stroke = this.#drawing;
    this.#extend(stroke, this.#eventPoint(event));
    if (stroke.carried > 0.05)
      this.#enqueue(stroke.last, stroke.width, stroke.direction, stroke.tool);
    this.#stopDrawing();
    this.#finishGesture();
  };

  readonly #onCancel = (event: PointerEvent): void => {
    this.#release(event.pointerId);
    if (event.pointerId === this.#drawingId) this.#stopDrawing();
    this.#finishGesture();
  };

  readonly #clearActive = (): void => {
    this.#stopDrawing();
    this.#points.clear();
    this.#locked = false;
    this.#view.endPinch();
    this.#finishGesture();
  };

  #stopDrawing(): void {
    this.#drawing = null;
    this.#drawingId = -1;
  }

  #release(pointerId: number): void {
    this.#points.delete(pointerId);
    if (this.#points.size < 2) this.#view.endPinch();
    if (this.#points.size === 0) this.#locked = false;
  }

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
    for (const sample of result.points) this.#enqueue(sample, stroke.width, direction, stroke.tool);
    stroke.last = point;
    stroke.carried = result.carried;
    stroke.direction = direction;
  }

  #enqueue(point: Point, width: number, direction: number, tool: Tool): void {
    const variant = hash(this.#seed, Math.floor(this.#dabCount / 7), 0, 37) % 4;
    this.#dabCount += 1;
    this.#pending.push({ ...point, width, direction, variant, tool });
    if (this.#frame === 0) this.#frame = requestAnimationFrame(this.#flush);
  }

  readonly #flush = (): void => {
    this.#frame = 0;
    paperTransform(this.#wax, this.#surface);
    for (const dab of this.#pending) {
      const nib = this.#brush.get(dab.width, dab.direction, dab.variant);
      this.#wax.globalCompositeOperation = dab.tool === 'coat' ? 'source-over' : 'destination-out';
      const size = nib.size;
      const x = dab.x - size / 2;
      const y = dab.y - size / 2;
      const passes = dab.tool === 'coat' ? 3 : 1;
      for (let pass = 0; pass < passes; pass++) this.#wax.drawImage(nib.canvas, x, y, size, size);
      this.#history.expand(dab.x, dab.y, size);
    }
    this.#pending.length = 0;
    this.#finishGesture();
  };

  readonly #onWheel = (event: Readonly<Event>): void => {
    event.preventDefault();
    if (!(event instanceof WheelEvent)) return;
    const client = { x: event.clientX, y: event.clientY };
    const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0022));
    this.#view.zoomAt(client, this.#view.scale * factor);
  };

  dispose(): void {
    this.#abort.abort();
    this.#stopDrawing();
    this.#points.clear();
    this.#locked = false;
    this.#pending.length = 0;
    if (this.#frame !== 0) cancelAnimationFrame(this.#frame);
  }
}
