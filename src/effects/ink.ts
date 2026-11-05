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
  // The darkened edge fades out near the canvas borders: the canvas is a rectangle, the ink must not look cut by it.
  vec2 border = min(gl_FragCoord.xy, uResolution - gl_FragCoord.xy);
  soak *= smoothstep(0.0, 28.0, min(border.x, border.y));

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
  vec2 border = min(gl_FragCoord.xy, uResolution - gl_FragCoord.xy);
  soak *= smoothstep(0.0, 28.0, min(border.x, border.y));

  vec3 ink = vec3(0.10, 0.09, 0.08);
  vec3 col = mix(uColor, ink, soak * 0.35);
  float a = max(uAlpha * cover, soak * 0.3);
  outColor = vec4(col * a, a);
}`

/**
 * Ink for images: the same receding cover, but along the front the picture itself bleeds through, displaced like
 * wet ink, before settling. Samples uImage; without an image (cross-origin without CORS) it is the plain ink cover.
 * At uProgress = 1 it is fully transparent, so the real <img> underneath takes over with no visible change.
 */
export const INK_IMAGE_FRAG = `#version 300 es
precision highp float;
uniform float uTime;
uniform float uProgress;
uniform vec2  uResolution;
uniform vec3  uColor;
uniform sampler2D uImage;
uniform vec2  uImageScale;
uniform float uHasImage;
out vec4 outColor;
${NOISE}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float asp = uResolution.x / uResolution.y;
  vec2 q = uv * vec2(asp, 1.0) * 3.0;
  float n = fbm(q + vec2(0.0, uTime * 0.05));
  float v = clamp((n - 0.2) / 0.6, 0.0, 1.0) * 0.55 + (1.0 - uv.y) * 0.45;

  float t = mix(-0.12, 1.12, uProgress);
  float cover = smoothstep(t - 0.03, t + 0.03, v);
  // The wet band just behind the front: the picture shows through it, displaced.
  float wet = (1.0 - smoothstep(0.0, 0.16, t - v)) * (1.0 - cover) * (1.0 - smoothstep(0.88, 1.0, uProgress));
  vec2 disp = (vec2(fbm(q * 2.0 + 7.1), fbm(q * 2.0 - 3.7)) - 0.5) * 0.09 * wet;
  vec2 iuv = (uv + disp - 0.5) * uImageScale + 0.5;
  vec3 picture = texture(uImage, iuv).rgb;
  float inside = step(0.0, iuv.x) * step(iuv.x, 1.0) * step(0.0, iuv.y) * step(iuv.y, 1.0);

  vec3 ink = vec3(0.10, 0.09, 0.08);
  float edge = (1.0 - smoothstep(0.0, 0.035, abs(v - t))) * smoothstep(0.0, 0.15, uProgress);
  vec2 border = min(gl_FragCoord.xy, uResolution - gl_FragCoord.xy);
  edge *= smoothstep(0.0, 28.0, min(border.x, border.y));

  float w = wet * uHasImage * inside;           // where the displaced picture is drawn
  vec3 col = mix(uColor, ink, edge * 0.5);
  col = mix(col, picture * (0.82 + 0.18 * (1.0 - w)), w * (1.0 - cover));
  float a = max(cover, max(w, edge * 0.5));
  outColor = vec4(col * a, a);
}`

export const inkEffect = defineGlslEffect('ink', INK_FRAG)
export const inkImageEffect = defineGlslEffect('ink-image', INK_IMAGE_FRAG)
export const inkVeilEffect = defineGlslEffect('ink-veil', INK_VEIL_FRAG)
