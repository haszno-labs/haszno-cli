import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  // Inject shebang so `haszno` is directly executable after `npm install -g`.
  banner: { js: '#!/usr/bin/env node' },
})
