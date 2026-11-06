import { defineConfig, lazyPlugins } from 'vite-plus';

// Keep cache locations and telemetry preferences available to cached subprocesses.
const taskEnvironment = [
  'XDG_CACHE_HOME',
  'XDG_CONFIG_HOME',
  'XDG_RUNTIME_DIR',
  'CF_SEND_TELEMETRY',
];

export default defineConfig(({ mode }) => ({
  // Task/config inspection must not run Cloudflare's build cleanup hooks.
  plugins:
    lazyPlugins(async () => {
      const { preact } = await import('@preact/preset-vite');
      if (mode === 'test') return [preact()];
      const { cloudflare } = await import('@cloudflare/vite-plugin');
      return [preact(), cloudflare({ inspectorPort: false, persistState: false })];
    }) ?? [],
  server: { host: '127.0.0.1' },
  build: { target: 'esnext' },
  fmt: {
    singleQuote: true,
    sortImports: true,
    sortPackageJson: true,
    ignorePatterns: [
      '.local/**',
      '.cloudflare/**',
      '.wrangler/**',
      'test-results/**',
      'playwright-report/**',
      'pnpm-lock.yaml',
      'mise.lock',
    ],
  },
  lint: {
    plugins: [
      'typescript',
      'unicorn',
      'oxc',
      'import',
      'promise',
      'react',
      'react-perf',
      'jsx-a11y',
    ],
    categories: { correctness: 'error', suspicious: 'error', pedantic: 'error', perf: 'error' },
    env: { browser: true, builtin: true },
    ignorePatterns: [
      '.local/**',
      '.cloudflare/**',
      '.wrangler/**',
      'test-results/**',
      'playwright-report/**',
    ],
    options: {
      typeAware: true,
      typeCheck: true,
      denyWarnings: true,
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      'typescript/no-explicit-any': 'error',
      'typescript/no-unsafe-argument': 'error',
      'typescript/no-unsafe-assignment': 'error',
      'typescript/no-unsafe-call': 'error',
      'typescript/no-unsafe-member-access': 'error',
      'typescript/no-unsafe-return': 'error',
      'typescript/no-non-null-assertion': 'error',
      'typescript/no-floating-promises': 'error',
      'typescript/no-misused-promises': 'error',
      'typescript/no-unnecessary-condition': 'error',
      'typescript/strict-boolean-expressions': [
        'error',
        { allowNumber: false, allowString: false, allowNullableObject: false },
      ],
      'typescript/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      'typescript/consistent-type-exports': 'error',
      'typescript/explicit-function-return-type': [
        'error',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      'typescript/switch-exhaustiveness-check': 'error',
      'typescript/prefer-readonly': 'error',
      'typescript/prefer-readonly-parameter-types': [
        'error',
        {
          ignoreInferredTypes: true,
          treatMethodsAsReadonly: true,
          allow: [
            {
              from: 'lib',
              name: ['CanvasRenderingContext2D', 'HTMLCanvasElement', 'PointerEvent'],
            },
            { from: 'file', name: 'Stroke', path: './src/scratch/input.ts' },
            { from: 'package', name: 'Page', package: 'playwright-core' },
          ],
        },
      ],
      'typescript/ban-ts-comment': 'error',
      'import/no-cycle': 'error',
      'import/no-duplicates': 'error',
      'import/no-unassigned-import': ['error', { allow: ['**/*.css'] }],
      // A backstop against god files only: 500 lines of actual code, with
      // blank lines and comments not counted (the pedantic default of 300
      // counted everything and rewarded deleting documentation).
      'eslint/max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'eslint/max-lines-per-function': [
        'error',
        { max: 80, skipBlankLines: true, skipComments: true },
      ],
      // Preact uses the automatic JSX runtime.
      'react/react-in-jsx-scope': 'off',
      'react/no-unknown-property': ['error', { ignore: ['class'] }],
    },
    overrides: [
      {
        files: ['*.config.ts'],
        env: { node: true, browser: false },
        rules: { 'eslint/max-lines-per-function': 'off' },
      },
      { files: ['tools/**'], env: { node: true, browser: false } },
      // Signals deliberately exposes a mutable .value setter; React Compiler rules do not apply.
      { files: ['src/app.tsx'], rules: { 'react/immutability': 'off' } },
      {
        files: ['src/**/*.test.ts'],
        plugins: ['typescript', 'unicorn', 'oxc', 'import', 'promise', 'vitest'],
      },
      { files: ['e2e/**'], env: { node: true, browser: true } },
    ],
  },
  test: { include: ['src/**/*.test.ts'] },
  run: {
    enablePrePostScripts: false,
    tasks: {
      install: { command: 'pnpm install --frozen-lockfile', cache: false },
      dev: { command: 'vp dev', cache: false },
      preview: { command: 'vp preview --host 127.0.0.1 --port 4173 --strictPort', cache: false },
      fmt: { command: 'vp fmt', cache: false },
      'fmt:check': {
        command: 'vp fmt --check',
        cache: {
          untrackedEnv: taskEnvironment,
          input: [
            'src/**',
            'e2e/**',
            'tools/**',
            '*.ts',
            '*.json',
            '*.toml',
            '*.yaml',
            '*.md',
            '.gitignore',
            'mise.lock',
            'index.html',
            'public/**',
            '.github/**',
          ],
          output: [],
        },
      },
      lint: {
        command: 'vp lint --deny-warnings',
        cache: {
          untrackedEnv: taskEnvironment,
          input: [
            'src/**',
            'e2e/**',
            'tools/**',
            '*.ts',
            'tsconfig.json',
            'package.json',
            'pnpm-lock.yaml',
            'pnpm-workspace.yaml',
            'mise.lock',
          ],
          output: [],
        },
      },
      check: {
        command: 'vp check --deny-warnings',
        cache: {
          untrackedEnv: taskEnvironment,
          input: [
            'src/**',
            'e2e/**',
            'tools/**',
            '*.ts',
            '*.json',
            '*.toml',
            '*.yaml',
            '*.md',
            '.gitignore',
            'mise.lock',
            'index.html',
            'public/**',
            '.github/**',
          ],
          output: [],
        },
      },
      test: {
        command: 'vp test',
        cache: {
          untrackedEnv: taskEnvironment,
          input: [
            'src/**',
            'vite.config.ts',
            'tsconfig.json',
            'package.json',
            'pnpm-lock.yaml',
            'pnpm-workspace.yaml',
            'mise.lock',
          ],
          output: [],
        },
      },
      build: {
        command: 'vp build',
        cache: {
          untrackedEnv: taskEnvironment,
          input: [
            'src/**',
            'public/**',
            'index.html',
            'vite.config.ts',
            'cloudflare.config.ts',
            'tsconfig.json',
            'package.json',
            'pnpm-lock.yaml',
            'pnpm-workspace.yaml',
            'mise.lock',
          ],
          output: ['.cloudflare/output/**', '.cloudflare/types/**'],
        },
      },
      'browsers:install': {
        command: 'playwright install chromium firefox webkit',
        dependsOn: ['browsers:deps'],
        cache: false,
      },
      'browsers:deps': { command: 'playwright install-deps chromium firefox webkit', cache: false },
      e2e: { command: 'playwright test', dependsOn: ['build'], cache: false },
      'deploy:check': {
        command: 'cf deploy --prebuilt --mode production --dry-run',
        dependsOn: ['build'],
        cache: false,
      },
      deploy: { command: 'cf deploy --prebuilt --mode production', cache: false },
      verify: {
        command: 'node tools/check-project.ts',
        dependsOn: ['check', 'test', 'e2e', 'deploy:check'],
        cache: false,
      },
      update: {
        command: [
          'node tools/update-dependencies.ts',
          'pnpm install',
          'vp fmt package.json pnpm-workspace.yaml',
        ],
        cache: false,
      },
    },
  },
}));
