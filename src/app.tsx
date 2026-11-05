import { effect, useSignal } from '@preact/signals';
import type { GenericEventHandler, JSX } from 'preact';
import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks';

import { ScratchSheet } from './scratch/sheet';

export function App(): JSX.Element {
  const color = useRef<HTMLCanvasElement>(null);
  const wax = useRef<HTMLCanvasElement>(null);
  const width = useSignal(2);
  const paperStyle = useMemo(
    () => ({ '--paper-ratio': window.innerWidth / window.innerHeight }),
    [],
  );
  const changeWidth = useCallback<GenericEventHandler<HTMLInputElement>>(
    (event): void => {
      width.value = event.currentTarget.valueAsNumber;
    },
    [width],
  );

  useEffect(() => {
    if (color.current === null || wax.current === null) {
      throw new Error('The paper canvases were not mounted.');
    }
    const sheet = new ScratchSheet(color.current, wax.current);
    const stop = effect(() => {
      sheet.setWidth(width.value);
    });
    return () => {
      stop();
      sheet.dispose();
    };
  }, [width]);

  return (
    <main class="sheet">
      <p id="instructions" class="visually-hidden">
        Scratch the black crayon to reveal the colors underneath. Use the slider below to change the
        scratch width. Reload the page for a new sheet.
      </p>
      <div class="paper" style={paperStyle}>
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
      <div class="width-control">
        <input
          type="range"
          min="1"
          max="12"
          step="0.5"
          value={width.value}
          aria-label="Scratch width"
          aria-valuetext={`${width.value} pixels`}
          onInput={changeWidth}
        />
      </div>
    </main>
  );
}
