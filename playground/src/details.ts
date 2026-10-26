import { createRenderer, createDetailsFx, inkEffect } from 'webgl-ui'
import { runStress, createTrace, sleep, formatResult } from './stress'

const renderer = createRenderer()
const trace = createTrace()
const list = [...document.querySelectorAll<HTMLDetailsElement>('details')]
const fxs = list.map(d => createDetailsFx(d, { renderer, effect: inkEffect, trace: trace.push }))

const summaryOf = (d: HTMLDetailsElement) => d.querySelector<HTMLElement>(':scope > summary')!
const status = document.getElementById('status')!
const resultEl = document.getElementById('result')!
const stressBtn = document.getElementById('stress') as HTMLButtonElement
const TOTAL = 80

function stress() {
  return runStress<HTMLDetailsElement>({
    elements: list,
    total: TOTAL,
    trace: trace.lines,
    // every click flips the state, like a native details
    ops: { toggle: (d, expected) => { summaryOf(d).click(); return !expected } },
    opNames: ['toggle'],
    async prepare() {
      renderer.cancel()
      await sleep(100)
      list.forEach(d => { if (d.open) summaryOf(d).click() })
      await sleep(1200)
    },
    isOpen: d => d.open,
    check(d, _i, expected) {
      const p: string[] = []
      if (d.open !== expected) p.push(`${d.id}: open=${d.open}, expected ${expected}`)
      if (d.style.height) p.push(`${d.id}: leftover height (${d.style.height})`)
      if (d.style.overflow) p.push(`${d.id}: leftover overflow (${d.style.overflow})`)
      return p
    },
    globalCheck: () => (document.querySelector('details canvas') ? ['canvas still in the DOM'] : []),
    describe: () => fxs.map((f, i) => `${list[i]!.id} ${JSON.stringify(f.debug())}`).join('; ')
  })
}

stressBtn.addEventListener('click', async () => {
  stressBtn.disabled = true
  resultEl.textContent = 'Running…'
  resultEl.textContent = formatResult(await stress(), TOTAL)
  stressBtn.disabled = false
})

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
renderer.prepare(inkEffect).then(ready => {
  status.textContent = !ready
    ? 'WebGL2 is not available: the details use native behavior.'
    : reduced
      ? 'Reduced motion: the details use native behavior.'
      : 'GLSL on WebGL2. Tap a title to open or close.'
})

Object.assign(window, {
  __webglUi: {
    ready: () => renderer.prepare(inkEffect),
    runStress: stress
  }
})
