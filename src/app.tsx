import { effect, useSignal } from '@preact/signals';
import type { GenericEventHandler, JSX } from 'preact';
import { useCallback, useEffect, useRef } from 'preact/hooks';

import { ScratchSheet } from './scratch/sheet';
import type { Tool } from './scratch/sheet';

const UNDO_PATH =
  'M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z';
const REDO_PATH =
  'M11.5 8c2.65 0 5.05.99 6.9 2.6L22 7v9h-9l3.62-3.62c-1.39-1.16-3.16-1.88-5.12-1.88-3.54 0-6.55 2.31-7.6 5.5l-2.37-.78C2.92 11.03 6.85 8 11.5 8z';
const NEW_SHEET_PATH =
  'M6 2c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z';
const PAPER_STYLE = { '--paper-ratio': window.innerWidth / window.innerHeight };
const SCRATCH_PATH = 'm5.25 17.25 4.5-9.75 2.25 8.25 3.75-9.75 3 7.5';
const COAT_PATH =
  'M12 3l7 10H5l7-10zM5.2 15h13.6l-1.1 5.2a2 2 0 0 1-2 1.6H8.3a2 2 0 0 1-2-1.6L5.2 15z';

interface ToolButtonProps {
  readonly label: string;
  readonly path: string;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly pressed?: boolean;
  readonly stroke?: boolean;
  readonly onClick: () => void;
}

function ToolButton(props: ToolButtonProps): JSX.Element {
  return (
    <button
      type="button"
      class={props.className ?? 'tool-button'}
      aria-label={props.label}
      title={props.label}
      aria-pressed={props.pressed}
      disabled={props.disabled ?? false}
      onClick={props.onClick}
    >
      <svg
        viewBox="0 0 24 24"
        class={props.stroke === true ? 'stroke-icon' : undefined}
        aria-hidden="true"
        focusable="false"
      >
        <path d={props.path} />
      </svg>
    </button>
  );
}

interface ResetDialogProps {
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

function ResetDialog(props: ResetDialogProps): JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const { onCancel } = props;
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    const element = dialog.current;
    if (element !== null) {
      element.showModal();
      cancel.current?.focus();
      const handleCancel = (): void => {
        onCancel();
      };
      element.addEventListener('cancel', handleCancel);
      cleanup = () => {
        element.removeEventListener('cancel', handleCancel);
      };
    }
    return cleanup;
  }, [onCancel]);
  return (
    <dialog ref={dialog} class="modal" aria-labelledby="new-sheet-title">
      <h2 id="new-sheet-title">Start a new sheet?</h2>
      <p>Your current sheet will be cleared and replaced with fresh colors.</p>
      <div class="modal-actions">
        <button ref={cancel} type="button" class="modal-button" onClick={props.onCancel}>
          Cancel
        </button>
        <button type="button" class="modal-button primary" onClick={props.onConfirm}>
          New sheet
        </button>
      </div>
    </dialog>
  );
}

interface ControlsProps {
  readonly widthValue: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly tool: Tool;
  readonly onWidth: GenericEventHandler<HTMLInputElement>;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onReset: () => void;
  readonly onTool: (tool: Tool) => void;
}

function Controls(props: ControlsProps): JSX.Element {
  const confirmingReset = useSignal(false);
  const { onReset, onTool } = props;
  const chooseScratch = useCallback((): void => {
    onTool('scratch');
  }, [onTool]);
  const chooseCoat = useCallback((): void => {
    onTool('coat');
  }, [onTool]);
  const askReset = useCallback((): void => {
    confirmingReset.value = true;
  }, [confirmingReset]);
  const cancelReset = useCallback((): void => {
    confirmingReset.value = false;
  }, [confirmingReset]);
  const confirmReset = useCallback((): void => {
    confirmingReset.value = false;
    onReset();
  }, [confirmingReset, onReset]);
  return (
    <div class="controls">
      <div class="width-control">
        <input
          type="range"
          min="1"
          max="12"
          step="0.5"
          value={props.widthValue}
          aria-label="Scratch width"
          aria-valuetext={`${props.widthValue} pixels`}
          onInput={props.onWidth}
        />
      </div>
      <div class="sheet-actions">
        <ToolButton
          label="Scratch"
          path={SCRATCH_PATH}
          stroke
          pressed={props.tool === 'scratch'}
          onClick={chooseScratch}
        />
        <ToolButton
          label="Fill black"
          path={COAT_PATH}
          pressed={props.tool === 'coat'}
          onClick={chooseCoat}
        />
        <ToolButton
          label="Undo"
          path={UNDO_PATH}
          disabled={!props.canUndo}
          onClick={props.onUndo}
        />
        <ToolButton
          label="Redo"
          path={REDO_PATH}
          disabled={!props.canRedo}
          onClick={props.onRedo}
        />
        <ToolButton
          label="New sheet"
          path={NEW_SHEET_PATH}
          className="tool-button new-sheet-button"
          onClick={askReset}
        />
      </div>
      {confirmingReset.value ? (
        <ResetDialog onCancel={cancelReset} onConfirm={confirmReset} />
      ) : null}
    </div>
  );
}

