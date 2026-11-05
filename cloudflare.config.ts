import { defineConfig } from 'cf/config';

export default defineConfig({
  worker: {
    name: 'scratch-art',
    compatibilityDate: '2026-11-04',
    assets: { htmlHandling: 'auto-trailing-slash', notFoundHandling: 'none' },
  },
});
