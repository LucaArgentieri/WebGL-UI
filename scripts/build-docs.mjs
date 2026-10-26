// Renders docs/*.md to dist-playground/docs/*.html (no framework: marked + a small template).
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { marked } from 'marked'

const src = new URL('../docs/', import.meta.url)
const out = new URL('../dist-playground/docs/', import.meta.url)
mkdirSync(out, { recursive: true })

const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const page = (title, body) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
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
pre { background:var(--sheet); padding:1.25rem; overflow-x:auto; box-shadow:0 1px 2px rgba(27,24,21,.12); }
pre code { background:none; padding:0; }
table { border-collapse:collapse; display:block; overflow-x:auto; font-size:1rem; }
th, td { padding:.5rem 1.25rem .5rem 0; text-align:left; vertical-align:top; }
th { font-style:italic; font-weight:400; }
</style>
</head>
<body>
<main>
<nav><a href="../">Playground</a><a href="./">Docs</a></nav>
${body}
</main>
</body>
</html>
`

const files = readdirSync(src).filter(f => f.endsWith('.md')).sort()
const entries = []
for (const f of files) {
  const md = readFileSync(new URL(f, src), 'utf8')
  const title = md.match(/^#\s+(.+)$/m)?.[1] ?? f
  const html = marked.parse(md).replace(/href="([^"#:]+)\.md(#[^"]*)?"/g, 'href="$1.html$2"')
  writeFileSync(new URL(f.replace(/\.md$/, '.html'), out), page(title, html))
  entries.push({ href: f.replace(/\.md$/, '.html'), title })
}
const list = entries.map(e => `<li><a href="./${e.href}">${escapeHtml(e.title)}</a></li>`).join('\n')
writeFileSync(new URL('index.html', out), page('Docs', `<h1>Docs</h1>\n<ul>\n${list}\n</ul>`))
console.log(`docs: ${entries.length} pages -> dist-playground/docs`)
