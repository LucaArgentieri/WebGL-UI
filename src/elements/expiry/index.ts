import { resolveRenderer } from '../../core/renderer'
import { effectsAllowed, MAX_DURATION } from '../../core/preferences'
import { readSurfaceColor } from '../../core/color'
import { burnEffect } from '../../effects/burn'
import type { EffectDef, RendererSource, Vec3 } from '../../core/types'

export interface ExpiryFxOptions {
  renderer: RendererSource
  /** How long the element lives, in seconds. */
  seconds: number
  /** Effect to use. Default: burnEffect (it receives uBox and uDrift). */
  effect?: EffectDef
  /** How far, in CSS pixels, flames and smoke may reach outside the element. Default 56. */
  bleed?: number
  /** Called with the whole seconds left, each time they change: update your visible text here. */
  onTick?: (secondsLeft: number) => void
  /**
   * Called when the time is up, in the same task as the effect's last frame (the element fully burned): hide,
   * remove or replace the element here, so nothing flashes.
   */
  onExpire?: () => void
  /** Pause while the pointer is over the element or it has focus (WCAG 2.2.1 and 2.2.2). Default true. */
  pauseOnInteraction?: boolean
}

export interface ExpiryFx {
  start(): void
  pause(): void
  resume(): void
  /** Adds time (WCAG 2.2.1: let people extend a time limit). */
  extend(seconds: number): void
  /** Stops for good without expiring (e.g. the action was taken); the element is shown intact again. */
  cancel(): void
  secondsLeft(): number
  destroy(): void
}

/**
 * A time limit on an element (an "undo" button, an offer, a one-time link), with the element burning away as the
 * time runs out. The element stays native and focusable; the time limit and what expiry means are yours (onTick,
 * onExpire). The timer pauses on hover and focus, can be paused, resumed and extended, and runs without the effect
 * (reduced motion, no WebGL) exactly the same, minus the fire.
 */
