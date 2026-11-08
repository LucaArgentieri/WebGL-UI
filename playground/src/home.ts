import { createRenderer, createDetailsFx, createDialogFx, createPopoverFx, inkEffect, inkVeilEffect, glassEffect, effectsAllowed } from 'webgl-ui'
import '../../src/elements/dialog/dialog.css'

// One renderer for the whole page: one canvas, one WebGL context, two effects.
const renderer = createRenderer()

document.querySelectorAll('details').forEach(d => createDetailsFx(d, { renderer, effect: inkEffect, duration: 900 }))

const dialog = document.getElementById('home-dialog') as HTMLDialogElement
// Glass: the frosted blur is CSS (backdrop-filter), the shader adds what CSS cannot, a rim with a light RGB split
// and a sweep of light while the glass forms; at the end it is transparent and the CSS glass stays.
createDialogFx(dialog, { renderer, effect: glassEffect, layout: 'host' })
document.getElementById('open-dialog')!.addEventListener('click', () => dialog.showModal())

createPopoverFx(document.getElementById('home-pop')!, { renderer, effect: inkVeilEffect, layout: 'behind' })

const reduced = !effectsAllowed()
Promise.all([renderer.prepare(inkEffect), renderer.prepare(inkVeilEffect), renderer.prepare(glassEffect)]).then(r => r.every(Boolean)).then(ready => {
  document.getElementById('status')!.textContent = !ready
    ? 'WebGL2 is not available: every element uses its native behavior.'
    : reduced
      ? 'Reduced motion or another accessibility preference: every element uses its native behavior.'
      : 'One renderer, three effects. Open a row, the dialog or the popover.'
})
