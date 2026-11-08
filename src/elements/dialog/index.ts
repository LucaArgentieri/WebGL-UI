import { resolveRenderer } from '../../core/renderer'
import { effectsAllowed } from '../../core/preferences'
import { backdropEffect } from '../../effects/backdrop'
import { readCoverColor } from '../../core/color'
import { MAX_DURATION } from '../../core/preferences'
import type { EffectDef, FxLayout, RendererSource, Vec3 } from '../../core/types'

export interface DialogFxOptions {
  renderer: RendererSource
  /** Effect to use. Default: backdrop. */
  effect?: EffectDef
  /**
   * 'viewport' (default): the effect paints the backdrop, behind the panel.
   * 'host': the effect paints over the dialog box, so the panel itself appears from it; the backdrop is left to
   * CSS and fades in with --p (see dialog.css). The cover color is `--fx-cover` on the dialog, else the surface.
   * 'behind': like 'host', but the effect paints behind the panel's content: with a veil effect the panel's
   * surface appears from nothing while its content stays on top (dialog.css makes the surface transparent).
   */
  layout?: FxLayout
  /** Opening duration in ms. Closing takes 65% of it. Default 1200. */
  duration?: number
  /**
   * Layout 'viewport' only: keep the last frame of the opening as the backdrop. When the opening ends, its pixels
   * become the ::backdrop's background image (`--fx-backdrop-image`, `[data-fx-snapshot]`), so a backdrop CSS
   * cannot draw (noise, halftone…) stays on screen while the canvas goes away, as always. Before that, the effect's
   * motion (`uDrift`) goes on for `drift` ms and eases to a stop. Default false.
   */
  keepBackdrop?: boolean
  /**
   * With keepBackdrop: how long the backdrop keeps moving after the opening, slowing down to a stop. The opening
   * plus this stays under five seconds by default (WCAG 2.2.2: motion that lasts longer needs a pause control).
   * Default 3500.
   */
  drift?: number
  /**
   * Layout 'viewport' only: the effect also paints the panel's surface (it receives the panel's rectangle as
   * `uPanel` and its color, `--fx-cover`, as `uSheet`), so the panel is transparent while animating
   * (`[data-fx-behind]`, see dialog.css). Default false.
   */
  paintsPanel?: boolean
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
  const duration = options.duration ?? 1200
  const effect = options.effect ?? backdropEffect
  const layout = options.layout ?? 'viewport'
  const trace = options.trace ?? (() => {})
  const proto = HTMLDialogElement.prototype
  const nativeShowModal = proto.showModal
  const nativeClose = proto.close
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
    return effectsAllowed()
  }
  void resolveRenderer(options.renderer).prepare(effect)

  // keepBackdrop: after the opening, the backdrop drifts to a stop ([data-fx-ambient], the canvas still draws it),
  // then its still frame becomes the ::backdrop image ([data-fx-snapshot]). A token invalidates late callbacks.
  let ambientId = 0
  let snapshotUrl: string | null = null
  let restingDrift = 0

  function clearSnapshot() {
    if (dialog.hasAttribute('data-fx-ambient')) resolveRenderer(options.renderer).cancel(owner)
    ambientId++
    dialog.removeAttribute('data-fx-ambient')
    dialog.removeAttribute('data-fx-snapshot')
    dialog.style.removeProperty('--fx-backdrop-image')
    if (snapshotUrl) { URL.revokeObjectURL(snapshotUrl); snapshotUrl = null }
  }

  // The panel's corner radius in canvas pixels, for effects that draw a rounded box (uRadius).
  function panelRadius(): number {
    const panel = dialog.querySelector('[data-fx-panel]') ?? dialog
    return (parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 0) * Math.min(devicePixelRatio || 1, 2)
  }

  // The panel's rectangle in the viewport canvas, as uv with the origin at the bottom left (GLSL convention).
  function panelRect(): [number, number, number, number] {
    const panel = dialog.querySelector('[data-fx-panel]') ?? dialog
    const r = panel.getBoundingClientRect()
    const w = document.documentElement.clientWidth || innerWidth // the viewport canvas covers the initial containing block
    const h = document.documentElement.clientHeight || innerHeight
    return [r.left / w, 1 - r.bottom / h, r.width / w, r.height / h]
  }

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
        clearSnapshot()
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
    renderer.cancel(owner) // one of my own animations (or the backdrop's drift) still running must not stay alive
    ambientId++
    dialog.removeAttribute('data-fx-ambient')
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
        color: layout === 'viewport' ? dim.rgb : readCoverColor(dialog),
        alpha: layout === 'viewport' ? dim.alpha : 1,
        layout,
        params: layout === 'viewport' ? panelParams(t => t) : { uRadius: panelRadius() },
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
    if (next && completed && options.keepBackdrop && layout === 'viewport') void persistBackdrop()
  }

  // Uniforms of a viewport effect: the panel's rectangle and color, and the noise's position in time.
  function panelParams(drift: (time: number) => number) {
    const uPanel = options.paintsPanel ? panelRect() : [0, 0, 0, 0]
    const uSheet = readCoverColor(dialog)
    return (_p: number, time: number) => ({ uPanel, uSheet, uDrift: drift(time) })
  }

  async function persistBackdrop() {
    const renderer = resolveRenderer(options.renderer)
    const token = ++ambientId
    const dim = readDim(dialog)
    const base = { effect, owner, layout, color: dim.rgb, alpha: dim.alpha, from: 1, to: 1 }
    const seconds = Math.max(0, Math.min(options.drift ?? 3500, MAX_DURATION)) / 1000
    const t0 = clock
    // Velocity falls linearly from the opening's speed to zero: drift = t0 + s·(k − k²/2), k = elapsed / s.
    const eased = (time: number) => {
      const k = seconds > 0 ? Math.min(1, Math.max(0, (time - t0) / seconds)) : 1
      clock = t0 + seconds * (k - (k * k) / 2) // a closing started now continues from here, without a jump
      return clock
    }
    restingDrift = eased(t0 + seconds)
    dialog.setAttribute('data-fx-ambient', '')
    if (seconds > 0) {
      const done = await renderer.play(dialog, { ...base, duration: seconds * 1000, time0: t0, params: panelParams(eased) })
      if (!done || token !== ambientId) return
    }
    await snapshot(token)
  }

  // Draws the still frame, reads it without blocking (toBlob) and hands it to CSS once decoded; the canvas stays
  // until then, so there is no frame without a backdrop.
  async function snapshot(token: number) {
    const renderer = resolveRenderer(options.renderer)
    const dim = readDim(dialog)
    void renderer.play(dialog, {
      effect, owner, layout, color: dim.rgb, alpha: dim.alpha, from: 1, to: 1, duration: MAX_DURATION,
      time0: restingDrift, params: panelParams(() => restingDrift)
    })
    clock = restingDrift
    const blob = await new Promise<Blob | null>(resolve => renderer.canvas.toBlob(resolve, 'image/png'))
    if (!blob || token !== ambientId) return
    const url = URL.createObjectURL(blob)
    try { const img = new Image(); img.src = url; await img.decode() } catch { /* use it anyway */ }
    if (token !== ambientId) { URL.revokeObjectURL(url); return }
    if (snapshotUrl) URL.revokeObjectURL(snapshotUrl)
    snapshotUrl = url
    dialog.style.setProperty('--fx-backdrop-image', `url("${url}")`)
    dialog.setAttribute('data-fx-snapshot', '')
    dialog.removeAttribute('data-fx-ambient')
    renderer.cancel(owner) // the image is in place: the canvas can go
  }

  // A resized window would stretch the still frame: draw it again at the new size.
  function onResize() {
    if (!dialog.hasAttribute('data-fx-snapshot') || running || !fxAvailable()) return
    void snapshot(ambientId)
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

  // `commandfor` buttons (command="show-modal" / "close") fire a cancelable `command` event on the dialog.
  // "request-close" is left to the browser: it goes through `cancel`, which is already animated.
  function onCommand(e: Event) {
    const { command, source } = e as Event & { command?: string; source?: Element | null }
    if (e.defaultPrevented || !fxAvailable()) return
    if (command === 'show-modal') {
      e.preventDefault()
      showModal()
    } else if (command === 'close') {
      e.preventDefault()
      const value = source instanceof HTMLButtonElement ? source.value : undefined
      close(value)
    }
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
    clearSnapshot()
  }

  if (layout !== 'viewport') dialog.setAttribute('data-fx-host', '')
  if (layout === 'behind' || (layout === 'viewport' && options.paintsPanel)) dialog.setAttribute('data-fx-behind', '')
  dialog.showModal = showModal
  dialog.close = close
  dialog.addEventListener('cancel', onCancel)
  dialog.addEventListener('command', onCommand)
  if (options.keepBackdrop) addEventListener('resize', onResize)
  dialog.addEventListener('submit', onSubmit)
  dialog.addEventListener('close', onClose)

  return {
    showModal,
    close,
    destroy() {
      abortRun()
      runId++
      dialog.removeAttribute('data-fx-host')
      dialog.removeAttribute('data-fx-behind')
      clearSnapshot()
      Reflect.deleteProperty(dialog, 'showModal') // back to the prototype's native method
      Reflect.deleteProperty(dialog, 'close')
      dialog.removeEventListener('cancel', onCancel)
      dialog.removeEventListener('command', onCommand)
      removeEventListener('resize', onResize)
      dialog.removeEventListener('submit', onSubmit)
      dialog.removeEventListener('close', onClose)
    },
    debug: () => ({ open: dialog.open, target, running, progress: +progress.toFixed(3) })
  }
}
