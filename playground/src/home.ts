import { createRenderer, createDetailsFx, createDialogFx, createPopoverFx, inkEffect, inkVeilEffect, liquidGlassEffect, effectsAllowed } from 'webgl-ui'
import '../../src/elements/dialog/dialog.css'

// One renderer for the page: one canvas, one WebGL context, shared by the details and the popover.
const renderer = createRenderer()

document.querySelectorAll('details').forEach(d => createDetailsFx(d, { renderer, effect: inkEffect, duration: 900 }))

const dialog = document.getElementById('home-dialog') as HTMLDialogElement
// Liquid glass backdrop, drawn with WebGPU (GLSL fallback): a canvas holds one kind of context, so the dialog has
// a renderer of its own. The page's frosting is CSS (backdrop-filter); the shader draws the glass over it, and its
// still frame stays as the ::backdrop once the surface has drifted to a stop (keepBackdrop).
const gpuRenderer = createRenderer()
createDialogFx(dialog, { renderer: gpuRenderer, effect: liquidGlassEffect, keepBackdrop: true })
document.getElementById('open-dialog')!.addEventListener('click', () => dialog.showModal())

createPopoverFx(document.getElementById('home-pop')!, { renderer, effect: inkVeilEffect, layout: 'behind' })

const reduced = !effectsAllowed()
Promise.all([renderer.prepare(inkEffect), renderer.prepare(inkVeilEffect), gpuRenderer.prepare(liquidGlassEffect)]).then(r => r.every(Boolean)).then(ready => {
  document.getElementById('status')!.textContent = !ready
    ? 'WebGL2 is not available: every element uses its native behavior.'
    : reduced
      ? 'Reduced motion or another accessibility preference: every element uses its native behavior.'
      : 'WebGL for the page, WebGPU for the dialog. Open a row, the dialog or the popover.'
})
