import { defineGlslEffect } from '../core/glsl'

/**
 * Reveal for a content box: a surface-colored cover dissolves from the top down with fractal noise,
 * leaving a glowing edge on the front. uProgress 0 = fully covered, 1 = fully revealed.
 */
export const DISSOLVE_FRAG = `#version 300 es
precision highp float;
uniform float uTime;
uniform float uProgress;
uniform vec2  uResolution;
uniform vec3  uColor;
out vec4 outColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.0; a *= 0.5; }
  return s;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = uv * vec2(uResolution.x / uResolution.y, 1.0) * 4.0;
  float n = clamp((fbm(p + vec2(0.0, uTime * 0.15)) - 0.15) / 0.65, 0.0, 1.0);
  n = mix(n, 1.0 - uv.y, 0.35);

  float t = mix(-0.1, 1.1, uProgress);
  float cover = smoothstep(t - 0.05, t + 0.05, n);
  float edge  = 1.0 - smoothstep(0.0, 0.08, abs(n - t));

  vec3 accent = vec3(0.55, 0.45, 1.0);
  vec3 col = mix(uColor, accent, edge);
  float a = max(cover, edge * 0.85);
  outColor = vec4(col * a, a);
}`

export const dissolveEffect = defineGlslEffect('dissolve', DISSOLVE_FRAG)
