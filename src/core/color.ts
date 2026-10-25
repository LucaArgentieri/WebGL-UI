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
