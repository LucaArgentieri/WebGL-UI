import { defineGlslEffect } from '../core/glsl'

/**
 * Ink for progress bars and meters. Draws only the fill, in uColor, from the start of the bar to the current value;
 * the stage background shows through as the track. While the value moves, the front is wet: it wobbles and bleeds a
 * little ahead. The wetness dries out by the end, so the last frame is a crisp, flat fill: the same picture as the
 * native bar styled by progress.css.
 *   uValue: (from, to) as fractions of the bar; uRtl: 1 when the bar fills right to left.
 */
export const INK_BAR_FRAG = `#version 300 es
precision highp float;
uniform float uTime;
uniform float uProgress;
uniform vec2  uResolution;
uniform vec3  uColor;
uniform vec2  uValue;
uniform float uRtl;
out vec4 outColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float x = mix(uv.x, 1.0 - uv.x, step(0.5, uRtl));
  float px = 1.0 / uResolution.x;
  float cur = mix(uValue.x, uValue.y, uProgress);

  float wet = 1.0 - smoothstep(0.7, 1.0, uProgress);
  float n = vnoise(vec2(uv.y * 6.0, uTime * 3.0)) - 0.5;
  float front = cur + n * 14.0 * px * wet;
  float fill = 1.0 - smoothstep(front - 0.75 * px, front + 0.75 * px, x);
  float ahead = max(x - front, 0.0);
  float bleed = (1.0 - smoothstep(0.0, 22.0 * px, ahead)) * step(front, x) * wet * 0.35;

  float a = max(fill, bleed);
  outColor = vec4(uColor * a, a);
}`

export const inkBarEffect = defineGlslEffect('ink-bar', INK_BAR_FRAG)
