import { defineGlslEffect } from '../core/glsl'

/**
 * Halftone noise backdrop for a dialog (layout 'viewport'). A veil of uColor × uAlpha with a screen of ink dots on
 * top, on a grid turned 45° like a print screen; each dot's size comes from fractal noise, and the dots grow in a
 * noise-staggered order as the dialog opens. With `paintsPanel`, the panel's sheet (uSheet, in uPanel) appears from
 * nothing with an organic ink edge, like inkVeilEffect.
 *
 * The last frame is not uniform, so CSS cannot redraw it: use it with `keepBackdrop: true`, which hands that frame
 * over to the ::backdrop as an image.
 *   uPanel: panel rectangle in uv (x, y, w, h), origin bottom left; w = 0 means no panel. uSheet: panel color.
 */
export const HALFTONE_FRAG = `#version 300 es
precision highp float;
uniform float uTime;
uniform float uProgress;
uniform vec2  uResolution;
uniform vec3  uColor;
uniform float uAlpha;
uniform vec4  uPanel;
uniform vec3  uSheet;
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
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}

const vec3 INK = vec3(0.106, 0.094, 0.082);

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / uResolution;
  float p = uProgress;

  // Halftone screen: cells on a 45° grid, sized from the canvas height so it reads the same at any resolution.
  float cell = max(4.0, uResolution.y / 95.0);
  mat2 rot = mat2(0.7071, 0.7071, -0.7071, 0.7071);
  vec2 q = rot * frag / cell;
  vec2 id = floor(q);
  vec2 gv = fract(q) - 0.5;
  vec2 center = transpose(rot) * ((id + 0.5) * cell) / uResolution.y; // cell center, screen space
  float n = fbm(center * 2.6 + vec2(uTime * 0.02, 0.0));
  float tone = clamp((n - 0.28) / 0.5, 0.0, 1.0);
  float grow = smoothstep(tone * 0.45, tone * 0.45 + 0.55, p); // denser tones arrive later
  float r = 0.66 * sqrt(tone) * grow;
  float aa = 1.2 / cell;
  float dotMask = 1.0 - smoothstep(r - aa, r + aa, length(gv));

  float veilA = uAlpha * smoothstep(0.0, 1.0, p);
  float dotA = 0.3 * dotMask * smoothstep(0.0, 0.25, p);
  vec3 rgb = INK * dotA + uColor * veilA * (1.0 - dotA);
  float a = dotA + veilA * (1.0 - dotA);

  // The panel's sheet, appearing from nothing (same organic front as inkVeilEffect).
  if (uPanel.z > 0.0) {
    vec2 lp = (uv - uPanel.xy) / uPanel.zw;
    float inside = step(0.0, lp.x) * step(lp.x, 1.0) * step(0.0, lp.y) * step(lp.y, 1.0);
    float asp = (uPanel.z * uResolution.x) / (uPanel.w * uResolution.y);
    float m = fbm(lp * vec2(asp, 1.0) * 3.0 + vec2(0.0, uTime * 0.05));
    float v = clamp((m - 0.2) / 0.6, 0.0, 1.0) * 0.55 + (1.0 - lp.y) * 0.45;
    float t = mix(-0.12, 1.12, p);
    float cover = (1.0 - smoothstep(t - 0.05, t + 0.05, v)) * inside;
    vec2 px = lp * uPanel.zw * uResolution;
    vec2 border = min(px, uPanel.zw * uResolution - px);
    float soak = (1.0 - smoothstep(0.0, 0.09, abs(v - t))) * inside
      * smoothstep(0.0, 0.15, p) * (1.0 - smoothstep(0.85, 1.0, p)) * smoothstep(0.0, 14.0, min(border.x, border.y));
    vec3 sheet = mix(uSheet, INK, soak * 0.35);
    float sheetA = max(cover, soak * 0.3);
    rgb = sheet * sheetA + rgb * (1.0 - sheetA);
    a = sheetA + a * (1.0 - sheetA);
  }

  outColor = vec4(rgb, a);
}`

export const halftoneEffect = defineGlslEffect('halftone', HALFTONE_FRAG)
