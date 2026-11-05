import {
  createRenderer, createDetailsFx, createDialogFx, createPopoverFx, createImageFx, createProgressFx, defineGlslEffect, readCoverColor, inkImageEffect,
  inkEffect, inkVeilEffect, dissolveEffect, wipeEffect, backdropEffect, type EffectDef, effectsAllowed } from 'webgl-ui'
import '../../src/elements/dialog/dialog.css'
import '../../src/elements/progress/progress.css'

/** The custom effect of the cookbook ("Your own effect"); the page shows this exact source. */
export const BLINDS_FRAG = `#version 300 es
precision highp float;
uniform float uProgress;   // 0 = covered, 1 = revealed
uniform vec2  uResolution; // canvas size in pixels
uniform vec3  uColor;      // cover color (sRGB 0..1)
out vec4 outColor;

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float row = fract((1.0 - uv.y) * 9.0);              // nine horizontal slats
  float cover = smoothstep(uProgress - 0.06, uProgress + 0.06, row);
  outColor = vec4(uColor * cover, cover);             // premultiplied alpha
}`
const blindsEffect = defineGlslEffect('blinds', BLINDS_FRAG)

const effects: Record<string, EffectDef> = {
  'ink-image': inkImageEffect, ink: inkEffect, 'ink-veil': inkVeilEffect, dissolve: dissolveEffect, wipe: wipeEffect, backdrop: backdropEffect, blinds: blindsEffect
}

// One renderer for the whole page: every example shares one canvas and one WebGL context.
const renderer = createRenderer()
const effectOf = (el: HTMLElement) => effects[el.dataset.effect ?? '']

document.querySelectorAll<HTMLElement>('[data-fx]').forEach(el => {
  const effect = effectOf(el)
  if (el.dataset.fx === 'details') createDetailsFx(el as HTMLDetailsElement, { renderer, effect })
  if (el.dataset.fx === 'popover') createPopoverFx(el, { renderer, effect })
  if (el.dataset.fx === 'progress') createProgressFx(el as HTMLProgressElement, { renderer, effect })
  if (el.dataset.fx === 'image') {
    const fx = createImageFx(el as HTMLImageElement, { renderer, effect })
    el.closest('.example')?.querySelector('[data-replay]')?.addEventListener('click', () => { void fx.reveal() })
  }
  if (el.dataset.fx === 'dialog') {
    createDialogFx(el as HTMLDialogElement, { renderer, effect, layout: el.dataset.layout === 'host' ? 'host' : 'viewport' })
  }
})
document.querySelectorAll<HTMLButtonElement>('[data-open-dialog]').forEach(b => {
  b.addEventListener('click', () => (document.getElementById(b.dataset.openDialog!) as HTMLDialogElement).showModal())
})

document.querySelectorAll<HTMLButtonElement>('[data-step]').forEach(b => {
  b.addEventListener('click', () => {
    const bar = document.getElementById(b.dataset.step!) as HTMLProgressElement
    bar.value = Math.min(bar.max, Math.max(0, bar.value + Number(b.dataset.by)))
    bar.textContent = `${Math.round((bar.value / bar.max) * 100)}%`
  })
})

// Effect gallery: plays an effect on a plain box, straight through the renderer.
document.querySelectorAll<HTMLButtonElement>('[data-play]').forEach(b => {
  const effect = effects[b.dataset.play!]!
  const stage = b.closest('.swatch')!.querySelector<HTMLElement>('.swatch-stage')!
  void renderer.prepare(effect)
  b.addEventListener('click', () => {
    if (!effectsAllowed()) return
    const veil = b.dataset.veil !== undefined
    void renderer.play(stage, {
      effect, from: 0, to: 1, duration: 1100, owner: stage, layout: 'host',
      color: veil ? [0.106, 0.094, 0.082] : readCoverColor(stage), alpha: veil ? 0.85 : 1
    })
  })
})

// Sources shown on the page come from the code itself, so they cannot drift.
document.querySelectorAll<HTMLElement>('code[data-source="blinds"]').forEach(c => { c.textContent = BLINDS_FRAG })

// Copy buttons on code blocks.
if (navigator.clipboard) {
  document.querySelectorAll('pre').forEach(pre => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'copy'
    button.textContent = 'Copy'
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pre.querySelector('code')?.textContent ?? '')
        button.textContent = 'Copied'
      } catch {
        button.textContent = 'Copy failed'
      }
      setTimeout(() => { button.textContent = 'Copy' }, 1500)
    })
    pre.append(button)
  })
}

const status = document.getElementById('docs-status')
if (status) {
  void renderer.prepare(inkEffect).then(ready => {
    status.textContent = ready ? '' : 'WebGL2 is not available here: the examples use the native behavior.'
  })
}

// Test hook (e2e pixel probes): the page's renderer and its effects.
Object.assign(window, { __docs: { renderer, effects } })
