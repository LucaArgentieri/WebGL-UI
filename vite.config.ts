import { defineConfig, type Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
// @ts-expect-error plain ESM script without types
import { referencePages, renderReference } from './scripts/docs-reference.mjs'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// The documentation pages share one navigation, written once in playground/docs/_nav.html and inlined at build
// time (static HTML, no script needed). The current page gets aria-current="page".
function docsNav(): Plugin {
  return {
    name: 'docs-nav',
    transformIndexHtml(html, ctx) {
      if (!html.includes('<!-- docs-nav -->')) return html
      const page = basename(ctx.filename)
      const nav = readFileSync(r('./playground/docs/_nav.html'), 'utf8')
        .replace(`href="./${page}"`, `href="./${page}" aria-current="page"`)
      return html.replace('<!-- docs-nav -->', nav)
    },
    // In dev, the reference pages (docs/*.md) are rendered on the fly; the build writes them as files.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(/\/docs\/reference\/([\w-]+)\.html/)
        if (!m || !(referencePages() as string[]).includes(m[1]!)) return next()
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(renderReference(m[1]))
      })
    }
  }
}

const docs = ['index', 'details', 'dialog', 'popover', 'image', 'progress', 'swap', 'effects', 'cookbook']

// The playground is a plain multi-page Vite app that imports the library from source.
export default defineConfig({
  root: 'playground',
  base: './',
  plugins: [docsNav()],
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
        tsl: r('./playground/tsl.html'),
        image: r('./playground/image.html'),
        progress: r('./playground/progress.html'),
        swap: r('./playground/swap.html'),
        ...Object.fromEntries(docs.map(d => [`docs-${d}`, r(`./playground/docs/${d}.html`)]))
      }
    }
  }
})
