import type { Effect, EffectDef, FxFrame } from './types'

/** Full-screen triangle, no buffers needed. */
export const FULLSCREEN_VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const UNIFORMS = ['uTime', 'uProgress', 'uResolution', 'uPointer', 'uColor', 'uAlpha'] as const

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
 */
export function createGlslEffect(fragmentSource: string): Effect {
  let gl: WebGL2RenderingContext | null = null
  let program: WebGLProgram | null = null
  const loc: Partial<Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>> = {}

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
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    dispose() {
      if (gl && program) gl.deleteProgram(program)
      program = null
    }
  }
}

/** Definition of a raw GLSL effect. Pass it to the element functions or to renderer.play(). */
export function defineGlslEffect(name: string, fragmentSource: string): EffectDef {
  return { name, create: () => createGlslEffect(fragmentSource) }
}