export function createExpiryFx(el: HTMLElement, options: ExpiryFxOptions): ExpiryFx {
  const effect = options.effect ?? burnEffect
  const bleed = options.bleed ?? 56
  const owner = el
  let total = options.seconds * 1000
  let elapsedBefore = 0
  let startedAt = 0
  let state: 'idle' | 'running' | 'paused' | 'ended' = 'idle'
  let manualPause = false
  let interacting = false
  let runId = 0
  let drift = 0
  let lastTick = -1
  let interval: ReturnType<typeof setInterval> | undefined
  let prevPosition: string | null = null

  void resolveRenderer(options.renderer).prepare(effect)

  const now = () => performance.now()
  const elapsed = () => Math.min(total, elapsedBefore + (state === 'running' ? now() - startedAt : 0))
  const secondsLeft = () => Math.max(0, Math.ceil((total - elapsed()) / 1000))

  function pageColor(): Vec3 {
    const parts = getComputedStyle(el).getPropertyValue('--fx-cover').split(',').map(v => parseFloat(v) / 255)
    if (parts.length === 3 && parts.every(Number.isFinite)) return [parts[0]!, parts[1]!, parts[2]!]
    return readSurfaceColor(el.parentElement ?? el) // the colour behind the element, not the element's own
  }

  function playBase() {
    const r = el.getBoundingClientRect()
    const dpr = Math.min(devicePixelRatio || 1, 2)
    const uBox = [bleed * dpr, bleed * dpr, r.width * dpr, r.height * dpr]
    return { effect, owner, layout: 'host' as const, bleed, color: pageColor(), uBox }
  }

  const effectsOn = () => effectsAllowed() && resolveRenderer(options.renderer).isReady(effect)

  function tick() {
    const left = secondsLeft()
    if (left !== lastTick) { lastTick = left; options.onTick?.(left) }
    // Without the effect, the clock alone ends the time; with it, the last frame does (see burn()).
    if (state === 'running' && elapsed() >= total && !el.hasAttribute('data-animating')) expire()
  }

  async function burn(id: number) {
    const renderer = resolveRenderer(options.renderer)
    el.setAttribute('data-animating', '')
    while (id === runId && state === 'running') {
      const from = elapsed() / total
      if (from >= 1) break
      const span = Math.min(total - elapsed(), MAX_DURATION - 500)
      const { uBox, ...base } = playBase()
      const done = await renderer.play(el, {
        ...base, from, to: Math.min(1, (elapsed() + span) / total), duration: span, easing: 'linear', time0: drift,
        params: (_p, time) => ({ uBox, uDrift: time }),
        onFrame: (p, time) => { drift = time; el.style.setProperty('--p', p.toFixed(4)) }
      })
      if (!done || id !== runId) return
    }
    if (id === runId && state === 'running') expire()
  }

  // While paused, the burned state stays on screen, with the flames still (the clock frozen): the canvas holds it.
  async function hold(id: number) {
    const renderer = resolveRenderer(options.renderer)
    while (id === runId && state === 'paused') {
      const at = elapsed() / total
      const { uBox, ...base } = playBase()
      const done = await renderer.play(el, {
        ...base, from: at, to: at, duration: MAX_DURATION - 500, time0: drift, params: () => ({ uBox, uDrift: drift })
      })
      if (!done) return
    }
  }

  function run() {
    const id = ++runId
    if (effectsOn()) void burn(id)
    else void resolveRenderer(options.renderer).prepare(effect) // may be ready next time
  }

  function setPaused() {
    const shouldPause = manualPause || interacting
    if (state === 'running' && shouldPause) {
      elapsedBefore = elapsed()
      state = 'paused'
      const id = ++runId
      if (el.hasAttribute('data-animating')) void hold(id)
    } else if (state === 'paused' && !shouldPause) {
      startedAt = now()
      state = 'running'
      run()
    }
    el.toggleAttribute('data-paused', state === 'paused')
  }

  function cleanup() {
    el.removeAttribute('data-animating')
    el.removeAttribute('data-paused')
    el.style.removeProperty('--p')
    if (prevPosition !== null) { el.style.position = prevPosition; prevPosition = null }
    clearInterval(interval)
  }

  function expire() {
    if (state === 'ended') return
    state = 'ended'
    runId++
    resolveRenderer(options.renderer).cancel(owner)
    cleanup()
    options.onTick?.(0)
    options.onExpire?.()
  }

  const onEnter = () => { interacting = true; setPaused() }
  const onLeave = () => { interacting = el.matches(':hover') || el.matches(':focus-within'); setPaused() }
  if (options.pauseOnInteraction ?? true) {
    el.addEventListener('pointerenter', onEnter)
    el.addEventListener('pointerleave', onLeave)
    el.addEventListener('focusin', onEnter)
    el.addEventListener('focusout', onLeave)
  }

  return {
    start() {
      if (state !== 'idle') return
      if (getComputedStyle(el).position === 'static') { prevPosition = el.style.position; el.style.position = 'relative' }
      startedAt = now()
      state = 'running'
      interacting = el.matches(':hover') || el.matches(':focus-within')
      interval = setInterval(tick, 200)
      tick()
      run()
      setPaused()
    },
    pause() { manualPause = true; setPaused() },
    resume() { manualPause = false; setPaused() },
    extend(seconds) {
      if (state === 'ended') return
      total += seconds * 1000
      tick()
      if (state === 'running') run() // the current segment was planned for the old total
      else if (state === 'paused' && el.hasAttribute('data-animating')) void hold(++runId)
    },
    cancel() {
      if (state === 'ended') return
      state = 'ended'
      runId++
      resolveRenderer(options.renderer).cancel(owner)
      cleanup()
    },
    secondsLeft,
    destroy() {
      if (state !== 'ended') { state = 'ended'; runId++; resolveRenderer(options.renderer).cancel(owner); cleanup() }
      el.removeEventListener('pointerenter', onEnter)
      el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('focusin', onEnter)
      el.removeEventListener('focusout', onLeave)
    }
  }
}
