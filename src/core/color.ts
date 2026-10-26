import type { Vec3 } from './types'

/** Walks up from `el` and returns the first opaque background color as sRGB 0..1. */
export function readSurfaceColor(el: Element): Vec3 {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const m = getComputedStyle(node).backgroundColor.match(/[\d.]+/g)
    if (!m || m.length < 3) continue
    const alpha = m.length >= 4 ? Number(m[3]) : 1
    const [r, g, b] = [Number(m[0]), Number(m[1]), Number(m[2])]
    if (alpha > 0.99 && [r, g, b].every(Number.isFinite)) return [r / 255, g / 255, b / 255]
  }
  return [1, 1, 1]
}

/**
 * Color of the cover an effect draws over an element: the custom property `--fx-cover` ("r, g, b", 0..255)
 * when the page sets it, otherwise the surface color. A dark cover makes the element's own box appear from it.
 */
export function readCoverColor(el: Element): Vec3 {
  const parts = getComputedStyle(el).getPropertyValue('--fx-cover').split(',').map(v => parseFloat(v) / 255)
  return parts.length === 3 && parts.every(Number.isFinite) ? [parts[0]!, parts[1]!, parts[2]!] : readSurfaceColor(el)
}
