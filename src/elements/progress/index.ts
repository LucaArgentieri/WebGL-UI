import { resolveRenderer } from '../../core/renderer'
import { effectsAllowed } from '../../core/preferences'
import { inkBarEffect } from '../../effects/bar'
import type { EffectDef, RendererSource, Vec3 } from '../../core/types'

export interface ProgressFxOptions {
  renderer: RendererSource
  /** Effect to use. Default: inkBarEffect. It receives uValue (from, to) and uRtl. */
  effect?: EffectDef
  /** Duration of a change across the whole bar, in ms; shorter changes take less. Default 1400. */
  duration?: number
  /** The box the canvas covers. Default: the element's parent (see progress.css). */
  stage?: HTMLElement
}

export interface ProgressFx {
  destroy(): void
  debug(): { value: number | null; shown: number | null; running: boolean }
}

type Bar = HTMLProgressElement | HTMLMeterElement

/** The value as a fraction of the bar, or null when the progress is indeterminate. */
function fractionOf(el: Bar): number | null {
  if (el instanceof HTMLProgressElement) return el.position < 0 ? null : el.position
  const span = el.max - el.min
  return span > 0 ? Math.min(1, Math.max(0, (el.value - el.min) / span)) : 0
}

function fillColor(stage: Element): Vec3 {
  const m = getComputedStyle(stage).color.match(/[\d.]+/g)
  return m && m.length >= 3 ? [Number(m[0]) / 255, Number(m[1]) / 255, Number(m[2]) / 255] : [0, 0, 0]
}

/**
 * Animated value changes for a native <progress> or <meter>. The element keeps its role, value and every
 * attribute; the library only watches value / max / min and paints the move from the old value to the new one.
 * Indeterminate progress stays native.
 */
export function createProgressFx(el: Bar, options: ProgressFxOptions): ProgressFx {
  const effect = options.effect ?? inkBarEffect
  const duration = options.duration ?? 1400
  const stage = options.stage ?? (el.parentElement as HTMLElement | null)
  if (!stage) throw new Error('[webgl-ui] createProgressFx needs the element to be inside a stage element')
  const owner = el

  let shown = fractionOf(el) // what the canvas or the native bar currently shows
  let runId = 0
  let running = false
  let clock = 0

  void resolveRenderer(options.renderer).prepare(effect)

  function settle() {
    running = false
    stage!.removeAttribute('data-animating')
    stage!.style.removeProperty('--p')
  }

  async function animate(from: number, to: number) {
    const renderer = resolveRenderer(options.renderer)
    const id = ++runId
    renderer.cancel(owner)
    running = true
    stage!.setAttribute('data-animating', '')
    const rtl = getComputedStyle(el).direction === 'rtl' ? 1 : 0
    let completed = false
    try {
      completed = await renderer.play(stage!, {
        effect,
        from: 0,
        to: 1,
        duration: Math.max(450, duration * Math.abs(to - from)),
        owner,
        time0: clock,
        layout: 'host',
        color: fillColor(stage!),
        params: { uValue: [from, to], uRtl: rtl },
        onFrame: (p, t) => {
          if (id !== runId) return
          clock = t
          shown = from + (to - from) * p
          stage!.style.setProperty('--p', p.toFixed(4))
        }
      })
    } catch (err) {
      console.warn('[webgl-ui] progress animation failed', err)
    }
    if (id !== runId) return // superseded by a newer change, which starts from `shown`
    shown = completed ? to : fractionOf(el)
    settle()
  }

  function onChange() {
    const next = fractionOf(el)
    const renderer = resolveRenderer(options.renderer)
    if (next === null || shown === null || !effectsAllowed() || !renderer.isReady(effect)) {
      // Indeterminate, coming from indeterminate, or effects off: the native bar shows the value as is.
      if (running) { runId++; renderer.cancel(owner); settle() }
      shown = next
      if (!renderer.isReady(effect)) void renderer.prepare(effect)
      return
    }
    if (Math.abs(next - shown) < 0.0005) return
    void animate(shown, next)
  }

  const observer = new MutationObserver(onChange)
  observer.observe(el, { attributes: true, attributeFilter: ['value', 'max', 'min'] })

  return {
    destroy() {
      observer.disconnect()
      if (running) { runId++; resolveRenderer(options.renderer).cancel(owner); settle() }
    },
    debug: () => ({ value: fractionOf(el), shown, running })
  }
}
