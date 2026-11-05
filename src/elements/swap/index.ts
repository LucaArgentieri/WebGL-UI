import { resolveRenderer } from '../../core/renderer'
import { effectsAllowed, MAX_DURATION } from '../../core/preferences'
import { readCoverColor } from '../../core/color'
import { inkEffect } from '../../effects/ink'
import type { EffectDef, RendererSource } from '../../core/types'

export interface SwapFxOptions {
  renderer: RendererSource
  /** A cover effect. Default: inkEffect. */
  effect?: EffectDef
  /** Duration of the reveal in ms; covering takes 60% of it. Default 600. */
  duration?: number
  /**
   * Run the update inside document.startViewTransition() where it exists: the region gets a view-transition-name,
   * so the browser morphs its box to the new size and cross-fades the rest of the page. Default false: the library
   * animates the region's height itself, in every engine.
   */
  viewTransition?: boolean
}

export interface SwapFx {
  /** Covers the region, runs `update` (sync or async), then reveals the new content. Calls are queued. */
  run(update: () => void | Promise<void>): Promise<void>
  destroy(): void
}

const easing = 'cubic-bezier(0.65, 0, 0.35, 1)'

/**
 * Animated content swaps for a region of the page (tabs, pagination, filtered lists…). The DOM change is yours and
 * happens at once, under the cover; the library only paints the cover and the reveal, smooths the height change and
 * puts focus back where it can be found.
 */
export function createSwapFx(region: HTMLElement, options: SwapFxOptions): SwapFx {
  const effect = options.effect ?? inkEffect
  const duration = options.duration ?? 600
  const owner = region
  let queue: Promise<void> = Promise.resolve()
  let destroyed = false
  let swaps = 0

  void resolveRenderer(options.renderer).prepare(effect)

  // Focus inside the region may have been removed with the old content: move it to the region itself, so keyboard
  // and screen reader users continue from the new content instead of from the top of the page.
  function restoreFocus(hadFocus: boolean) {
    if (!hadFocus) return
    const active = document.activeElement
    if (active && active !== document.body && region.contains(active)) return
    if (!region.hasAttribute('tabindex')) region.setAttribute('tabindex', '-1')
    region.focus({ preventScroll: true })
  }

  async function swap(update: () => void | Promise<void>) {
    const renderer = resolveRenderer(options.renderer)
    const hadFocus = region.contains(document.activeElement)
    if (destroyed || !effectsAllowed() || !renderer.isReady(effect)) {
      await update()
      restoreFocus(hadFocus)
      return
    }

    const id = ++swaps
    const color = readCoverColor(region)
    const prevPosition = getComputedStyle(region).position === 'static' ? region.style.position : null
    if (prevPosition !== null) region.style.position = 'relative'
    region.setAttribute('data-animating', '')
    let prevOverflow: string | null = null
    const setP = (p: number) => region.style.setProperty('--p', p.toFixed(4))
    const base = { effect, color, owner, layout: 'host' as const }

    try {
      // 1. cover the old content (an effect at progress 0 is a full cover)
      await renderer.play(region, { ...base, from: 1, to: 0, duration: duration * 0.6, onFrame: setP })

      // 2. hold the cover while the update runs (re-armed if it takes longer than an animation may last)
      let updating = true
      const hold = async () => {
        while (updating && !destroyed) {
          const held = await renderer.play(region, { ...base, from: 0, to: 0, duration: MAX_DURATION })
          if (!held) break // replaced by the reveal (or cancelled)
        }
      }
      void hold()

      const before = region.offsetHeight
      const useVT = options.viewTransition && typeof document.startViewTransition === 'function'
      try {
        if (useVT) {
          region.style.setProperty('view-transition-name', `webgl-ui-swap-${id}`)
          const vt = document.startViewTransition(async () => { await update() })
          await vt.updateCallbackDone
          void vt.finished.finally(() => region.style.removeProperty('view-transition-name'))
        } else {
          await update()
        }
      } catch (err) {
        renderer.cancel(owner) // a failed update must not leave the old content covered
        throw err
      } finally {
        updating = false
      }
      restoreFocus(hadFocus)

      // 3. reveal the new content; without a view transition, the height follows the reveal
      const after = region.offsetHeight
      let resize: Animation | null = null
      if (!useVT && Math.abs(after - before) > 1) {
        prevOverflow = region.style.overflow
        region.style.overflow = 'hidden'
        resize = region.animate([{ height: `${before}px` }, { height: `${after}px` }], { duration, easing })
      }
      await renderer.play(region, { ...base, from: 0, to: 1, duration, onFrame: setP })
      resize?.cancel()
    } finally {
      if (prevOverflow !== null) region.style.overflow = prevOverflow
      region.removeAttribute('data-animating')
      region.style.removeProperty('--p')
      if (prevPosition !== null) region.style.position = prevPosition
    }
  }

  return {
    run(update) {
      queue = queue.then(() => swap(update)).catch(err => { console.warn('[webgl-ui] swap failed', err) })
      return queue
    },
    destroy() {
      destroyed = true
      resolveRenderer(options.renderer).cancel(owner)
    }
  }
}
