// Reference pages (docs/*.md → HTML). Used by the build (CLI below) and by the dev server (vite.config.ts),
// so /docs/reference/*.html works in both.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'

const src = new URL('../docs/', import.meta.url)
const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const referencePages = () => readdirSync(src).filter(f => f.endsWith('.md')).sort().map(f => f.replace(/\.md$/, ''))

export function renderReference(name) {
  const md = readFileSync(new URL(`${name}.md`, src), 'utf8')
  const title = md.match(/^#\s+(.+)$/m)?.[1] ?? name
  const body = marked.parse(md).replace(/href="([^"#:]+)\.md(#[^"]*)?"/g, 'href="$1.html$2"')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:,">
<title>${escapeHtml(title)} · WebGL UI</title>
<style>
:root { --paper:#f4efe4; --sheet:#fbf8f0; --ink:#1b1815; color-scheme: light; }
body { margin:0; background:var(--paper); color:var(--ink); font:1.1875rem/1.65 "Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Charter,Georgia,serif; -webkit-font-smoothing:antialiased; }
main { max-width:46rem; margin:0 auto; padding:4rem 1.5rem 7rem; }
nav { display:flex; gap:1.75rem; flex-wrap:wrap; margin-bottom:4rem; font-style:italic; }
a { color:var(--ink); text-underline-offset:.2em; text-decoration-thickness:1px; }
a:hover { text-decoration-thickness:2px; }
a:focus-visible { outline:3px solid var(--ink); outline-offset:4px; }
h1 { font-size:clamp(2.75rem,9vw,5rem); font-weight:400; line-height:1; letter-spacing:-.03em; margin:0 0 2rem; }
h2 { font-size:1.875rem; font-weight:400; letter-spacing:-.02em; margin-top:3.5rem; }
h3 { font-weight:400; font-style:italic; font-size:1.3125rem; }
code { font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace; font-size:.82em; background:rgba(27,24,21,.07); padding:.05em .3em; }
pre { background:var(--sheet); padding:1.25rem; overflow-x:auto; }
pre code { background:none; padding:0; }
table { border-collapse:collapse; display:block; overflow-x:auto; font-size:1rem; }
th, td { padding:.5rem 1.25rem .5rem 0; text-align:left; vertical-align:top; }
th { font-style:italic; font-weight:400; }
tbody tr:nth-child(odd) { background:rgba(27,24,21,.035); }
</style>
</head>
<body>
<main>
<nav aria-label="Documentation"><a href="../index.html">&larr; Documentation</a><a href="../cookbook.html">Cookbook</a><a href="../../">Showcase</a></nav>
${body}
</main>
</body>
</html>
`
}

// CLI: write every reference page next to the built site.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = new URL('../dist-playground/docs/reference/', import.meta.url)
  mkdirSync(out, { recursive: true })
  for (const name of referencePages()) writeFileSync(new URL(`${name}.html`, out), renderReference(name))
  console.log(`docs: ${referencePages().length} reference pages -> dist-playground/docs/reference`)
}
