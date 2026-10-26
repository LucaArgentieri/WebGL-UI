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
:root { --paper:#fff; --ink:#000; color-scheme: light; }
body { margin:0; background:var(--paper); color:var(--ink); font:1rem/1.5 "Helvetica Neue",Helvetica,Arial,"Liberation Sans",sans-serif; -webkit-font-smoothing:antialiased; }
main { max-width:52rem; margin:0 auto; padding:1.5rem 1.5rem 5rem; }
nav { display:flex; gap:1.5rem; flex-wrap:wrap; border-bottom:2px solid var(--ink); padding-bottom:.5rem; margin-bottom:3.5rem; font-size:.8125rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
a { color:var(--ink); text-underline-offset:.18em; text-decoration-thickness:2px; }
a:hover { background:var(--ink); color:var(--paper); text-decoration-color:transparent; }
a:focus-visible { outline:3px solid var(--ink); outline-offset:3px; }
h1 { font-size:clamp(2.5rem,8vw,5rem); font-weight:700; line-height:.95; letter-spacing:-.05em; margin:0 0 2rem; }
h2 { font-size:1.75rem; letter-spacing:-.03em; border-top:2px solid var(--ink); padding-top:.75rem; margin-top:3rem; }
h3 { letter-spacing:-.02em; }
code { font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace; font-size:.875em; border-bottom:1px solid var(--ink); }
pre { border:2px solid var(--ink); padding:1rem; overflow-x:auto; }
pre code { border:0; }
table { border-collapse:collapse; display:block; overflow-x:auto; }
th, td { border:1px solid var(--ink); padding:.4rem .7rem; text-align:left; vertical-align:top; }
th { border-bottom:2px solid var(--ink); }
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
