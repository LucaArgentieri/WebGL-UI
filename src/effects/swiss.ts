import { defineGlslEffect } from '../core/glsl'

/**
 * Swiss-grid reveal. The surface is split into 12 columns; each column recedes with its own delay, top to bottom,
 * through a soft edge (the opacity ramp). The red, green and blue channels recede a hair apart, so the edge
 * carries a light chromatic shift. uProgress 0 = fully covered, 1 = fully revealed.
 */
export const SWISS_FRAG = `#version 300 es
precision highp float;
uniform float uTime;
uniform float uProgress;
uniform vec2  uResolution;
uniform vec3  uColor;
out vec4 outColor;

float hash(float n) { return fract(sin(n * 91.345) * 43758.5453); }

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float col = floor(uv.x * 12.0);
  float v = (1.0 - uv.y) * 0.62 + hash(col) * 0.38;

  float t = mix(-0.14, 1.14, uProgress);
  float w = 0.11;
  vec3 shift = vec3(0.014, 0.0, -0.014);
  vec3 cover = vec3(
    smoothstep(t - w + shift.r, t + w + shift.r, v),
    smoothstep(t - w + shift.g, t + w + shift.g, v),
    smoothstep(t - w + shift.b, t + w + shift.b, v));

  float a = max(cover.r, max(cover.g, cover.b));
  vec3 ch = mix(vec3(a), cover, 0.4); // keep the chromatic shift light
  // Over a light cover the shift shows as missing channels; over a dark one it has to be added as light.
  float lum = dot(uColor, vec3(0.299, 0.587, 0.114));
  vec3 tint = (vec3(a) - cover) * 0.6 * (1.0 - lum);
  outColor = vec4(uColor * ch + tint, a);
}`

/**
 * Swiss-grid veil for a dialog backdrop: the same columns and RGB shift, building up instead of receding.
 * At uProgress = 1 the image is uniform: color uColor with alpha uAlpha, identical to the CSS ::backdrop.
 */
export const SWISS_VEIL_FRAG = `#version 300 es
precision highp float;
uniform float uTime;
uniform float uProgress;
uniform vec2  uResolution;
uniform vec3  uColor;
uniform float uAlpha;
out vec4 outColor;

float hash(float n) { return fract(sin(n * 91.345) * 43758.5453); }

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float col = floor(uv.x * 12.0);
  float v = (1.0 - uv.y) * 0.62 + hash(col) * 0.38;

  float t = mix(-0.14, 1.14, uProgress);
  float w = 0.11;
  vec3 shift = vec3(0.014, 0.0, -0.014);
  vec3 veil = vec3(
    1.0 - smoothstep(t - w + shift.r, t + w + shift.r, v),
    1.0 - smoothstep(t - w + shift.g, t + w + shift.g, v),
    1.0 - smoothstep(t - w + shift.b, t + w + shift.b, v));

  float m = max(veil.r, max(veil.g, veil.b));
  vec3 ch = mix(vec3(m), veil, 0.4);
  float lum = dot(uColor, vec3(0.299, 0.587, 0.114));
  vec3 tint = (vec3(m) - veil) * 0.6 * (1.0 - lum);
  float a = uAlpha * m;
  outColor = vec4((uColor * ch + tint) * uAlpha, a);
}`

export const swissEffect = defineGlslEffect('swiss', SWISS_FRAG)
export const swissVeilEffect = defineGlslEffect('swiss-veil', SWISS_VEIL_FRAG)
