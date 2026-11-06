import { context2D } from './canvas';
import { WaxCoat } from './coat';
import { surfaceSize } from './geometry';
import type { Point, Surface } from './geometry';
import { WaxHistory } from './history';
import { PointerInput } from './input';
import type { StrokeSink } from './input';
import { StrokePainter } from './painter';
import type { Tool } from './painter';
import { freshSeed } from './random';
import { PaperTextures } from './textures';
import { PaperView } from './view';

export type { Tool } from './painter';

/**
 * A scratch sheet: the colour layer, the wax layer, and the pieces that work
 * on them (textures, history, view, painter, input) wired together.
 */
export class ScratchSheet implements StrokeSink {
  #seed = freshSeed();
  readonly #color: CanvasRenderingContext2D;
  readonly #wax: CanvasRenderingContext2D;
  readonly #surface: Surface;
  readonly #history: WaxHistory;
  readonly #view: PaperView;
  readonly #painter: StrokePainter;
  readonly #input: PointerInput;
  readonly #onHistoryChange: ((canUndo: boolean, canRedo: boolean) => void) | undefined;
  #tool: Tool = 'scratch';
  #width = 2;

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
    const coat = new WaxCoat(textures.pristineWax(this.#surface), this.#surface);
    coat.apply(this.#wax);
    this.#painter = new StrokePainter(
      this.#wax,
      this.#surface,
      this.#history,
      this.#seed,
      coat,
      () => {
        this.#settle();
      },
    );
    this.#input = new PointerInput(waxCanvas, this.#surface, this.#view, this);
  }

  setWidth(width: number): void {
    this.#width = Math.max(1, Math.min(12, Math.round(width * 2) / 2));
  }

  setTool(tool: Tool): void {
    this.#tool = tool;
  }

  undo(): void {
    if (this.#input.drawing) return;
    this.#painter.flushPending();
    if (this.#history.undo()) this.#notifyHistory();
  }

  redo(): void {
    if (this.#input.drawing) return;
    this.#painter.flushPending();
    if (this.#history.redo()) this.#notifyHistory();
  }

  /** Replace the sheet with a freshly colored one, as a reload would. */
  reset(): void {
    this.#input.reset();
    this.#view.reset();
    this.#seed = freshSeed();
    const textures = new PaperTextures(this.#seed);
    textures.paintColor(this.#color, this.#surface);
    const coat = new WaxCoat(textures.pristineWax(this.#surface), this.#surface);
    coat.apply(this.#wax);
    this.#painter.reset(this.#seed, coat);
    this.#history.clear();
    this.#notifyHistory();
  }

  dispose(): void {
    this.#input.dispose();
    this.#painter.dispose();
  }

  style(): { readonly tool: Tool; readonly width: number } {
    return { tool: this.#tool, width: this.#width };
  }

  beginStroke(): void {
    this.#painter.flushPending();
    this.#history.beginStroke();
    this.#notifyHistory();
  }

  dab(point: Point, width: number, direction: number, tool: Tool): void {
    this.#painter.enqueue(point, width, direction, tool);
  }

  settled(): void {
    this.#settle();
  }

  /** Record a finished stroke once nothing is drawing or left to render. */
  #settle(): void {
    if (this.#input.drawing || this.#painter.scheduled) return;
    if (this.#history.endStroke()) this.#notifyHistory();
  }

  #notifyHistory(): void {
    this.#onHistoryChange?.(this.#history.canUndo, this.#history.canRedo);
  }
}
