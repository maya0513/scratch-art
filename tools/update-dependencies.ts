import { readFile, writeFile } from 'node:fs/promises';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError('Expected a JSON object.');
  }
  return value;
}

async function release(name: string, tag = 'latest'): Promise<string> {
  const url = new URL(
    `${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
    'https://registry.npmjs.org/',
  );
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Cannot resolve ${name}@${tag}: HTTP ${response.status}`);
  const metadata = record((await response.json()) as unknown);
  const version = metadata['version'];
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[\da-z.-]+)?$/iu.test(version)) {
    throw new TypeError(`Invalid package version for ${name}.`);
  }
  return version;
}

const manifestUrl = new URL('../package.json', import.meta.url);
const workspaceUrl = new URL('../pnpm-workspace.yaml', import.meta.url);
const manifest = record(JSON.parse(await readFile(manifestUrl, 'utf8')) as unknown);
if (Object.hasOwn(manifest, 'scripts'))
  throw new Error('Define tasks in vite.config.ts, not package.json.');
const toolchainVersion = await release('vite-plus');
await release('@voidzero-dev/vite-plus-core', toolchainVersion);
const toolchainAlias = `npm:@voidzero-dev/vite-plus-core@${toolchainVersion}`;

await Promise.all(
  ['dependencies', 'devDependencies'].map(async (field) => {
    const dependencies = record(manifest[field]);
    await Promise.all(
      Object.keys(dependencies).map(async (name) => {
        if (name === 'vite') dependencies[name] = toolchainAlias;
        else if (name === 'vite-plus') dependencies[name] = toolchainVersion;
        else
          dependencies[name] = await release(
            name,
            name === '@cloudflare/vite-plugin' ? 'beta' : 'latest',
          );
      }),
    );
  }),
);

// Confirm companion packages exist before changing either dependency file.
const development = record(manifest['devDependencies']);
const browserVersion = development['@playwright/test'];
if (typeof browserVersion !== 'string') throw new TypeError('Missing Playwright version.');
await Promise.all([
  release('playwright', browserVersion),
  release('playwright-core', browserVersion),
]);

const workspace = await readFile(workspaceUrl, 'utf8');
const override = /^(\s+vite@\*:\s*).*$/gmu;
if ([...workspace.matchAll(override)].length !== 1)
  throw new Error('Expected exactly one Vite core override.');
const updatedWorkspace = workspace.replaceAll(override, `$1${toolchainAlias}`);
await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(workspaceUrl, updatedWorkspace);
