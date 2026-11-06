import { createRenderer, createDetailsFx, createDialogFx, createPopoverFx, inkEffect, inkVeilEffect, effectsAllowed } from 'webgl-ui'
import '../../src/elements/dialog/dialog.css'

// One renderer for the whole page: one canvas, one WebGL context, two effects.
const renderer = createRenderer()

document.querySelectorAll('details').forEach(d => createDetailsFx(d, { renderer, effect: inkEffect, duration: 900 }))

const dialog = document.getElementById('home-dialog') as HTMLDialogElement
// 'behind': the veil paints the panel's surface from nothing, behind its content (no block of ink first).
createDialogFx(dialog, { renderer, effect: inkVeilEffect, layout: 'behind' })
document.getElementById('open-dialog')!.addEventListener('click', () => dialog.showModal())

createPopoverFx(document.getElementById('home-pop')!, { renderer, effect: inkVeilEffect, layout: 'behind' })

const reduced = !effectsAllowed()
Promise.all([renderer.prepare(inkEffect), renderer.prepare(inkVeilEffect)]).then(r => r.every(Boolean)).then(ready => {
  document.getElementById('status')!.textContent = !ready
    ? 'WebGL2 is not available: every element uses its native behavior.'
    : reduced
      ? 'Reduced motion or another accessibility preference: every element uses its native behavior.'
      : 'One renderer, two effects. Open a row, the dialog or the popover.'
})
