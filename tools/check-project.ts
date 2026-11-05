import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest: unknown = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);
assert.ok(typeof manifest === 'object' && manifest !== null);
assert.ok(
  !Object.hasOwn(manifest, 'scripts'),
  'package.json scripts are forbidden; use Vite Task.',
);
