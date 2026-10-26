import { defineGlslEffect } from '../core/glsl'

const NOISE = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}`

/**
 * Ink on paper. A cover (uColor: paper, or ink for a surface that should appear from a block of ink) recedes from
 * the top with an organic, fibrous edge that darkens a little, like ink soaking into paper. No chromatic effects.
 * uProgress 0 = fully covered, 1 = fully revealed.
 */
export const INK_FRAG = `#version 300 es
precision highp float;
uniform float uTime;
uniform float uProgress;
uniform vec2  uResolution;
uniform vec3  uColor;
out vec4 outColor;
${NOISE}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float asp = uResolution.x / uResolution.y;
  float n = fbm(uv * vec2(asp, 1.0) * 4.0 + vec2(0.0, uTime * 0.05));
  float v = clamp((n - 0.2) / 0.6, 0.0, 1.0) * 0.55 + (1.0 - uv.y) * 0.45;

  float t = mix(-0.12, 1.12, uProgress);
  float cover = smoothstep(t - 0.035, t + 0.035, v);
  float soak = (1.0 - smoothstep(0.0, 0.09, abs(v - t))) * smoothstep(0.0, 0.15, uProgress) * (1.0 - smoothstep(0.85, 1.0, uProgress));

  vec3 ink = vec3(0.10, 0.09, 0.08);
  vec3 col = mix(uColor, ink, soak * 0.45);
  float grain = (hash(gl_FragCoord.xy) - 0.5) * 0.025; // paper tooth
  float a = max(cover, soak * 0.55);
  outColor = vec4((col + grain) * a, a);
}`

/**
 * Ink veil for a dialog backdrop: it spreads from the top with the same organic edge.
 * At uProgress = 1 the image is uniform: color uColor with alpha uAlpha, identical to the CSS ::backdrop.
 */
export const INK_VEIL_FRAG = `#version 300 es
precision highp float;
uniform float uTime;
uniform float uProgress;
uniform vec2  uResolution;
uniform vec3  uColor;
uniform float uAlpha;
out vec4 outColor;
${NOISE}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float asp = uResolution.x / uResolution.y;
  float n = fbm(uv * vec2(asp, 1.0) * 3.0 + vec2(0.0, uTime * 0.05));
  float v = clamp((n - 0.2) / 0.6, 0.0, 1.0) * 0.55 + (1.0 - uv.y) * 0.45;

  float t = mix(-0.12, 1.12, uProgress);
  float cover = 1.0 - smoothstep(t - 0.05, t + 0.05, v);
  float soak = (1.0 - smoothstep(0.0, 0.09, abs(v - t))) * smoothstep(0.0, 0.15, uProgress) * (1.0 - smoothstep(0.85, 1.0, uProgress));

  vec3 ink = vec3(0.10, 0.09, 0.08);
  vec3 col = mix(uColor, ink, soak * 0.35);
  float a = max(uAlpha * cover, soak * 0.3);
  outColor = vec4(col * a, a);
}`

export const inkEffect = defineGlslEffect('ink', INK_FRAG)
export const inkVeilEffect = defineGlslEffect('ink-veil', INK_VEIL_FRAG)
