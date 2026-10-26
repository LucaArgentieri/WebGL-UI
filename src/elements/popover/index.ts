import { resolveRenderer } from '../../core/renderer'
import { readCoverColor } from '../../core/color'
import { dissolveEffect } from '../../effects/dissolve'
import type { EffectDef, RendererSource } from '../../core/types'

export interface PopoverFxOptions {
  renderer: RendererSource
  /** Effect to use. Default: dissolve. */
  effect?: EffectDef
  /** Opening duration in ms. Closing takes 70% of it. Default 500. */
  duration?: number
  /** Debug hook for internal decisions. */
  trace?: (message: string) => void
}

export interface PopoverFx {
  showPopover(options?: unknown): void
  hidePopover(): void
  togglePopover(force?: boolean | { force?: boolean }): boolean
  destroy(): void
  debug(): { open: boolean; target: boolean; running: boolean; progress: number }
}

type Invoker = HTMLButtonElement | HTMLInputElement

/**
 * WebGL reveal for a native popover (`popover="auto"` or `"manual"`).
 * showPopover(), hidePopover() and togglePopover() are replaced on the instance with the same signatures, and
 * `popovertarget` buttons are intercepted; the native methods still do the real work (top layer, light dismiss,
 * focus, `toggle` events). Native closes the browser does by itself (Esc, light dismiss, another auto popover
 * opening) stay instant: they cannot be vetoed, so they are not animated.
 * While animating, the library sets [data-animating] and --p (0..1) on the popover, like the dialog does.
 */
