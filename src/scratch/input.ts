import { DIRECTIONS } from './brush';
import { paperPoint, resampleSegment } from './geometry';
import type { Point, Surface } from './geometry';
import type { Tool } from './painter';
import type { PaperView } from './view';

interface Stroke {
  last: Point;
  carried: number;
  readonly width: number;
  readonly tool: Tool;
  direction: number;
}

/** The sheet operations that pointer gestures translate into. */
export interface StrokeSink {
  /** The brush style a stroke started now would use. */
  style(): { readonly tool: Tool; readonly width: number };
  /** Flush pending dabs and open a history stroke. */
  beginStroke(): void;
  /** Queue one dab of the active stroke. */
  dab(point: Point, width: number, direction: number, tool: Tool): void;
  /** A gesture may have finished; close the history stroke if all is settled. */
  settled(): void;
}

/**
 * Turns pointer and wheel events on the canvas into strokes and view
 * gestures: one pointer draws, a second pointer starts a pinch, and drawing
 * stays locked until every pointer has lifted.
 */
export class PointerInput {
  readonly #canvas: HTMLCanvasElement;
  readonly #surface: Surface;
  readonly #view: PaperView;
  readonly #sink: StrokeSink;
  readonly #points = new Map<number, Point>();
  readonly #abort = new AbortController();
  #drawing: Stroke | null = null;
  #drawingId = -1;
  #locked = false;

  constructor(canvas: HTMLCanvasElement, surface: Surface, view: PaperView, sink: StrokeSink) {
    this.#canvas = canvas;
    this.#surface = surface;
    this.#view = view;
    this.#sink = sink;
    const options = { signal: this.#abort.signal };
    canvas.addEventListener('pointerdown', this.#onDown, options);
    canvas.addEventListener('pointermove', this.#onMove, options);
    canvas.addEventListener('pointerup', this.#onUp, options);
    canvas.addEventListener('pointercancel', this.#onCancel, options);
    canvas.addEventListener('lostpointercapture', this.#onCancel, options);
    canvas.addEventListener(
      'contextmenu',
      (event) => {
        event.preventDefault();
      },
      options,
    );
    window.addEventListener('blur', this.#clearActive, options);
    const wheelOptions = { passive: false, signal: this.#abort.signal };
    canvas.addEventListener('wheel', this.#onWheel, wheelOptions);
  }

  /** Whether a stroke is currently being drawn. */
  get drawing(): boolean {
    return this.#drawing !== null;
  }

  /** Forget all pointers and any half-drawn stroke, as for a new sheet. */
  reset(): void {
    this.#stopDrawing();
    this.#points.clear();
    this.#locked = false;
  }

  dispose(): void {
    this.#abort.abort();
    this.reset();
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
      this.#sink.settled();
      this.#view.beginPinch([...this.#points.values()]);
      return;
    }
    if (this.#points.size > 2 || this.#locked || this.#drawing !== null) return;
    this.#sink.beginStroke();
    const style = this.#sink.style();
    const point = this.#eventPoint(event);
    this.#drawing = {
      last: point,
      carried: 0,
      width: style.width,
      tool: style.tool,
      direction: 0,
    };
    this.#drawingId = event.pointerId;
    if (event.isTrusted) this.#canvas.setPointerCapture(event.pointerId);
    this.#sink.dab(point, style.width, 0, style.tool);
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
      this.#sink.settled();
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
      this.#sink.dab(stroke.last, stroke.width, stroke.direction, stroke.tool);
    this.#stopDrawing();
    this.#sink.settled();
  };

  readonly #onCancel = (event: PointerEvent): void => {
    this.#release(event.pointerId);
    if (event.pointerId === this.#drawingId) this.#stopDrawing();
    this.#sink.settled();
  };

  readonly #clearActive = (): void => {
    this.#stopDrawing();
    this.#points.clear();
    this.#locked = false;
    this.#view.endPinch();
    this.#sink.settled();
  };

  readonly #onWheel = (event: Readonly<Event>): void => {
    event.preventDefault();
    if (!(event instanceof WheelEvent)) return;
    const client = { x: event.clientX, y: event.clientY };
    const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0022));
    this.#view.zoomAt(client, this.#view.scale * factor);
  };

  #eventPoint(event: PointerEvent): Point {
    const rect = this.#canvas.getBoundingClientRect();
    return paperPoint({ x: event.clientX, y: event.clientY }, rect, this.#surface);
  }

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
    for (const sample of result.points)
      this.#sink.dab(sample, stroke.width, direction, stroke.tool);
    stroke.last = point;
    stroke.carried = result.carried;
    stroke.direction = direction;
  }
}
