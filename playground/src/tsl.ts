import { createRenderer, createDetailsFx } from 'webgl-ui'
import { radialEffect, uvProbeEffect, halfRedEffect } from './tslEffects'
import { runStress, createTrace, sleep, formatResult } from './stress'

// TSL effects get a renderer of their own: a canvas holds one kind of context.
const renderer = createRenderer()
const trace = createTrace()
const list = [...document.querySelectorAll<HTMLDetailsElement>('details')]
const fxs = list.map(d => createDetailsFx(d, { renderer, effect: radialEffect, trace: trace.push }))

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
renderer.prepare(radialEffect).then(ready => {
  status.textContent = !ready
    ? 'Neither WebGPU nor WebGL2 is available: the details use native behavior.'
    : reduced
      ? 'Reduced motion: the details use native behavior.'
      : 'TSL on three.js. Tap a title to open or close.'
})

Object.assign(window, {
  __webglUi: {
    ready: () => renderer.prepare(radialEffect),
    runStress: stress,
    /** Test hook: holds the uv probe on screen for a while, inside #probe-host (screenshots read it back). */
    async probe(kind: 'uv' | 'half' = 'uv') {
      const effect = kind === 'half' ? halfRedEffect : uvProbeEffect
      if (!(await renderer.prepare(effect))) return false
      const host = document.createElement('div')
      host.id = 'probe-host'
      host.style.cssText = 'position:fixed;left:0;top:0;width:200px;height:100px;z-index:10;background:#fff'
      document.body.append(host)
      void renderer.play(host, {
        effect, from: 1, to: 1, duration: 3000, color: [1, 1, 1], layout: 'host'
      }).then(() => host.remove())
      return true
    }
  }
})
