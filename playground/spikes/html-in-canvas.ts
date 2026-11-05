/**
 * Spike for issue #8: HTML-in-Canvas (WICG). Not library code: it answers what an API would need.
 *
 * Feature detection covers both shapes seen so far:
 * - Chromium 147–156 behind the CanvasDrawElement flag: <canvas layoutsubtree>, gl.texElementImage2D(target, internalformat, element)
 * - Chrome 157+: <canvas content="drawable"> + [drawable] children, gl.texElementSubImage2D(...)
 */
export {}

type DrawableCanvas = HTMLCanvasElement & { requestPaint(): void }

const sheet = document.getElementById('sheet') as HTMLElement
const status = document.getElementById('status')!
let count = 0
document.getElementById('inner-button')!.addEventListener('click', () => {
  document.getElementById('count')!.textContent = String(++count)
})

type GL = WebGL2RenderingContext & {
  texElementImage2D?: (target: number, internalformat: number, element: Element) => void
}

const supported = 'requestPaint' in HTMLCanvasElement.prototype &&
  ('texElementImage2D' in WebGL2RenderingContext.prototype || 'texElementSubImage2D' in WebGL2RenderingContext.prototype)

const FRAG = `#version 300 es
precision highp float;
uniform float uProgress;
uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uPaper;
uniform sampler2D uElement;
in vec2 vUv;
out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
void main() {
  vec2 uv = vUv;                      // 0,0 top left
  float asp = uResolution.x / uResolution.y;
  vec2 q = uv * vec2(asp, 1.0) * 3.0;
  float n = fbm(q + vec2(0.0, uTime * 0.05));
  float v = clamp((n - 0.2) / 0.6, 0.0, 1.0) * 0.55 + uv.y * 0.45;
  float t = mix(-0.12, 1.12, uProgress);
  float cover = smoothstep(t - 0.03, t + 0.03, v);
  float wet = (1.0 - smoothstep(0.0, 0.2, t - v)) * (1.0 - cover) * (1.0 - smoothstep(0.9, 1.0, uProgress));
  vec2 disp = (vec2(fbm(q * 2.0 + 7.1), fbm(q * 2.0 - 3.7)) - 0.5) * 0.08 * wet;
  vec4 el = texture(uElement, uv + disp);
  // the letters bleed: darken and spread the ink where it is wet
  vec3 ink = mix(el.rgb, el.rgb * 0.75, wet);
  vec3 col = mix(ink, uPaper, cover);
  outColor = vec4(col, 1.0);
}`
const VERT = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = vec2(p.x, 1.0 - p.y);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

function setup() {
  // Wrap the article in a drawable canvas at runtime: without support it must stay plain DOM, because canvas
  // children are fallback content and are never painted by a browser that has <canvas> but not this API.
  const canvas = document.createElement('canvas') as DrawableCanvas
  canvas.setAttribute('layoutsubtree', '')
  canvas.setAttribute('content', 'drawable')
  canvas.className = 'spike-canvas'
  sheet.setAttribute('drawable', '')
  sheet.replaceWith(canvas)
  canvas.append(sheet)

  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true }) as GL | null
  if (!gl) { canvas.replaceWith(sheet); return null }
  const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s }
  const prog = gl.createProgram()!
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog)
  gl.useProgram(prog)
  const loc = (n: string) => gl.getUniformLocation(prog, n)
  const tex = gl.createTexture()

  let progress = 1
  let t0 = 0
  const paper = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g)!.slice(0, 3).map(v => Number(v) / 255)

  // The canvas is as tall as its content; its backing store follows its CSS size.
  const fit = () => {
    canvas.style.height = sheet.offsetHeight + 'px'
    const dpr = Math.min(devicePixelRatio || 1, 2)
    canvas.width = Math.round(canvas.clientWidth * dpr)
    canvas.height = Math.round(canvas.clientHeight * dpr)
  }

  const draw = () => {
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    if (gl.texElementImage2D) gl.texElementImage2D(gl.TEXTURE_2D, gl.RGBA8, sheet)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.uniform1f(loc('uProgress'), progress)
    gl.uniform1f(loc('uTime'), (performance.now() - t0) / 1000)
    gl.uniform2f(loc('uResolution'), canvas.width, canvas.height)
    gl.uniform3f(loc('uPaper'), paper[0]!, paper[1]!, paper[2]!)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  // The browser asks for a repaint whenever the children change (hover, focus ring, selection, text): the canvas
  // is their only display, so it must always draw them, not only while animating.
  canvas.addEventListener('paint', draw)
  new ResizeObserver(() => { fit(); canvas.requestPaint() }).observe(sheet)
  canvas.addEventListener('webglcontextlost', e => e.preventDefault())
  canvas.addEventListener('webglcontextrestored', () => location.reload()) // spike: the program would be rebuilt
  fit()
  canvas.requestPaint()

  return {
    play() {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
      t0 = performance.now()
      const step = (now: number) => {
        const k = Math.min((now - t0) / 1400, 1)
        progress = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
        draw()
        if (k < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    },
    canvas,
    setProgress(p: number) { progress = p; draw() }
  }
}

const spike = supported ? setup() : null
status.textContent = spike
  ? 'HTML-in-Canvas is available: the article is drawn by WebGL from its own pixels.'
  : 'HTML-in-Canvas is not available in this browser: the article is plain DOM (Chrome 157+, or Chromium with the CanvasDrawElement flag).'
document.getElementById('play')!.addEventListener('click', () => spike?.play())
Object.assign(window, { __spike: { supported: !!spike, setProgress: (p: number) => spike?.setProgress(p) } })
