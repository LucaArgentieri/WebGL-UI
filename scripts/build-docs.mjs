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
:root { --bg:#e6ecf1; --surface:#fbfcfd; --ink:#14232e; --muted:#4d6171; --line:#c3d0da; --accent:#5a4bff; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root { --bg:#0e171f; --surface:#16232e; --ink:#e8eff4; --muted:#9db0be; --line:#2a3d4c; --accent:#9a8fff; color-scheme: dark; } }
body { margin:0; background:var(--bg); color:var(--ink); font:1.0625rem/1.6 system-ui,-apple-system,"Segoe UI",sans-serif; }
main { max-width:46rem; margin:0 auto; padding:2rem 1.25rem 4rem; }
nav { display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:1.5rem; font-weight:600; }
a { color:var(--accent); }
h1 { letter-spacing:-0.02em; line-height:1.1; }
code { font-size:.9em; }
pre { background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:1rem; overflow-x:auto; }
table { border-collapse:collapse; display:block; overflow-x:auto; }
th, td { border:1px solid var(--line); padding:.4rem .7rem; text-align:left; vertical-align:top; }
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