export function createPopoverFx(popover: HTMLElement, options: PopoverFxOptions): PopoverFx {
  const duration = options.duration ?? 500
  const effect = options.effect ?? dissolveEffect
  const trace = options.trace ?? (() => {})
  const nativeShow = HTMLElement.prototype.showPopover
  const nativeHide = HTMLElement.prototype.hidePopover
  const reduce = matchMedia('(prefers-reduced-motion: reduce)')
  const owner = popover
  const label = popover.id || 'popover'
  const isOpen = () => popover.matches(':popover-open')

  // Logical state: where the popover is heading. The methods change it immediately, like the native ones.
  let target = isOpen()
  let progress = target ? 1 : 0 // 0 closed, 1 open: updated on every frame
  let clock = 0 // shader time, continuous across reversals
  let runId = 0 // the latest started animation wins
  let running = false

  // Starts initializing the effect on the renderer (idempotent); until it is ready the popover is native.
  const fxAvailable = () => {
    const r = resolveRenderer(options.renderer)
    if (!r.isReady(effect)) { void r.prepare(effect); return false }
    return !reduce.matches
  }
  void resolveRenderer(options.renderer).prepare(effect)

  function cleanup() {
    popover.removeAttribute('data-animating')
    popover.style.removeProperty('--p')
  }

  // The only place that really closes/reopens: brings the popover to its final state.
  function settle() {
    trace(`${label} settle target=${target} open=${isOpen()}`)
    running = false
    cleanup()
    progress = target ? 1 : 0
    if (target) {
      if (!isOpen()) nativeShow.call(popover)
    } else if (isOpen()) {
      nativeHide.call(popover)
    }
  }

  function abortRun() {
    if (!running) return
    runId++
    resolveRenderer(options.renderer).cancel(owner)
    running = false
    cleanup()
  }

  async function animateTo(next: boolean) {
    const renderer = resolveRenderer(options.renderer)
    const id = ++runId
    renderer.cancel(owner) // one of my own animations still running must not stay alive
    target = next
    const from = progress
    const to = next ? 1 : 0
    const distance = Math.abs(to - from)
    trace(`${label} run#${id} ${next ? 'show' : 'hide'} from ${from.toFixed(2)}`)
    if (distance < 0.001) { settle(); return }

    running = true
    popover.setAttribute('data-animating', '')
    let completed = false
    try {
      // Starts from the current progress: a reversal halfway through does not jump.
      completed = await renderer.play(popover, {
        effect,
        from,
        to,
        duration: Math.max(120, (next ? duration : duration * 0.7) * distance),
        owner,
        time0: clock,
        color: readCoverColor(popover),
        layout: 'host',
        onFrame: (p, t) => {
          if (id !== runId) return // frame of a superseded animation: writes nothing
          progress = p
          clock = t
          popover.style.setProperty('--p', p.toFixed(4)) // CSS can follow the same progress as the shader
        }
      })
    } catch (err) {
      console.warn('[webgl-ui] popover animation failed', err)
    }

    if (id !== runId) { trace(`${label} run#${id} superseded`); return }
    settle() // finished, or interrupted from outside (another element, lost context)
  }

  // The browser closes (or opens) a popover by itself on Esc, light dismiss and when another auto popover opens,
  // and tells us only later, in a queued `toggle` event. Every entry point first reconciles the logical state
  // with the real one, otherwise a call made between the two would act on stale state.
  function syncState() {
    const open = isOpen()
    if (!open && (running || target)) { abortRun(); target = false; progress = 0 } // closed behind our back
    else if (open && !running && !target) { target = true; progress = 1 } // opened behind our back
  }

  /* Public API: same signatures as the native methods */
  function showPopover(...args: unknown[]): void {
    syncState()
    const open = isOpen()
    if (!fxAvailable()) {
      abortRun()
      if (!open) (nativeShow as (...a: unknown[]) => void).apply(popover, args) // synchronous: same errors as native
      target = true
      progress = 1
      return
    }
    if (!open) (nativeShow as (...a: unknown[]) => void).apply(popover, args)
    if (open && target) return // already open or opening: no-op
    if (!open) progress = 0 // it was closed: any previous state is stale, start from zero
    void animateTo(true)
  }

  function hidePopover(): void {
    syncState()
    if (!fxAvailable()) {
      abortRun()
      target = false
      progress = 0
      if (isOpen()) nativeHide.call(popover)
      return
    }
    if (!isOpen() || !target) return // already closed or closing: the first hide wins
    void animateTo(false)
  }

  function togglePopover(force?: boolean | { force?: boolean }): boolean {
    syncState()
    const want = typeof force === 'object' ? force.force : force
    const next = want === undefined ? !target : want
    if (next) showPopover()
    else hidePopover()
    return target
  }

  popover.showPopover = showPopover as HTMLElement['showPopover']
  popover.hidePopover = hidePopover
  popover.togglePopover = togglePopover as HTMLElement['togglePopover']

  /* `popovertarget` buttons run the browser's internal algorithm, not our methods: intercept the click */
  function onInvokerClick(e: MouseEvent) {
    const invoker = (e.target as Element | null)?.closest<Invoker>('button[popovertarget], input[popovertarget]')
    if (!invoker || invoker.disabled || invoker.popoverTargetElement !== popover || e.defaultPrevented) return
    if (!fxAvailable()) return
    e.preventDefault() // cancels the native invocation (and a submit, like the native one does not)
    const action = invoker.popoverTargetAction
    if (action === 'show') showPopover()
    else if (action === 'hide') hidePopover()
    else togglePopover()
  }

  /* Native closes we cannot veto: Esc, light dismiss, another auto popover opening, or our own settle() */
  function onToggle() {
    trace(`${label} toggle event open=${isOpen()} running=${running} target=${target}`)
    if (isOpen()) { if (!running) { target = true; progress = 1 } return } // late event or native open
    if (running) { runId++; resolveRenderer(options.renderer).cancel(owner) }
    running = false
    target = false
    progress = 0
    cleanup()
  }

  document.addEventListener('click', onInvokerClick, true)
  popover.addEventListener('toggle', onToggle)

  return {
    showPopover,
    hidePopover,
    togglePopover,
    destroy() {
      if (running) { runId++; resolveRenderer(options.renderer).cancel(owner); settle() }
      Reflect.deleteProperty(popover, 'showPopover') // back to the prototype's native methods
      Reflect.deleteProperty(popover, 'hidePopover')
      Reflect.deleteProperty(popover, 'togglePopover')
      document.removeEventListener('click', onInvokerClick, true)
      popover.removeEventListener('toggle', onToggle)
    },
    debug: () => ({ open: isOpen(), target, running, progress: +progress.toFixed(3) })
  }
}
