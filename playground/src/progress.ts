import { createRenderer, createProgressFx, inkBarEffect, effectsAllowed } from 'webgl-ui'
import '../../src/elements/progress/progress.css'

const renderer = createRenderer()
const pr = document.getElementById('pr') as HTMLProgressElement
const mt = document.getElementById('mt') as HTMLMeterElement
const rtl = document.getElementById('pr-rtl') as HTMLProgressElement
const fxs = [pr, mt, rtl].map(el => createProgressFx(el, { renderer }))

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const step = (el: HTMLProgressElement, d: number) => {
  if (!el.hasAttribute('value')) el.value = 0
  el.value = clamp(el.value + d, 0, el.max)
  el.textContent = `${Math.round((el.value / el.max) * 100)}%`
}
document.getElementById('plus')!.addEventListener('click', () => step(pr, 25))
document.getElementById('minus')!.addEventListener('click', () => step(pr, -25))
document.getElementById('rtl-plus')!.addEventListener('click', () => step(rtl, 25))
document.getElementById('indeterminate')!.addEventListener('click', () => pr.removeAttribute('value'))
document.getElementById('burst')!.addEventListener('click', async () => {
  for (let i = 0; i < 20; i++) { pr.value = Math.round(Math.random() * 100); await new Promise(r => setTimeout(r, 40)) }
})
document.getElementById('meter-up')!.addEventListener('click', () => { mt.value = clamp(mt.value + 0.2, 0, 1) })
document.getElementById('meter-down')!.addEventListener('click', () => { mt.value = clamp(mt.value - 0.2, 0, 1) })

renderer.prepare(inkBarEffect).then(ready => {
  document.getElementById('status')!.textContent = !ready
    ? 'WebGL2 is not available: the bars are native.'
    : !effectsAllowed()
      ? 'Reduced motion or another accessibility preference: the bars are native.'
      : 'Change a value.'
})

Object.assign(window, { __webglUi: { ready: () => renderer.prepare(inkBarEffect), fxs, renderer }, __inkBar: inkBarEffect })
