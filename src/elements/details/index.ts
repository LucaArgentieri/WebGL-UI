import { resolveRenderer } from '../../core/renderer'
import { readSurfaceColor } from '../../core/color'
import type { RendererSource } from '../../core/types'

export interface DetailsFxOptions {
  renderer: RendererSource
  /** Opening duration in ms. Closing takes 70% of it. Default 800. */
  duration?: number
  /** Content element. Default: the first child that is not the <summary>. */
  content?: HTMLElement
  /** Debug hook for internal decisions. */
  trace?: (message: string) => void
}

export interface DetailsFx {
  destroy(): void
  debug(): { open: boolean; target: boolean; running: boolean; progress: number }
}

/**
 * WebGL reveal + height transition for a native <details>.
 * The native element stays the source of truth: the `open` attribute is only written by settle().
 */
export function createDetailsFx(details: HTMLDetailsElement, options: DetailsFxOptions): DetailsFx {
  const duration = options.duration ?? 800
  const trace = options.trace ?? (() => {})
  const summary = details.querySelector<HTMLElement>(':scope > summary')
  const content = options.content ?? details.querySelector<HTMLElement>(':scope > :not(summary)')
  if (!summary || !content) {
    throw new Error('[webgl-ui] createDetailsFx needs a <summary> and a content element')
  }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)')
  const owner = details

  // Logical state: where the details is heading. Each click flips it immediately, like the native `open`.
  let target = details.open
  let progress = target ? 1 : 0 // 0 closed, 1 open: updated on every frame
  let clock = 0 // shader time, continuous across reversals
  let runId = 0 // the latest started animation wins
  let running = false

  // Inline styles we add during the animation, restored by settle().
  let prevOverflow: string | null = null
  let prevPosition: string | null = null

  function lockLayout() {
    if (prevOverflow === null) {
      prevOverflow = details.style.overflow
      details.style.overflow = 'hidden' // the details clips the full-size content
    }
    if (prevPosition === null && getComputedStyle(content!).position === 'static') {
      prevPosition = content!.style.position
      content!.style.position = 'relative' // anchor for the canvas
    }
  }

  function unlockLayout() {
    details.style.height = ''
    if (prevOverflow !== null) { details.style.overflow = prevOverflow; prevOverflow = null }
    if (prevPosition !== null) { content!.style.position = prevPosition; prevPosition = null }
  }

  // The only place that writes `open` and cleans up: brings the details to its final state.
  function settle() {
    trace(`details settle target=${target} open=${details.open}`)
    unlockLayout()
    details.open = target
    progress = target ? 1 : 0
    running = false
  }

  async function animateTo(next: boolean) {
    const renderer = resolveRenderer(options.renderer)
    const id = ++runId
    renderer.cancel(owner) // one of my own animations still running must not stay alive
    target = next
    const from = progress
    const to = next ? 1 : 0
    const distance = Math.abs(to - from)
    trace(`details run#${id} ${next ? 'open' : 'close'} from ${from.toFixed(2)}`)
    if (distance < 0.001) { settle(); return }

    running = true
    lockLayout()
    if (next) details.open = true // when closing it stays true until the end: the content must stay visible
    const closed = summary!.offsetHeight + (details.offsetHeight - details.clientHeight)

    let completed = false
    try {
      // Starts from the current progress: a reversal halfway through does not jump.
      completed = await renderer.play(content!, {
        from,
        to,
        duration: Math.max(120, (next ? duration : duration * 0.7) * distance),
        time0: clock,
        color: readSurfaceColor(content!),
        owner,
        layout: 'host',
        onFrame: (p, t) => {
          if (id !== runId) return // frame of a superseded animation: writes nothing
          progress = p
          clock = t
          // The content keeps its full size (and the canvas with it): the details clips it.
          details.style.height = closed + content!.offsetHeight * p + 'px'
        }
      })
    } catch (err) {
      console.warn('[webgl-ui] details animation failed', err)
    }

    if (id !== runId) { trace(`details run#${id} superseded`); return }
    settle() // finished, or interrupted from outside (another element, lost context)
  }

  function onClick(e: MouseEvent) {
    if ((e.target as Element).closest('summary') !== summary) return
    const renderer = resolveRenderer(options.renderer)
    if (!renderer.isReady() || reduce.matches) {
      // Pure native behavior. An animation still running goes to its final state first,
      // otherwise it would add up with the native toggle.
      if (running) { runId++; renderer.cancel(owner); settle() }
      return
    }
    e.preventDefault()
    void animateTo(!target)
  }

  // External changes (native toggle, find-in-page, script) while not animating.
  function onToggle() {
    if (!running) { target = details.open; progress = target ? 1 : 0 }
  }

  summary.addEventListener('click', onClick)
  details.addEventListener('toggle', onToggle)

  return {
    destroy() {
      if (running) { runId++; resolveRenderer(options.renderer).cancel(owner); settle() }
      summary.removeEventListener('click', onClick)
      details.removeEventListener('toggle', onToggle)
    },
    debug: () => ({ open: details.open, target, running, progress: +progress.toFixed(3) })
  }
}
