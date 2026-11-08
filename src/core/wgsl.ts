import type { Effect, EffectDef, FxFrame } from './types'

/**
 * Raw WGSL backend (WebGPU), no dependencies. An effect is a WGSL function
 *
 *   fn effect(uv: vec2f, frag: vec2f) -> vec4f
 *
 * returning premultiplied color. `uv` is 0..1 with the origin at the top left (the WebGPU convention); `frag` is
 * the fragment position in pixels. The standard inputs are in the uniform `fx`:
 *
 *   fx.progress, fx.time, fx.resolution, fx.pointer, fx.color (rgb in .xyz), fx.alpha,
 *   fx.drift (the `uDrift` param when the caller passes one, e.g. a dialog with keepBackdrop; otherwise fx.time)
 *
 * Without WebGPU (no navigator.gpu, no adapter) the effect runs its `fallback` (a GLSL effect) on the same canvas;
 * without a fallback it fails to initialize and elements stay native. A canvas holds one kind of context, so give
 * WGSL effects a renderer of their own, separate from GLSL effects (like TSL effects).
 */
export const WGSL_PRELUDE = /* wgsl */ `
struct Fx {
  resolution: vec2f,
  pointer: vec2f,
  color: vec4f,
  time: f32,
  progress: f32,
  alpha: f32,
  drift: f32,
}
@group(0) @binding(0) var<uniform> fx: Fx;

struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f }

@vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  var o: VOut;
  o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0);
  o.uv = vec2f(p.x, 1.0 - p.y);
  return o;
}
`

const FRAGMENT_ENTRY = /* wgsl */ `
@fragment fn fs(v: VOut) -> @location(0) vec4f { return effect(v.uv, v.pos.xy); }
`

/** The complete shader module for an effect: prelude (uniforms, vertex stage), the effect, the fragment entry. */
export const wgslSource = (code: string) => WGSL_PRELUDE + code + FRAGMENT_ENTRY

// GPUBufferUsage / GPUTextureUsage values (the constants are not in every TypeScript DOM lib).
const UNIFORM = 0x40
const COPY_DST = 0x8

interface Gpu { device: GPUDevice; context: GPUCanvasContext; format: GPUTextureFormat }

// One device and one configured context per canvas, shared by every WGSL effect drawn on it.
const gpus = new WeakMap<HTMLCanvasElement, Promise<Gpu | null>>()

function gpuFor(canvas: HTMLCanvasElement): Promise<Gpu | null> {
  let g = gpus.get(canvas)
  if (!g) {
    g = (async () => {
      if (!('gpu' in navigator) || !navigator.gpu) return null
      const adapter = await navigator.gpu.requestAdapter()
      if (!adapter) return null
      const device = await adapter.requestDevice()
      const context = canvas.getContext('webgpu') as GPUCanvasContext | null
      if (!context) throw new Error('[webgl-ui] this canvas already holds another kind of context: use a renderer of its own for WGSL effects')
      const format = navigator.gpu.getPreferredCanvasFormat()
      context.configure({ device, format, alphaMode: 'premultiplied' })
      device.lost.then(() => { gpus.delete(canvas) }) // a later prepare() starts over
      return { device, context, format }
    })()
    gpus.set(canvas, g)
  }
  return g
}

export function createWgslEffect(code: string, fallback?: EffectDef): Effect {
  let gpu: Gpu | null = null
  let pipeline: GPURenderPipeline | null = null
  let buffer: GPUBuffer | null = null
  let group: GPUBindGroup | null = null
  let delegate: Effect | null = null
  const data = new Float32Array(12)

  return {
    async init(canvas) {
      gpu = await gpuFor(canvas)
      if (!gpu) {
        if (!fallback) throw new Error('[webgl-ui] WebGPU is not available')
        delegate = fallback.create()
        await delegate.init(canvas)
        return
      }
      const { device, format } = gpu
      const module = device.createShaderModule({ code: wgslSource(code) })
      const errors = (await module.getCompilationInfo()).messages.filter(m => m.type === 'error')
      if (errors.length) throw new Error('[webgl-ui] WGSL compile error: ' + errors.map(m => `${m.lineNum}:${m.linePos} ${m.message}`).join('; '))
      pipeline = await device.createRenderPipelineAsync({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format }] },
        primitive: { topology: 'triangle-list' }
      })
      buffer = device.createBuffer({ size: data.byteLength, usage: UNIFORM | COPY_DST })
      group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer } }] })
    },
    render(f: FxFrame) {
      if (delegate) { delegate.render(f); return }
      if (!gpu || !pipeline || !buffer || !group) return
      const drift = f.params?.uDrift
      data.set([f.size[0], f.size[1], f.pointer[0], f.pointer[1], f.color[0], f.color[1], f.color[2], 0, f.time, f.progress, f.alpha, typeof drift === 'number' ? drift : f.time])
      gpu.device.queue.writeBuffer(buffer, 0, data)
      const encoder = gpu.device.createCommandEncoder()
      const pass = encoder.beginRenderPass({
        colorAttachments: [{ view: gpu.context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }]
      })
      pass.setPipeline(pipeline)
      pass.setBindGroup(0, group)
      pass.draw(3)
      pass.end()
      gpu.device.queue.submit([encoder.finish()])
    },
    dispose() {
      delegate?.dispose()
      buffer?.destroy()
      buffer = null
      pipeline = null
      group = null
    }
  }
}

/** Definition of a WGSL effect, with an optional GLSL fallback for browsers without WebGPU. */
export function defineWgslEffect(name: string, code: string, options: { fallback?: EffectDef } = {}): EffectDef {
  return { name, create: () => createWgslEffect(code, options.fallback) }
}
