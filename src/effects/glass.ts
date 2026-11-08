import { defineGlslEffect } from '../core/glsl'

/**
 * Glass forming, for a dialog with layout 'host' (or any rounded box). It draws only light: a fresnel rim along
 * the rounded rectangle, split into red, green and blue a few pixels apart (a light chromatic aberration), and a
 * specular band that sweeps across once. Both rise and fade with the progress, so the effect is transparent at
 * 0 and at 1: the frosted glass itself is CSS (backdrop-filter), which WebGL cannot draw because it cannot read
 * the page behind.
 *   uRadius: corner radius in canvas pixels (the dialog passes the panel's border-radius).
 */
export const GLASS_FRAG = `#version 300 es
precision highp float;
uniform float uTime;
uniform float uProgress;
uniform vec2  uResolution;
uniform float uRadius;
out vec4 outColor;

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// Fresnel-like rim: bright on the edge, fading inwards.
float rim(vec2 p, vec2 half_, float r, float w) {
  float d = sdRoundBox(p, half_, r);
  return exp(-max(-d, 0.0) / w) * (1.0 - smoothstep(-0.5, 0.5, d));
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 half_ = uResolution * 0.5;
  vec2 p = frag - half_;
  float r = min(uRadius, min(half_.x, half_.y));
  float s = min(uResolution.x, uResolution.y);
  float w = max(1.5, s * 0.018);

  float env = sin(3.14159265 * clamp(uProgress, 0.0, 1.0)); // 0 at both ends
  // Chromatic split: each channel sees the box shifted outwards along its own direction.
  vec2 dir = normalize(p + 1e-4) * max(1.0, s * 0.0025) * (0.5 + env); // a pixel or two: a light aberration
  vec3 rims = vec3(rim(p - dir, half_, r, w), rim(p, half_, r, w), rim(p + dir, half_, r, w));

  // A specular band sweeping diagonally once, inside the box.
  float inside = 1.0 - smoothstep(-0.5, 0.5, sdRoundBox(p, half_, r));
  vec2 uv = frag / uResolution;
  float diag = dot(uv - 0.5, normalize(vec2(1.0, 0.55)));
  float pos = mix(-0.75, 0.75, uProgress);
  float sweep = exp(-pow((diag - pos) / 0.07, 2.0)) * 0.22 * inside;

  // The colour split stays faint: mostly white light, a little of each channel's own rim.
  vec3 light = (mix(vec3(rims.g), rims, 0.6) * 0.32 + sweep) * env;
  float a = clamp(max(light.r, max(light.g, light.b)), 0.0, 1.0);
  outColor = vec4(min(light, vec3(a)), a); // premultiplied: white light with coloured fringes
}`

export const glassEffect = defineGlslEffect('glass', GLASS_FRAG)
