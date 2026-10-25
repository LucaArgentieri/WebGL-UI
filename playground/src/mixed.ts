import {
  createRenderer, createDetailsFx, createDialogFx,
  dissolveEffect, wipeEffect, backdropEffect
} from 'webgl-ui'
import '../../src/elements/dialog/dialog.css'
import { runStress, createTrace, sleep, formatResult } from './stress'

// ONE renderer: one canvas, one WebGL context, shared by every element and every effect.
const renderer = createRenderer()
const trace = createTrace()

const detailsList = [...document.querySelectorAll<HTMLDetailsElement>('details')]
const dialog = document.getElementById('mdlg') as HTMLDialogElement
const status = document.getElementById('status')!
const resultEl = document.getElementById('result')!
const stressBtn = document.getElementById('stress') as HTMLButtonElement
const TOTAL = 80

// The effect is chosen per element.
detailsList.forEach(d => createDetailsFx(d, {
  renderer,
  effect: d.dataset.effect === 'wipe' ? wipeEffect : dissolveEffect,
  trace: trace.push
}))
createDialogFx(dialog, { renderer, trace: trace.push })

document.getElementById('open')!.addEventListener('click', () => dialog.showModal())

const summaryOf = (d: Element) => d.querySelector<HTMLElement>(':scope > summary')!
const allEffects = [dissolveEffect, wipeEffect, backdropEffect]
const prepareAll = () => Promise.all(allEffects.map(e => renderer.prepare(e)))

function stress() {
  quiet(true)
  return runStress<HTMLElement>({
    elements: [...detailsList, dialog],
    total: TOTAL,
    trace: trace.lines,
    ops: {
      toggle: (el, expected) => { summaryOf(el).click(); return !expected },
      open: el => { try { (el as HTMLDialogElement).showModal() } catch { /* same as the native one */ } return true },
      close: el => { (el as HTMLDialogElement).close('stress'); return false },
      esc: el => {
        const d = el as HTMLDialogElement
        const ev = new Event('cancel', { cancelable: true })
        d.dispatchEvent(ev)
        if (!ev.defaultPrevented && d.open) d.close()
        return false
      },
      submit: el => {
        const form = el.querySelector('form')!
        form.requestSubmit(form.querySelector<HTMLButtonElement>('button[value]'))
        return false
      }
    },
    opNames: el => (el instanceof HTMLDialogElement ? ['open', 'open', 'close', 'esc', 'submit'] : ['toggle']),
    async prepare() {
      renderer.cancel()
      await sleep(100)
      if (dialog.open) dialog.close()
      detailsList.forEach(d => { if (d.open) summaryOf(d).click() })
      await sleep(1200)
    },
    isOpen: el => (el as HTMLDetailsElement | HTMLDialogElement).open,
    check(el, _i, expected) {
      const p: string[] = []
      const open = (el as HTMLDetailsElement | HTMLDialogElement).open
      if (open !== expected) p.push(`${el.id}: open=${open}, expected ${expected}`)
      if (el instanceof HTMLDialogElement) {
        if (el.hasAttribute('data-animating')) p.push(`${el.id}: leftover data-animating`)
        if (el.style.getPropertyValue('--p')) p.push(`${el.id}: leftover --p`)
        if (el.open && !el.matches(':modal')) p.push(`${el.id}: open but not modal`)
      } else {
        if (el.style.height) p.push(`${el.id}: leftover height (${el.style.height})`)
        if (el.style.overflow) p.push(`${el.id}: leftover overflow (${el.style.overflow})`)
      }
      return p
    },
    globalCheck() {
      const p: string[] = []
      if (document.querySelector('canvas')) p.push('canvas still in the DOM')
      allEffects.forEach(e => { if (!renderer.isReady(e)) p.push(`effect "${e.name}" not ready anymore`) })
      return p
    },
    async finish() {
      if (dialog.open) dialog.close()
      await sleep(1000)
      quiet(false)
    }
  })
}

function quiet(_on: boolean) { /* no event log on this page */ }

stressBtn.addEventListener('click', async () => {
  stressBtn.disabled = true
  resultEl.textContent = 'Running…'
  resultEl.textContent = formatResult(await stress(), TOTAL)
  stressBtn.disabled = false
})

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
prepareAll().then(ready => {
  status.textContent = !ready.every(Boolean)
    ? 'WebGL2 is not available: the elements use native behavior.'
    : reduced
      ? 'Reduced motion: the elements use native behavior.'
      : 'One renderer, three effects (dissolve, wipe, backdrop). Tap an element.'
})

Object.assign(window, {
  __webglUi: {
    ready: () => prepareAll(),
    runStress: stress
  }
})
