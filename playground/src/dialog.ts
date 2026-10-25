import { createRenderer, createGlslEffect, createDialogFx, BACKDROP_FRAG } from 'webgl-ui'
import '../../src/elements/dialog/dialog.css'
import { runStress, createTrace, sleep, formatResult } from './stress'

const dlgA = document.getElementById('dlgA') as HTMLDialogElement
const dlgB = document.getElementById('dlgB') as HTMLDialogElement
const dialogs = [dlgA, dlgB]
const status = document.getElementById('status')!
const resultEl = document.getElementById('result')!
const stressBtn = document.getElementById('stress') as HTMLButtonElement
const logEl = document.getElementById('log')!
const TOTAL = 80

// Event log: these listeners must be registered BEFORE createDialogFx
let quiet = false
function log(message: string) {
  if (quiet) return
  const li = document.createElement('li')
  li.textContent = message
  logEl.prepend(li)
  while (logEl.children.length > 8) logEl.lastElementChild!.remove()
}
dialogs.forEach(d => {
  d.addEventListener('cancel', () => log(`${d.id}: cancel`))
  d.addEventListener('close', () => log(`${d.id}: close, returnValue “${d.returnValue}”`))
})

const renderer = createRenderer(createGlslEffect(BACKDROP_FRAG))
const trace = createTrace()
const fxs = dialogs.map(d => createDialogFx(d, { renderer, trace: trace.push }))

document.getElementById('openA')!.addEventListener('click', () => dlgA.showModal())
document.getElementById('openB')!.addEventListener('click', () => dlgB.showModal())

// Each op returns the expected "open" state after it ran
const OPS: Record<string, (d: HTMLDialogElement) => boolean> = {
  open: d => { try { d.showModal() } catch { /* same as the native one */ } return true },
  close: d => { d.close('stress'); return false },
  esc: d => {
    // Simulates Esc: a cancelable cancel event; without the effect the default action closes
    const ev = new Event('cancel', { cancelable: true })
    d.dispatchEvent(ev)
    if (!ev.defaultPrevented && d.open) d.close()
    return false
  },
  submit: d => {
    const form = d.querySelector('form')!
    form.requestSubmit(form.querySelector<HTMLButtonElement>('button[value]'))
    return false
  }
}

function stress() {
  quiet = true
  return runStress<HTMLDialogElement>({
    elements: dialogs,
    total: TOTAL,
    trace: trace.lines,
    ops: Object.fromEntries(Object.entries(OPS).map(([name, op]) => [name, (d: HTMLDialogElement) => op(d)])),
    opNames: ['open', 'open', 'open', 'close', 'esc', 'esc', 'submit'],
    async prepare() {
      renderer.cancel()
      await sleep(100)
      dialogs.forEach(d => { if (d.open) d.close() })
      await sleep(1000)
    },
    isOpen: d => d.open,
    check(d, _i, expected) {
      const p: string[] = []
      if (d.open !== expected) p.push(`${d.id}: open=${d.open}, expected ${expected}`)
      if (d.hasAttribute('data-animating')) p.push(`${d.id}: leftover data-animating`)
      if (d.style.getPropertyValue('--p')) p.push(`${d.id}: leftover --p`)
      if (d.open && !d.matches(':modal')) p.push(`${d.id}: open but not modal`)
      return p
    },
    globalCheck() {
      const p: string[] = []
      if (document.querySelector('dialog canvas')) p.push('canvas still in the DOM')
      if (!renderer.isReady()) p.push('renderer not ready anymore')
      const active = document.activeElement
      if (!dialogs.some(d => d.open) && active && active.closest('dialog')) p.push('focus left inside a closed dialog')
      return p
    },
    describe: () => fxs.map((f, i) => `${dialogs[i]!.id} ${JSON.stringify(f.debug())}`).join('; '),
    async finish() {
      dialogs.forEach(d => { if (d.open) d.close() })
      await sleep(1000)
      quiet = false
    }
  })
}

stressBtn.addEventListener('click', async () => {
  stressBtn.disabled = true
  resultEl.textContent = 'Running…'
  resultEl.textContent = formatResult(await stress(), TOTAL)
  stressBtn.disabled = false
})

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
renderer.whenReady.then(() => {
  status.textContent = !renderer.isReady()
    ? 'WebGL2 is not available: the dialogs use native behavior.'
    : reduced
      ? 'Reduced motion: the dialogs use native behavior.'
      : 'GLSL on WebGL2. Open the dialog to see the backdrop.'
})

Object.assign(window, {
  __webglUi: {
    ready: () => renderer.whenReady.then(() => renderer.isReady()),
    runStress: stress
  }
})
