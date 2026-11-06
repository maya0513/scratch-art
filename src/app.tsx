import { effect, useSignal } from '@preact/signals';
import type { GenericEventHandler, JSX } from 'preact';
import { useCallback, useEffect, useRef } from 'preact/hooks';

import { Controls } from './controls';
import { ScratchSheet } from './scratch/sheet';
import type { Tool } from './scratch/sheet';

const PAPER_STYLE = { '--paper-ratio': window.innerWidth / window.innerHeight };

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
