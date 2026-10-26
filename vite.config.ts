import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// The playground is a plain multi-page Vite app that imports the library from source.
export default defineConfig({
  root: 'playground',
  base: './',
  resolve: { alias: { 'webgl-ui': r('./src/index.ts'), 'webgl-ui-tsl': r('./packages/tsl/src/index.ts') } },
  server: { port: 5173, strictPort: true },
  build: {
    outDir: '../dist-playground',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500, // three.js is its own lazy chunk, loaded only by the TSL page
    rollupOptions: {
      input: {
        index: r('./playground/index.html'),
        details: r('./playground/details.html'),
        dialog: r('./playground/dialog.html'),
        mixed: r('./playground/mixed.html'),
        popover: r('./playground/popover.html'),
        tsl: r('./playground/tsl.html')
      }
    }
  }
})
