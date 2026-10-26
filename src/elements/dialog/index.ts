import { resolveRenderer } from '../../core/renderer'
import { backdropEffect } from '../../effects/backdrop'
import { readCoverColor } from '../../core/color'
import type { EffectDef, FxLayout, RendererSource, Vec3 } from '../../core/types'

export interface DialogFxOptions {
  renderer: RendererSource
  /** Effect to use. Default: backdrop. */
  effect?: EffectDef
  /**
   * 'viewport' (default): the effect paints the backdrop, behind the panel.
   * 'host': the effect paints over the dialog box, so the panel itself appears from it; the backdrop is left to
   * CSS and fades in with --p (see dialog.css). The cover color is `--fx-cover` on the dialog, else the surface.
   */
  layout?: FxLayout
  /** Opening duration in ms. Closing takes 65% of it. Default 700. */
  duration?: number
  /** Debug hook for internal decisions. */
  trace?: (message: string) => void
}

export interface DialogFx {
  showModal(): void
  close(returnValue?: string): void
  destroy(): void
  debug(): { open: boolean; target: boolean; running: boolean; progress: number }
}

const DEFAULT_RGB: Vec3 = [8 / 255, 14 / 255, 22 / 255]

// The backdrop color lives in two CSS custom properties (see dialog.css): CSS and shader read the same values.
function readDim(el: Element): { rgb: Vec3; alpha: number } {
  const cs = getComputedStyle(el)
  const parts = cs.getPropertyValue('--fx-rgb').split(',').map(s => parseFloat(s) / 255)
  const alpha = parseFloat(cs.getPropertyValue('--fx-a'))
  const rgb: Vec3 = parts.length === 3 && parts.every(Number.isFinite)
    ? [parts[0]!, parts[1]!, parts[2]!]
    : DEFAULT_RGB
  return { rgb, alpha: Number.isFinite(alpha) ? alpha : 0.62 }
}

/**
 * WebGL backdrop (and panel progress via --p) for a native modal <dialog>.
 * showModal() and close() are replaced on the instance with the same signatures; the native ones still do
 * the real work (top layer, inert, focus trap, focus restore, returnValue, close event).
 * Create it AFTER your own `cancel` listeners: whoever already called preventDefault has priority.
 */
