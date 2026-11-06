import { defineWgslEffect } from '../core/wgsl'
import { inkEffect, inkVeilEffect } from './ink'

const NOISE = /* wgsl */ `
fn hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2f(1.0, 0.0)), f.x), mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), f.x), f.y);
}
fn fbm(p0: vec2f) -> f32 {
  var p = p0; var s = 0.0; var a = 0.5;
  for (var i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}
`

/** inkEffect in WGSL (WebGPU), with the GLSL inkEffect as fallback. Same look, same contract. */
export const INK_WGSL = NOISE + /* wgsl */ `
fn effect(uv: vec2f, frag: vec2f) -> vec4f {
  let asp = fx.resolution.x / fx.resolution.y;
  let n = fbm(uv * vec2f(asp, 1.0) * 4.0 + vec2f(0.0, fx.time * 0.05));
  let v = clamp((n - 0.2) / 0.6, 0.0, 1.0) * 0.55 + uv.y * 0.45;
  let t = mix(-0.12, 1.12, fx.progress);
  let cover = smoothstep(t - 0.035, t + 0.035, v);
  var soak = (1.0 - smoothstep(0.0, 0.09, abs(v - t))) * smoothstep(0.0, 0.15, fx.progress) * (1.0 - smoothstep(0.85, 1.0, fx.progress));
  let border = min(frag, fx.resolution - frag);
  soak *= smoothstep(0.0, 28.0, min(border.x, border.y));
  let ink = vec3f(0.10, 0.09, 0.08);
  let col = mix(fx.color.xyz, ink, soak * 0.45);
  let grain = (hash(floor(frag)) - 0.5) * 0.025;
  let a = max(cover, soak * 0.55);
  return vec4f((col + grain) * a, a);
}
`

/** inkVeilEffect in WGSL (WebGPU), with the GLSL inkVeilEffect as fallback. Ends on uniform color × alpha. */
export const INK_VEIL_WGSL = NOISE + /* wgsl */ `
fn effect(uv: vec2f, frag: vec2f) -> vec4f {
  let asp = fx.resolution.x / fx.resolution.y;
  let n = fbm(uv * vec2f(asp, 1.0) * 3.0 + vec2f(0.0, fx.time * 0.05));
  let v = clamp((n - 0.2) / 0.6, 0.0, 1.0) * 0.55 + uv.y * 0.45;
  let t = mix(-0.12, 1.12, fx.progress);
  let cover = 1.0 - smoothstep(t - 0.05, t + 0.05, v);
  var soak = (1.0 - smoothstep(0.0, 0.09, abs(v - t))) * smoothstep(0.0, 0.15, fx.progress) * (1.0 - smoothstep(0.85, 1.0, fx.progress));
  let border = min(frag, fx.resolution - frag);
  soak *= smoothstep(0.0, 28.0, min(border.x, border.y));
  let ink = vec3f(0.10, 0.09, 0.08);
  let col = mix(fx.color.xyz, ink, soak * 0.35);
  let a = max(fx.alpha * cover, soak * 0.3);
  return vec4f(col * a, a);
}
`

export const inkGpuEffect = defineWgslEffect('ink-wgsl', INK_WGSL, { fallback: inkEffect })
export const inkVeilGpuEffect = defineWgslEffect('ink-veil-wgsl', INK_VEIL_WGSL, { fallback: inkVeilEffect })
