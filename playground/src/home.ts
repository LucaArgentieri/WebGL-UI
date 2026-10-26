import { createRenderer, createDetailsFx, createDialogFx, createPopoverFx, inkEffect } from 'webgl-ui'
import '../../src/elements/dialog/dialog.css'

// One renderer for the whole page: one canvas, one WebGL context, two effects.
const renderer = createRenderer()

document.querySelectorAll('details').forEach(d => createDetailsFx(d, { renderer, effect: inkEffect, duration: 900 }))

const dialog = document.getElementById('home-dialog') as HTMLDialogElement
// 'host': the effect paints over the panel, so the modal itself appears from it (the backdrop fades in with CSS).
createDialogFx(dialog, { renderer, effect: inkEffect, layout: 'host', duration: 800 })
document.getElementById('open-dialog')!.addEventListener('click', () => dialog.showModal())

createPopoverFx(document.getElementById('home-pop')!, { renderer, effect: inkEffect, duration: 600 })

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
renderer.prepare(inkEffect).then(ready => {
  document.getElementById('status')!.textContent = !ready
    ? 'WebGL2 is not available: every element uses its native behavior.'
    : reduced
      ? 'Reduced motion: every element uses its native behavior.'
      : 'One renderer, one effect. Open a row, the dialog or the popover.'
})
