import type { Effect, EffectDef, FxFrame } from './types'

/** Full-screen triangle, no buffers needed. */
export const FULLSCREEN_VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const UNIFORMS = ['uTime', 'uProgress', 'uResolution', 'uPointer', 'uColor', 'uAlpha', 'uImage', 'uImageScale', 'uHasImage'] as const

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('[webgl-ui] could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error('[webgl-ui] shader compile error: ' + log)
  }
  return shader
}

/**
 * Raw GLSL ES 3.00 backend. The fragment shader may declare any of the standard uniforms:
 * uTime, uProgress, uResolution, uPointer, uColor, uAlpha. It must write premultiplied alpha.
 * Image effects may also declare `sampler2D uImage`, `vec2 uImageScale` and `float uHasImage`: the image is
 * uploaded once per source (flipped, so its uv matches gl_FragCoord / uResolution). An image that cannot be
 * uploaded (cross-origin without CORS) leaves uHasImage at 0: the effect must still work as a plain cover.
 * Any other uniform can be fed by name through `params` (float, vec2, vec3, vec4).
 */
export function createGlslEffect(fragmentSource: string): Effect {
  let gl: WebGL2RenderingContext | null = null
  let program: WebGLProgram | null = null
  const loc: Partial<Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>> = {}
  const extra = new Map<string, WebGLUniformLocation | null>() // locations of `params`, looked up once
  let texture: WebGLTexture | null = null
  let uploaded: { source: TexImageSource; key: string } | null = null
  const failed = new WeakSet<object>()

  // Uploads the image once per source; false when it cannot be used (tainted, not decoded, lost context).
  function bindImage(ctx: WebGL2RenderingContext, image: TexImageSource): boolean {
    if (failed.has(image)) return false
    const key = image instanceof HTMLImageElement ? image.currentSrc : ''
    if (!texture) texture = ctx.createTexture()
    ctx.activeTexture(ctx.TEXTURE0)
    ctx.bindTexture(ctx.TEXTURE_2D, texture)
    if (uploaded?.source !== image || uploaded.key !== key) {
      try {
        ctx.pixelStorei(ctx.UNPACK_FLIP_Y_WEBGL, true)
        ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.LINEAR)
        ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.LINEAR)
        ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE)
        ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE)
        ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, ctx.RGBA, ctx.UNSIGNED_BYTE, image)
        uploaded = { source: image, key }
      } catch (err) {
        console.warn('[webgl-ui] image cannot be used as a texture (cross-origin without CORS?): plain cover', err)
        failed.add(image)
        uploaded = null
        return false
      } finally {
        ctx.pixelStorei(ctx.UNPACK_FLIP_Y_WEBGL, false)
      }
    }
    return true
  }

  return {
    init(canvas) {
      const ctx = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false })
      if (!ctx) throw new Error('[webgl-ui] WebGL2 is not available')
      const vs = compile(ctx, ctx.VERTEX_SHADER, FULLSCREEN_VERT)
      const fs = compile(ctx, ctx.FRAGMENT_SHADER, fragmentSource)
      const prog = ctx.createProgram()
      if (!prog) throw new Error('[webgl-ui] could not create program')
      ctx.attachShader(prog, vs)
      ctx.attachShader(prog, fs)
      ctx.linkProgram(prog)
      ctx.deleteShader(vs)
      ctx.deleteShader(fs)
      if (!ctx.getProgramParameter(prog, ctx.LINK_STATUS)) {
        const log = ctx.getProgramInfoLog(prog)
        ctx.deleteProgram(prog)
        throw new Error('[webgl-ui] program link error: ' + log)
      }
      for (const name of UNIFORMS) loc[name] = ctx.getUniformLocation(prog, name)
      ctx.useProgram(prog)
      gl = ctx
      program = prog
      extra.clear()
      texture = null // a new (or restored) context: any previous texture is gone
      uploaded = null
    },
    render(f: FxFrame) {
      if (!gl || !program) return
      gl.useProgram(program) // several effects share one context: select this program every frame
      gl.viewport(0, 0, f.size[0], f.size[1])
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      // A null location (uniform not used by the shader) is silently ignored by WebGL.
      gl.uniform1f(loc.uTime ?? null, f.time)
      gl.uniform1f(loc.uProgress ?? null, f.progress)
      gl.uniform2f(loc.uResolution ?? null, f.size[0], f.size[1])
      gl.uniform2f(loc.uPointer ?? null, f.pointer[0], f.pointer[1])
      gl.uniform3f(loc.uColor ?? null, f.color[0], f.color[1], f.color[2])
      gl.uniform1f(loc.uAlpha ?? null, f.alpha)
      if (loc.uImage) {
        const ok = !!f.image && bindImage(gl, f.image)
        gl.uniform1i(loc.uImage, 0)
        gl.uniform1f(loc.uHasImage ?? null, ok ? 1 : 0)
        gl.uniform2f(loc.uImageScale ?? null, f.imageScale?.[0] ?? 1, f.imageScale?.[1] ?? 1)
      }
      if (f.params) {
        for (const [name, value] of Object.entries(f.params)) {
          if (!extra.has(name)) extra.set(name, gl.getUniformLocation(program, name))
          const l = extra.get(name)!
          if (!l) continue
          if (typeof value === 'number') gl.uniform1f(l, value)
          else if (value.length === 2) gl.uniform2f(l, value[0]!, value[1]!)
          else if (value.length === 3) gl.uniform3f(l, value[0]!, value[1]!, value[2]!)
          else if (value.length === 4) gl.uniform4f(l, value[0]!, value[1]!, value[2]!, value[3]!)
        }
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    dispose() {
      if (gl && program) gl.deleteProgram(program)
      if (gl && texture) gl.deleteTexture(texture)
      program = null
      texture = null
      uploaded = null
    }
  }
}

/** Definition of a raw GLSL effect. Pass it to the element functions or to renderer.play(). */
export function defineGlslEffect(name: string, fragmentSource: string): EffectDef {
  return { name, create: () => createGlslEffect(fragmentSource) }
}
