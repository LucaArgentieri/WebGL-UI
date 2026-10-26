import { createRenderer, createPopoverFx, inkEffect } from 'webgl-ui'
import { runStress, createTrace, sleep, formatResult } from './stress'

const renderer = createRenderer()
const trace = createTrace()
const list = [...document.querySelectorAll<HTMLElement>('[popover]')]
const fxs = list.map(p => createPopoverFx(p, { renderer, effect: inkEffect, trace: trace.push }))

const invokerOf = (p: HTMLElement) => document.querySelector<HTMLElement>(`#t${p.id.slice(1)}`)!
const nativeHide = HTMLElement.prototype.hidePopover
const status = document.getElementById('status')!
const resultEl = document.getElementById('result')!
const stressBtn = document.getElementById('stress') as HTMLButtonElement
const TOTAL = 80

function stress() {
  return runStress<HTMLElement>({
    elements: list,
    total: TOTAL,
    trace: trace.lines,
    ops: {
      toggle: (p, expected) => { invokerOf(p).click(); return !expected },
      show: p => { p.showPopover(); return true },
      hide: p => { p.hidePopover(); return false },
      // What the browser does by itself on Esc or light dismiss: instant, not interceptable.
      dismiss: (p, expected) => {
        if (p.matches(':popover-open')) { nativeHide.call(p); return false }
        return expected
      }
    },
    opNames: ['toggle', 'toggle', 'show', 'hide', 'dismiss'],
    async prepare() {
      renderer.cancel()
      await sleep(100)
      list.forEach(p => { if (p.matches(':popover-open')) nativeHide.call(p) })
      await sleep(300)
    },
    isOpen: p => p.matches(':popover-open'),
    check(p, _i, expected) {
      const open = p.matches(':popover-open')
      return open !== expected ? [`${p.id}: open=${open}, expected ${expected}`] : []
    },
    globalCheck: () => (document.querySelector('[popover] canvas') ? ['canvas still in the DOM'] : []),
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
    ? 'WebGL2 is not available: the popovers use native behavior.'
    : reduced
      ? 'Reduced motion: the popovers use native behavior.'
      : 'GLSL on WebGL2. Tap a button to open or close.'
})

Object.assign(window, {
  __webglUi: {
    ready: () => renderer.prepare(inkEffect),
    runStress: stress
  }
})
