import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// The playground is a plain multi-page Vite app that imports the library from source.
export default defineConfig({
  root: 'playground',
  base: './',
  resolve: { alias: { 'webgl-ui': r('./src/index.ts') } },
  server: { port: 5173, strictPort: true },
  build: {
    outDir: '../dist-playground',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: r('./playground/index.html'),
        details: r('./playground/details.html'),
        dialog: r('./playground/dialog.html')
      }
    }
  }
})
