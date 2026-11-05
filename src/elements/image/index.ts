import { resolveRenderer } from '../../core/renderer'
import { effectsAllowed } from '../../core/preferences'
import { readCoverColor } from '../../core/color'
import { inkImageEffect } from '../../effects/ink'
import type { EffectDef, RendererSource, Vec2 } from '../../core/types'

export interface ImageFxOptions {
  renderer: RendererSource
  /** Effect to use. Default: inkImageEffect (samples the image). Cover effects work too. */
  effect?: EffectDef
  /** Reveal duration in ms. Default 1100. */
  duration?: number
  /** The box the canvas covers. Default: the image's parent, which should wrap the image tightly. */
  stage?: HTMLElement
  /** Reveal when the image finishes loading. Default true. An image already loaded is left alone. */
  revealOnLoad?: boolean
}

export interface ImageFx {
  /** Plays the reveal again. Resolves true when it finished. */
  reveal(): Promise<boolean>
  destroy(): void
}

/** How the image is fitted in its box (object-fit, centered), as a scale around the center of the uv space. */
function imageScale(img: HTMLImageElement, box: DOMRect): Vec2 {
  const nw = img.naturalWidth, nh = img.naturalHeight
  if (!nw || !nh || !box.width || !box.height) return [1, 1]
  const boxAspect = box.width / box.height
  const imgAspect = nw / nh
  const fit = getComputedStyle(img).objectFit
  if (fit === 'cover') return imgAspect > boxAspect ? [boxAspect / imgAspect, 1] : [1, imgAspect / boxAspect]
  if (fit === 'contain' || fit === 'scale-down') return imgAspect > boxAspect ? [1, imgAspect / boxAspect] : [boxAspect / imgAspect, 1]
  return [1, 1] // fill (the default)
}

/**
 * Reveal for an <img> (also inside <picture>). The image is never altered: alt, srcset, lazy loading, layout and
 * semantics stay native. The canvas covers the stage while the reveal runs and can sample the image itself.
 */
export function createImageFx(img: HTMLImageElement, options: ImageFxOptions): ImageFx {
  const effect = options.effect ?? inkImageEffect
  const duration = options.duration ?? 1100
  const stage = options.stage ?? (img.parentElement as HTMLElement | null)
  if (!stage) throw new Error('[webgl-ui] createImageFx needs the image to be in the document, inside a stage element')
  const owner = img
  let prevPosition: string | null = null
  let disposed = false

  void resolveRenderer(options.renderer).prepare(effect)

  const unpend = () => stage!.removeAttribute('data-fx-pending')

  async function reveal(): Promise<boolean> {
    const renderer = resolveRenderer(options.renderer)
    if (disposed || !effectsAllowed() || !renderer.isReady(effect)) { unpend(); return false }
    if (getComputedStyle(stage!).position === 'static') { prevPosition = stage!.style.position; stage!.style.position = 'relative' }
    stage!.setAttribute('data-animating', '')
    try {
      const played = renderer.play(stage!, {
        effect,
        from: 0,
        to: 1,
        duration,
        owner,
        layout: 'host',
        color: readCoverColor(stage!),
        image: img.complete && img.naturalWidth ? img : null,
        imageScale: imageScale(img, img.getBoundingClientRect()),
        onFrame: p => stage!.style.setProperty('--p', p.toFixed(4))
      })
      unpend() // the cover is already drawn (the first frame is synchronous): the image can be shown
      return await played
    } finally {
      stage!.removeAttribute('data-animating')
      stage!.style.removeProperty('--p')
      if (prevPosition !== null) { stage!.style.position = prevPosition; prevPosition = null }
    }
  }

  // The first frame of the reveal is drawn synchronously, so the decoded image never shows uncovered.
  async function onLoad() {
    try { await img.decode() } catch { unpend(); return }
    if (!disposed) void reveal()
  }

  // While a watched image loads, the stage carries [data-fx-pending], so CSS can keep the image invisible
  // (opacity, never display/visibility: it stays in the accessibility tree) until the cover is drawn.
  const watch = (options.revealOnLoad ?? true) && !(img.complete && img.naturalWidth)
  if (watch && effectsAllowed()) stage.setAttribute('data-fx-pending', '')
  if (watch) {
    img.addEventListener('load', onLoad)
    img.addEventListener('error', unpend)
  }

  return {
    reveal,
    destroy() {
      disposed = true
      img.removeEventListener('load', onLoad)
      img.removeEventListener('error', unpend)
      unpend()
      resolveRenderer(options.renderer).cancel(owner)
    }
  }
}
