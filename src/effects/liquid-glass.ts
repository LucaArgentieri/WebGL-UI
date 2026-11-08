import { defineGlslEffect } from '../core/glsl'
import { defineWgslEffect } from '../core/wgsl'

/**
 * Liquid glass backdrop for a dialog (layout 'viewport', with keepBackdrop): a pane of glass over the page, whose
 * surface is a slow liquid height field. It draws light only, plus a faint tint: specular highlights from the
 * surface normal, split into red, green and blue (dispersion), and a bright rim along the pane's edges. The
 * frosting of the page behind is CSS (backdrop-filter): neither WebGPU nor WebGL can read the page. The surface is a
 * few broad waves with an exact slope: smooth, wide highlights, never the cell pattern of value noise.
 *
 * WGSL on WebGPU, with this same effect in GLSL as the fallback. The surface moves with the drift (uDrift /
 * fx.drift), which the dialog eases to a stop before handing the still frame to the ::backdrop.
 */
export const LIQUID_GLASS_WGSL = /* wgsl */ `
// A liquid surface: a few broad waves moving slowly. Its slope (exact, no finite differences) tilts the normal.
fn slope(q: vec2f, t: f32) -> vec2f {
  let a = q.x * 1.1 + t * 0.30;
  let b = q.y * 0.9 - t * 0.22;
  let c = (q.x + q.y) * 1.7 + t * 0.25;
  let k = (q.x - q.y) * 2.3 - t * 0.18;
  return vec2f(
    1.1 * cos(a) * sin(b) * 0.50 + 1.7 * cos(c) * 0.22 + 2.3 * cos(k) * 0.10,
    0.9 * sin(a) * cos(b) * 0.50 + 1.7 * cos(c) * 0.22 - 2.3 * cos(k) * 0.10);
}
fn spec(n: vec3f) -> f32 {
  let h = normalize(normalize(vec3f(-0.45, 0.6, 0.65)) + vec3f(0.0, 0.0, 1.0));
  return pow(max(dot(n, h), 0.0), 26.0);
}
fn effect(uv: vec2f, frag: vec2f) -> vec4f {
  let asp = fx.resolution.x / fx.resolution.y;
  let q = uv * vec2f(asp, 1.0) * 1.4;
  let g = slope(q, fx.drift);
  let n = normalize(vec3f(-g * 0.75, 1.0));
  let d = vec3f(n.xy * 0.22, 0.0);
  let sheen = smoothstep(0.05, 0.25, 1.0 - n.z) * 0.12;
  let highlights = vec3f(spec(normalize(n + d)), spec(n), spec(normalize(n - d))) * 0.5 + vec3f(sheen);
  let edge = min(min(uv.x, 1.0 - uv.x) * asp, min(uv.y, 1.0 - uv.y));
  let rim = vec3f(1.0 - smoothstep(0.0, 0.028, edge), 1.0 - smoothstep(0.0, 0.031, edge), 1.0 - smoothstep(0.0, 0.034, edge)) * 0.38;
  // Shading: facing the light → lighter, facing away → darker; each channel with its own normal (dispersion), so
  // the light/dark transitions carry the faint colour split. On a light page, the dark side is what reads as glass.
  let L = normalize(vec3f(-0.45, 0.6, 0.65));
  let shade = vec3f(dot(normalize(n + d), L), dot(n, L), dot(normalize(n - d), L)) - L.z;
  let grow = smoothstep(0.0, 1.0, fx.progress);
  let veil = fx.alpha * grow;
  let shadow = clamp(-shade.g * 0.9, 0.0, 0.35) * grow;
  let light = (highlights + rim + max(shade, vec3f(0.0)) * 0.9) * grow;
  var rgb = fx.color.xyz * veil;
  var a = veil;
  rgb = rgb * (1.0 - shadow) + vec3f(0.10, 0.11, 0.13) * shadow;
  a = a + shadow * (1.0 - a);
  rgb = rgb + light;
  a = clamp(max(a, max(light.r, max(light.g, light.b))), 0.0, 1.0);
  return vec4f(min(rgb, vec3f(a)), a);
}
`

export const LIQUID_GLASS_FRAG = `#version 300 es
precision highp float;
uniform float uProgress;
uniform float uTime;
uniform float uDrift;
uniform vec2  uResolution;
uniform vec3  uColor;
uniform float uAlpha;
out vec4 outColor;

vec2 slope(vec2 q, float t) {
  float a = q.x * 1.1 + t * 0.30;
  float b = q.y * 0.9 - t * 0.22;
  float c = (q.x + q.y) * 1.7 + t * 0.25;
  float k = (q.x - q.y) * 2.3 - t * 0.18;
  return vec2(
    1.1 * cos(a) * sin(b) * 0.50 + 1.7 * cos(c) * 0.22 + 2.3 * cos(k) * 0.10,
    0.9 * sin(a) * cos(b) * 0.50 + 1.7 * cos(c) * 0.22 - 2.3 * cos(k) * 0.10);
}
float spec(vec3 n) {
  vec3 h = normalize(normalize(vec3(-0.45, 0.6, 0.65)) + vec3(0.0, 0.0, 1.0));
  return pow(max(dot(n, h), 0.0), 26.0);
}
void main() {
  // top-left origin, like the WGSL version, so both draw the same picture
  vec2 uv = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y) / uResolution;
  float asp = uResolution.x / uResolution.y;
  vec2 q = uv * vec2(asp, 1.0) * 1.4;
  vec2 g = slope(q, uDrift);
  vec3 n = normalize(vec3(-g * 0.75, 1.0));
  vec3 d = vec3(n.xy * 0.22, 0.0);
  float sheen = smoothstep(0.05, 0.25, 1.0 - n.z) * 0.12;
  vec3 highlights = vec3(spec(normalize(n + d)), spec(n), spec(normalize(n - d))) * 0.5 + vec3(sheen);
  float edge = min(min(uv.x, 1.0 - uv.x) * asp, min(uv.y, 1.0 - uv.y));
  vec3 rim = vec3(1.0 - smoothstep(0.0, 0.028, edge), 1.0 - smoothstep(0.0, 0.031, edge), 1.0 - smoothstep(0.0, 0.034, edge)) * 0.38;
  vec3 L = normalize(vec3(-0.45, 0.6, 0.65));
  vec3 shade = vec3(dot(normalize(n + d), L), dot(n, L), dot(normalize(n - d), L)) - L.z;
  float grow = smoothstep(0.0, 1.0, uProgress);
  float veil = uAlpha * grow;
  float shadow = clamp(-shade.g * 0.9, 0.0, 0.35) * grow;
  vec3 light = (highlights + rim + max(shade, vec3(0.0)) * 0.9) * grow;
  vec3 rgb = uColor * veil;
  float a = veil;
  rgb = rgb * (1.0 - shadow) + vec3(0.10, 0.11, 0.13) * shadow;
  a = a + shadow * (1.0 - a);
  rgb += light;
  a = clamp(max(a, max(light.r, max(light.g, light.b))), 0.0, 1.0);
  outColor = vec4(min(rgb, vec3(a)), a);
}`

export const liquidGlassGlEffect = defineGlslEffect('liquid-glass-gl', LIQUID_GLASS_FRAG)
export const liquidGlassEffect = defineWgslEffect('liquid-glass', LIQUID_GLASS_WGSL, { fallback: liquidGlassGlEffect })