interface SheetActions {
  readonly undo: () => void;
  readonly redo: () => void;
  readonly reset: () => void;
  readonly chooseTool: (tool: Tool) => void;
}

interface SheetRef {
  readonly current: ScratchSheet | null;
}

interface SheetActionDeps {
  readonly sheet: SheetRef;
  readonly applyTool: (tool: Tool) => void;
}

function useSheetActions(deps: Readonly<SheetActionDeps>): SheetActions {
  const { sheet, applyTool } = deps;
  const undo = useCallback((): void => {
    sheet.current?.undo();
  }, [sheet]);
  const redo = useCallback((): void => {
    sheet.current?.redo();
  }, [sheet]);
  const reset = useCallback((): void => {
    sheet.current?.reset();
  }, [sheet]);
  return { undo, redo, reset, chooseTool: applyTool };
}

export function App(): JSX.Element {
  const color = useRef<HTMLCanvasElement>(null);
  const wax = useRef<HTMLCanvasElement>(null);
  const sheet = useRef<ScratchSheet | null>(null);
  const width = useSignal(6.5);
  const tool = useSignal<Tool>('scratch');
  const canUndo = useSignal(false);
  const canRedo = useSignal(false);
  const changeWidth = useCallback<GenericEventHandler<HTMLInputElement>>(
    (event): void => {
      width.value = event.currentTarget.valueAsNumber;
    },
    [width],
  );
  const applyTool = useCallback(
    (next: Tool): void => {
      tool.value = next;
      sheet.current?.setTool(next);
    },
    [sheet, tool],
  );
  const actions = useSheetActions({ sheet, applyTool });

  useEffect(() => {
    if (color.current === null || wax.current === null) {
      throw new Error('The paper canvases were not mounted.');
    }
    const instance = new ScratchSheet(color.current, wax.current, (undoable, redoable) => {
      canUndo.value = undoable;
      canRedo.value = redoable;
    });
    sheet.current = instance;
    const stop = effect(() => {
      instance.setWidth(width.value);
    });
    return () => {
      stop();
      instance.dispose();
      sheet.current = null;
    };
  }, [width, canUndo, canRedo]);

  return (
    <main class="sheet">
      <p id="instructions" class="visually-hidden">
        Scratch the black crayon to reveal the colors underneath, or fill scratched areas back in
        with black. Use the slider below to change the width, the tool buttons to switch between
        scratching and filling, the arrow buttons to undo or redo a stroke, and the reset button to
        start a new sheet. Pinch or scroll to zoom.
      </p>
      <div class="paper" style={PAPER_STYLE}>
        <canvas ref={color} class="color-layer" aria-hidden="true" />
        <canvas
          ref={wax}
          class="wax-layer"
          aria-label="Scratch art paper"
          aria-describedby="instructions"
        >
          Scratch Art requires a browser that supports Canvas.
        </canvas>
      </div>
      <Controls
        widthValue={width.value}
        canUndo={canUndo.value}
        canRedo={canRedo.value}
        tool={tool.value}
        onTool={actions.chooseTool}
        onWidth={changeWidth}
        onUndo={actions.undo}
        onRedo={actions.redo}
        onReset={actions.reset}
      />
    </main>
  );
}