export function createDialogFx(dialog: HTMLDialogElement, options: DialogFxOptions): DialogFx {
  const duration = options.duration ?? 700
  const effect = options.effect ?? backdropEffect
  const layout = options.layout ?? 'viewport'
  const trace = options.trace ?? (() => {})
  const proto = HTMLDialogElement.prototype
  const nativeShowModal = proto.showModal
  const nativeClose = proto.close
  const reduce = matchMedia('(prefers-reduced-motion: reduce)')
  const owner = dialog
  const label = dialog.id || 'dialog'

  // Logical state: where the dialog is heading. showModal() and close() change it immediately, like the native ones.
  let target = dialog.open
  let progress = target ? 1 : 0 // 0 closed, 1 open
  let clock = 0 // shader time, continuous across reversals
  let runId = 0 // the latest started animation wins
  let running = false
  let pendingReturnValue: string | undefined // undefined = returnValue untouched

  // Starts initializing the effect on the renderer (idempotent); until it is ready the dialog is native.
  const fxAvailable = () => {
    const r = resolveRenderer(options.renderer)
    if (!r.isReady(effect)) { void r.prepare(effect); return false }
    return !reduce.matches
  }
  void resolveRenderer(options.renderer).prepare(effect)

  function cleanup() {
    dialog.removeAttribute('data-animating')
    dialog.style.removeProperty('--p')
  }

  // The only place that really closes/reopens: brings the dialog to its final state and cleans up.
  function settle() {
    trace(`${label} settle target=${target} open=${dialog.open}`)
    running = false
    progress = target ? 1 : 0
    try {
      if (target) {
        if (!dialog.open) nativeShowModal.call(dialog)
      } else if (dialog.open) {
        const rv = pendingReturnValue
        pendingReturnValue = undefined
        nativeClose.call(dialog, rv) // the browser restores focus and emits `close` here
      }
    } finally {
      cleanup()
    }
  }

  function abortRun() {
    if (!running) return
    runId++
    resolveRenderer(options.renderer).cancel(owner) // only my animation, never another dialog's
    settle()
  }

  async function animateTo(next: boolean) {
    const renderer = resolveRenderer(options.renderer)
    const id = ++runId
    renderer.cancel(owner) // one of my own animations still running must not stay alive
    target = next
    const from = progress
    const to = next ? 1 : 0
    const distance = Math.abs(to - from)
    trace(`${label} run#${id} ${next ? 'open' : 'close'} from ${from.toFixed(2)}`)
    if (distance < 0.001) { settle(); return }

    running = true
    dialog.setAttribute('data-animating', '')
    const dim = readDim(dialog)

    let completed = false
    try {
      // Starts from the current progress: a reversal halfway through does not jump.
      completed = await renderer.play(dialog, {
        effect,
        from,
        to,
        duration: Math.max(120, (next ? duration : duration * 0.65) * distance),
        owner,
        time0: clock,
        color: layout === 'host' ? readCoverColor(dialog) : dim.rgb,
        alpha: layout === 'host' ? 1 : dim.alpha,
        layout,
        onFrame: (p, t) => {
          if (id !== runId) return // frame of a superseded animation: writes nothing
          progress = p
          clock = t
          dialog.style.setProperty('--p', p.toFixed(4))
        }
      })
    } catch (err) {
      console.warn('[webgl-ui] dialog animation failed', err)
    }

    if (id !== runId) { trace(`${label} run#${id} superseded`); return }
    settle() // finished, or interrupted from outside (another dialog, lost context)
  }

  /* Public API: same signatures as the native methods */
  function showModal(): void {
    if (!fxAvailable()) {
      abortRun()
      nativeShowModal.call(dialog)
      target = true
      progress = 1
      return
    }
    const wasOpen = dialog.open
    if (!wasOpen) nativeShowModal.call(dialog) // synchronous: throws the same errors as the native one
    else if (!dialog.matches(':modal')) { nativeShowModal.call(dialog); return }
    if (wasOpen && target) return // already open or opening: no-op
    if (!wasOpen) progress = 0 // it was closed: any previous state is stale, start from zero
    pendingReturnValue = undefined
    void animateTo(true)
  }

  function close(returnValue?: string): void {
    if (!fxAvailable()) {
      abortRun()
      target = false
      progress = 0
      nativeClose.call(dialog, returnValue)
      return
    }
    if (!dialog.open || !target) return // already closed or closing: the first close wins, like the native one
    if (returnValue !== undefined) pendingReturnValue = returnValue
    void animateTo(false)
  }

  /* Native paths where the browser closes the dialog by itself: intercepted so they can be animated */
  function onCancel(e: Event) {
    // Esc and light dismiss. If someone already vetoed the close, or it is not cancelable: native behavior.
    if (e.defaultPrevented || !e.cancelable || !fxAvailable()) return
    e.preventDefault()
    if (target) void animateTo(false)
  }

  function onSubmit(e: SubmitEvent) {
    // <form method="dialog">
    const form = e.target
    if (!(form instanceof HTMLFormElement) || form.closest('dialog') !== dialog) return
    const submitter = e.submitter as HTMLButtonElement | HTMLInputElement | null
    // formMethod without the attribute is not reliable across browsers: it only counts if present.
    const method = submitter && submitter.hasAttribute('formmethod') ? submitter.formMethod : form.method
    if (method !== 'dialog' || !fxAvailable()) return
    e.preventDefault()
    close(submitter ? submitter.value : undefined)
  }

  function onClose() {
    // Native close: ours, or a non-cancelable Esc.
    trace(`${label} close event open=${dialog.open} running=${running} target=${target}`)
    if (dialog.open) return // late event: it has been reopened in the meantime
    if (running) { runId++; resolveRenderer(options.renderer).cancel(owner) }
    running = false
    target = false
    progress = 0
    pendingReturnValue = undefined
    cleanup()
  }

  if (layout === 'host') dialog.setAttribute('data-fx-host', '')
  dialog.showModal = showModal
  dialog.close = close
  dialog.addEventListener('cancel', onCancel)
  dialog.addEventListener('submit', onSubmit)
  dialog.addEventListener('close', onClose)

  return {
    showModal,
    close,
    destroy() {
      abortRun()
      runId++
      dialog.removeAttribute('data-fx-host')
      Reflect.deleteProperty(dialog, 'showModal') // back to the prototype's native method
      Reflect.deleteProperty(dialog, 'close')
      dialog.removeEventListener('cancel', onCancel)
      dialog.removeEventListener('submit', onSubmit)
      dialog.removeEventListener('close', onClose)
    },
    debug: () => ({ open: dialog.open, target, running, progress: +progress.toFixed(3) })
  }
}
