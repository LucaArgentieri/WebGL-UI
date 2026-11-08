import {
  createRenderer, createDetailsFx, createDialogFx, createPopoverFx, inkGpuEffect, inkVeilGpuEffect, effectsAllowed,
  wgslSource, INK_WGSL, INK_VEIL_WGSL, LIQUID_GLASS_WGSL
} from 'webgl-ui'
import '../../src/elements/dialog/dialog.css'

// WGSL effects get a renderer of their own: its canvas holds a WebGPU context (or WebGL2 for the fallbacks).
const renderer = createRenderer()
document.querySelectorAll<HTMLDetailsElement>('details').forEach(d => createDetailsFx(d, { renderer, effect: inkGpuEffect }))
createPopoverFx(document.getElementById('gp')!, { renderer, effect: inkVeilGpuEffect, layout: 'behind' })
const dialog = document.getElementById('gd') as HTMLDialogElement
createDialogFx(dialog, { renderer, effect: inkVeilGpuEffect, layout: 'behind' })
document.getElementById('open')!.addEventListener('click', () => dialog.showModal())

// Which backend ended up on the canvas: a canvas with a WebGPU context has no WebGL2 one, and vice versa.
async function backend(): Promise<'webgpu' | 'webgl2' | 'none'> {
  const ready = (await Promise.all([renderer.prepare(inkGpuEffect), renderer.prepare(inkVeilGpuEffect)])).every(Boolean)
  if (!ready) return 'none'
  return renderer.canvas.getContext('webgl2') ? 'webgl2' : 'webgpu'
}

void backend().then(b => {
  document.getElementById('backend')!.textContent = {
    webgpu: 'Drawing with WebGPU.',
    webgl2: 'WebGPU is not available here: drawing with the WebGL2 fallback.',
    none: 'Neither WebGPU nor WebGL2 is available: the elements are native.'
  }[b] + (effectsAllowed() ? '' : ' Reduced motion or another preference: the elements are native.')
})

Object.assign(window, {
  __webglUi: {
    ready: () => backend().then(b => b !== 'none'),
    backend,
    /**
     * Test hook: renders an effect's WGSL into an offscreen texture and reads the center pixel back. Headless
     * browsers may not present WebGPU canvases on screen, so screenshots cannot check the shader; this does.
     */
    async renderOffscreen(name: 'ink' | 'veil' | 'liquid', progress: number, color: [number, number, number], alpha = 1) {
      const adapter = await navigator.gpu?.requestAdapter()
      if (!adapter) return null
      const device = await adapter.requestDevice()
      const size = 64
      const format: GPUTextureFormat = 'rgba8unorm'
      const module = device.createShaderModule({ code: wgslSource(name === 'ink' ? INK_WGSL : name === 'veil' ? INK_VEIL_WGSL : LIQUID_GLASS_WGSL) })
      const pipeline = await device.createRenderPipelineAsync({
        layout: 'auto', vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format }] }
      })
      const ubo = device.createBuffer({ size: 48, usage: 0x40 | 0x8 })
      device.queue.writeBuffer(ubo, 0, new Float32Array([size, size, 0.5, 0.5, color[0], color[1], color[2], 0, 0, progress, alpha, 3]))
      const target = device.createTexture({ size: [size, size], format, usage: 0x10 | 0x01 })
      const out = device.createBuffer({ size: size * size * 4, usage: 0x8 | 0x1 })
      const enc = device.createCommandEncoder()
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: target.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] })
      pass.setPipeline(pipeline)
      pass.setBindGroup(0, device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubo } }] }))
      pass.draw(3)
      pass.end()
      enc.copyTextureToBuffer({ texture: target }, { buffer: out, bytesPerRow: size * 4 }, [size, size])
      device.queue.submit([enc.finish()])
      await out.mapAsync(1)
      const px = new Uint8Array(out.getMappedRange())
      const i = ((size >> 1) * size + (size >> 1)) * 4
      const rgba = [px[i]!, px[i + 1]!, px[i + 2]!, px[i + 3]!]
      out.unmap()
      device.destroy()
      return rgba
    },
    /** Test hook: holds an effect at a progress on a white box. */
    async hold(name: 'ink' | 'veil', progress: number, color: [number, number, number], alpha = 1) {
      const effect = name === 'ink' ? inkGpuEffect : inkVeilGpuEffect
      if (!(await renderer.prepare(effect))) return false
      document.getElementById('hold-host')?.remove()
      const host = document.createElement('div')
      host.id = 'hold-host'
      host.style.cssText = 'position:fixed;left:0;top:0;width:320px;height:200px;z-index:10;background:#fff'
      document.body.append(host)
      void renderer.play(host, { effect, from: progress, to: progress, duration: 3000, color, alpha, layout: 'host' })
      return true
    }
  }
})
