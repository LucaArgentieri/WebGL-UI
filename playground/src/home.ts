import { createRenderer, createDetailsFx, createDialogFx, createPopoverFx, swissEffect } from 'webgl-ui'
import '../../src/elements/dialog/dialog.css'

// One renderer for the whole page: one canvas, one WebGL context, two effects.
const renderer = createRenderer()

document.querySelectorAll('details').forEach(d => createDetailsFx(d, { renderer, effect: swissEffect, duration: 900 }))

const dialog = document.getElementById('home-dialog') as HTMLDialogElement
// 'host': the effect paints over the panel, so the modal itself appears from it (the backdrop fades in with CSS).
createDialogFx(dialog, { renderer, effect: swissEffect, layout: 'host', duration: 800 })
document.getElementById('open-dialog')!.addEventListener('click', () => dialog.showModal())

createPopoverFx(document.getElementById('home-pop')!, { renderer, effect: swissEffect, duration: 600 })

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
renderer.prepare(swissEffect).then(ready => {
  document.getElementById('status')!.textContent = !ready
    ? 'WebGL2 is not available: every element uses its native behavior.'
    : reduced
      ? 'Reduced motion: every element uses its native behavior.'
      : 'One renderer, one effect. Open a row, the dialog or the popover.'
})

// Pointer-driven RGB split on the headline: decoration only, off with reduced motion.
if (!reduced) {
  const targets = document.querySelectorAll<HTMLElement>('.rgb')
  let raf = 0
  addEventListener('pointermove', e => {
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      const x = (e.clientX / innerWidth) * 2 - 1
      const y = (e.clientY / innerHeight) * 2 - 1
      targets.forEach(t => { t.style.setProperty('--sx', x.toFixed(3)); t.style.setProperty('--sy', y.toFixed(3)) })
    })
  }, { passive: true })
}
