import { createRenderer, createDetailsFx, createDialogFx, createPopoverFx, inkEffect, inkVeilEffect, halftoneEffect, effectsAllowed } from 'webgl-ui'
import '../../src/elements/dialog/dialog.css'

// One renderer for the whole page: one canvas, one WebGL context, two effects.
const renderer = createRenderer()

document.querySelectorAll('details').forEach(d => createDetailsFx(d, { renderer, effect: inkEffect, duration: 900 }))

const dialog = document.getElementById('home-dialog') as HTMLDialogElement
// The backdrop is halftone noise drawn by the shader; its last frame stays as the ::backdrop (keepBackdrop).
// The same effect paints the panel's sheet from nothing (paintsPanel), so the dialog still appears through the ink.
createDialogFx(dialog, { renderer, effect: halftoneEffect, keepBackdrop: true, paintsPanel: true })
document.getElementById('open-dialog')!.addEventListener('click', () => dialog.showModal())

createPopoverFx(document.getElementById('home-pop')!, { renderer, effect: inkVeilEffect, layout: 'behind' })

const reduced = !effectsAllowed()
Promise.all([renderer.prepare(inkEffect), renderer.prepare(inkVeilEffect), renderer.prepare(halftoneEffect)]).then(r => r.every(Boolean)).then(ready => {
  document.getElementById('status')!.textContent = !ready
    ? 'WebGL2 is not available: every element uses its native behavior.'
    : reduced
      ? 'Reduced motion or another accessibility preference: every element uses its native behavior.'
      : 'One renderer, three effects. Open a row, the dialog or the popover.'
})
