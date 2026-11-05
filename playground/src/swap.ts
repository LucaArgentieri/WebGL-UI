import { createRenderer, createSwapFx, inkEffect, effectsAllowed } from 'webgl-ui'

const quotes = [
  'Form follows function — that has been misunderstood. Form and function should be one.',
  'Less, but better.',
  'Typography is what language looks like.',
  'The details are not the details. They make the design.',
  'White space is to be regarded as an active element, not a passive background.',
  'Simplicity is not the goal. It is the by-product of a good idea and modest expectations.'
]

const renderer = createRenderer()
const regions = [
  { el: document.getElementById('region')!, fx: null as ReturnType<typeof createSwapFx> | null, page: 1 },
  { el: document.getElementById('region-vt')!, fx: null as ReturnType<typeof createSwapFx> | null, page: 1 }
]
regions[0]!.fx = createSwapFx(regions[0]!.el, { renderer })
regions[1]!.fx = createSwapFx(regions[1]!.el, { renderer, viewTransition: true })

// Each page is new DOM: the old button disappears with the old content.
function render(r: (typeof regions)[number], page: number) {
  const lines = page % 2 === 0 ? 2 : 1 // pages of different heights, so the height change shows
  r.el.innerHTML = `<article>
    <h2 class="swap-title">Page ${page}</h2>
    ${Array.from({ length: lines }, (_, i) => `<p>${quotes[(page + i) % quotes.length]}</p>`).join('')}
    <button type="button" class="btn" data-next>Next page</button>
  </article>`
}

function next(r: (typeof regions)[number]) {
  const page = ++r.page
  return r.fx!.run(() => render(r, page))
}

regions.forEach(r => r.el.addEventListener('click', e => {
  if ((e.target as Element).closest('[data-next]')) void next(r)
}))

renderer.prepare(inkEffect).then(ready => {
  document.getElementById('status')!.textContent = !ready
    ? 'WebGL2 is not available: the content is swapped at once.'
    : !effectsAllowed()
      ? 'Reduced motion or another accessibility preference: the content is swapped at once.'
      : 'Press Next page.'
})

Object.assign(window, {
  __webglUi: {
    ready: () => renderer.prepare(inkEffect),
    next: (i: number) => next(regions[i]!),
    fail: () => regions[0]!.fx!.run(() => { throw new Error('update failed on purpose') })
  }
})
