import { render } from 'preact';

import { App } from './app';

import './style.css';

const root = document.querySelector('#app');
if (root === null) throw new Error('Application root is missing.');
render(<App />, root);
