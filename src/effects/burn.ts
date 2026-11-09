import { defineGlslEffect } from '../core/glsl'

/**
 * A burn that consumes an element from its right edge to its left one: a ragged front with a charred rim, a band
 * of flickering fire that rises above the element, smoke and a few embers. The burned part is painted with uColor,
 * the page's colour behind the element (WebGL cannot read the page, so this works on flat backgrounds).
 * uProgress 0 = intact, 1 = burned away (the element's box is uniform uColor, fire and smoke gone): hide or replace
 * the element at that moment. Use with layout 'host' and a bleed, so flames and smoke can leave the element's box.
 *   uBox: the element's box in canvas pixels (x, y, w, h), origin bottom left. uDrift: the flames' clock.
 */
export const BURN_FRAG = `#version 300 es
precision highp float;
uniform float uProgress;
uniform float uDrift;
uniform vec2  uResolution;
uniform vec3  uColor;
uniform vec4  uBox;
out vec4 outColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 l = (frag - uBox.xy) / uBox.zw;              // 0..1 inside the element
  float aspect = uBox.z / uBox.w;
  float t = uDrift;
  float p = uProgress;
  float inBox = step(0.0, l.x) * step(l.x, 1.0) * step(0.0, l.y) * step(l.y, 1.0);

  // The front travels right to left, ragged; far enough at both ends that 0 is intact and 1 is fully burned.
  float reach = 0.5 / aspect + 0.04;
  float front = mix(1.0 + reach, -reach, p);
  float jag = (fbm(vec2(l.y * 2.2, t * 0.35) + vec2(0.0, l.y * 1.5)) - 0.5) * 0.9 / aspect;
  float d = (l.x - front - jag) * aspect;           // signed distance in element heights; > 0 is burned
  float alive = smoothstep(0.0, 0.02, p) * (1.0 - smoothstep(0.9, 1.0, p));

  float burned = smoothstep(-0.015, 0.015, d) * inBox;
  float charA = (1.0 - smoothstep(0.0, 0.3, -d)) * step(d, 0.0) * inBox * alive;

  // Fire: a band along the front, flickering, rising above the element.
  float above = max(0.0, (frag.y - (uBox.y + uBox.w)) / uBox.w);
  float below = max(0.0, (uBox.y - frag.y) / uBox.w);
  float flick = fbm(vec2(l.y * 3.0 - t * 2.4, l.x * aspect * 2.0 + t * 0.7));
  float band = exp(-pow((d + 0.02) / (0.10 + 0.08 * flick), 2.0));
  float flame = band * (1.0 - smoothstep(0.0, 0.5 + 0.7 * flick, above)) * (1.0 - smoothstep(0.0, 0.12, below)) * alive;
  vec3 fireCol = mix(vec3(0.95, 0.33, 0.05), vec3(1.0, 0.86, 0.48), smoothstep(0.35, 0.95, band * flick * 1.5));

  // Smoke and embers above the front.
  float frontX = uBox.x + (front + jag) * uBox.z;
  float sx = (frag.x - frontX) / uBox.w;
  float smoke = fbm(vec2(sx * 1.3, above * 1.3 - t * 0.6));
  float smokeA = smoothstep(0.35, 0.8, smoke) * exp(-sx * sx * 1.2) * smoothstep(0.05, 0.7, above)
    * (1.0 - smoothstep(1.2, 2.4, above)) * 0.3 * alive;
  vec2 eg = vec2(frag.x, frag.y - t * uBox.w * 0.9) / (uBox.w * 0.16);
  float ember = step(0.93, hash(floor(eg))) * (1.0 - smoothstep(0.05, 0.14, length(fract(eg) - 0.5)))
    * exp(-sx * sx * 4.0) * (1.0 - smoothstep(0.4, 1.8, above)) * step(-0.2, frag.y - uBox.y - uBox.w * 0.5) * alive;

  // Flames, smoke and embers fade before the canvas edges: the canvas is a rectangle, they must not look cut.
  vec2 border = min(frag, uResolution - frag);
  float edgeFade = smoothstep(0.0, 22.0, min(border.x, border.y));
  flame *= edgeFade;
  smokeA *= edgeFade;
  ember *= edgeFade;

  vec3 rgb = uColor * burned;
  float a = burned;
  float ca = charA * 0.9 * (1.0 - burned);
  rgb = rgb * (1.0 - ca) + vec3(0.07, 0.05, 0.04) * ca;
  a = a + ca * (1.0 - a);
  rgb = rgb * (1.0 - smokeA) + vec3(0.42, 0.41, 0.40) * smokeA;
  a = a + smokeA * (1.0 - a);
  vec3 light = fireCol * flame * 1.25 + vec3(1.0, 0.72, 0.32) * ember;
  rgb += light;
  a = clamp(max(a, max(light.r, max(light.g, light.b))), 0.0, 1.0);
  outColor = vec4(min(rgb, vec3(a)), a);
}`

export const burnEffect = defineGlslEffect('burn', BURN_FRAG)
