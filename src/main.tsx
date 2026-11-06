import { render } from 'preact';

import { App } from './app';

import './style.css';

/** Keep the sheet at 100%: page zoom would only get in the way of drawing. */
function stopZoomGesture(event: Readonly<Event>): void {
  event.preventDefault();
}

function preventZoomGestures(): void {
  document.addEventListener('gesturestart', stopZoomGesture, { passive: false });
  document.addEventListener('gesturechange', stopZoomGesture, { passive: false });
  document.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length > 1) event.preventDefault();
    },
    { passive: false },
  );
  window.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey) event.preventDefault();
    },
    { passive: false },
  );
}

preventZoomGestures();
const root = document.querySelector('#app');
if (root === null) throw new Error('Application root is missing.');
render(<App />, root);
