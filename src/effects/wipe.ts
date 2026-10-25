import { defineGlslEffect } from '../core/glsl'

/**
 * Left-to-right wipe with a noisy, glowing edge. uProgress 0 = fully covered, 1 = fully revealed.
 * A second effect, here to prove that different effects can share one renderer and one WebGL context.
 */
export const WIPE_FRAG = `#version 300 es
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

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float n = vnoise(uv * vec2(uResolution.x / uResolution.y, 1.0) * 6.0 + vec2(uTime * 0.2, 0.0));
  float v = uv.x * 0.8 + n * 0.2;

  float t = mix(-0.1, 1.1, uProgress);
  float cover = smoothstep(t - 0.04, t + 0.04, v);
  float edge  = 1.0 - smoothstep(0.0, 0.06, abs(v - t));

  vec3 col = mix(uColor, vec3(0.3, 0.8, 0.7), edge);
  float a = max(cover, edge * 0.9);
  outColor = vec4(col * a, a);
}`

export const wipeEffect = defineGlslEffect('wipe', WIPE_FRAG)
