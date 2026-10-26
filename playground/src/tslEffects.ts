import { defineTslEffect } from 'webgl-ui-tsl'

/**
 * Radial reveal written in TSL. Same contract as the GLSL effects: uProgress 0 = covered, 1 = revealed,
 * output premultiplied.
 */
export const radialEffect = defineTslEffect('radial-tsl', ({ progress, time, resolution, color, alpha, uv }, { vec2, vec3, vec4, float, length, smoothstep, sin, mix, abs, max }) => {
  const aspect = resolution.x.div(resolution.y)
  const p = uv.sub(vec2(0.5, 0.5)).mul(vec2(aspect, 1))
  const wobble = sin(p.x.mul(14).add(time.mul(2))).mul(0.02)
  const d = length(p).add(wobble)
  const radius = mix(float(-0.05), float(0.95), progress)
  const cover = smoothstep(radius.sub(0.04), radius.add(0.04), d)
  const edge = float(1).sub(smoothstep(0, 0.06, abs(d.sub(radius))))
  const col = (mix as any)(color, vec3(0.9, 0.5, 0.9), edge) // vector mix: three's overload typings reject it
  const a = max(cover.mul(alpha), edge.mul(0.9))
  return vec4(col.mul(a), a)
})

/** Test probe: paints uv.x into red and uv.y into green, fully opaque. */
export const uvProbeEffect = defineTslEffect('uv-probe', ({ uv }, { vec4, float }) => vec4(uv.x, uv.y, float(0), float(1)))

/** Test probe: premultiplied red at 50% (0.5, 0, 0, 0.5). Over white it must read as (255, 128, 128). */
export const halfRedEffect = defineTslEffect('half-red', (_i, { vec4, float }) => vec4(float(0.5), float(0), float(0), float(0.5)))
