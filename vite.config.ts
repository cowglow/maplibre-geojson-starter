import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves the site from /<repo>/; the deploy workflow sets BASE_PATH
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  // MapLibre v6's worker is an ES module worker
  worker: { format: 'es' },
  // #region test-config
  test: {
    environment: 'node',
    // docs/examples holds every code snippet in the onboarding PDFs, so the guides stay tested
    include: ['test/**/*.test.ts', 'docs/examples/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    // The deploy workflow sets TEST_REPORT_DIR to publish an HTML report next to the demo
    reporters: process.env.TEST_REPORT_DIR
      ? ['default', ['html', { outputDir: process.env.TEST_REPORT_DIR }]]
      : ['default'],
  },
  // #endregion
});
