import type { Effect, EffectDef, FxFrame } from 'webgl-ui'

/**
 * Standard inputs of a TSL effect, the same ones a GLSL effect gets as uniforms.
 * They are TSL nodes: combine them with the `three/tsl` operators. `uv` is normalized (0..1)
 * with the origin at the top left, like `screenUV` in three.js.
 */
export interface TslInputs {
  time: any
  progress: any
  resolution: any
  color: any
  alpha: any
  uv: any
}

/** Builds the fragment output: a `vec4` node with PREMULTIPLIED alpha. */
export type TslBuild = (inputs: TslInputs, tsl: typeof import('three/tsl')) => any

export interface TslEffectOptions {
  /** 'auto' lets three.js pick WebGPU when available and fall back to WebGL2. 'webgl' forces WebGL2. */
  backend?: 'auto' | 'webgl'
}

/**
 * Definition of a TSL effect. three.js is loaded lazily, on first use, so it never ends up in a page that does
 * not use it. Give it a renderer of its own: `createRenderer()` owns one canvas, and a canvas holds one kind of
 * context, so TSL effects cannot share a renderer with raw GLSL effects.
 */
export function defineTslEffect(name: string, build: TslBuild, options: TslEffectOptions = {}): EffectDef {
  return { name, create: () => createTslEffect(build, options) }
}

function createTslEffect(build: TslBuild, options: TslEffectOptions): Effect {
  let renderer: import('three/webgpu').WebGPURenderer | null = null
  let quad: import('three/webgpu').QuadMesh | null = null
  let material: import('three/webgpu').NodeMaterial | null = null
  let uniforms: { time: any; progress: any; resolution: any; color: any; alpha: any } | null = null
  let size: [number, number] = [0, 0]
  let disposed = false

  return {
    async init(canvas) {
      const [three, tsl] = await Promise.all([import('three/webgpu'), import('three/tsl')])
      const r = new three.WebGPURenderer({
        canvas,
        alpha: true,
        antialias: false,
        forceWebGL: options.backend === 'webgl'
      })
      r.setPixelRatio(1) // the core already sizes the canvas in physical pixels
      r.outputColorSpace = three.LinearSRGBColorSpace // colors arrive in sRGB, write them as they are
      try {
        await r.init()
      } catch (err) {
        r.dispose()
        throw err
      }
      if (disposed) { r.dispose(); return }

      const u = {
        time: tsl.uniform(0),
        progress: tsl.uniform(0),
        resolution: tsl.uniform(new three.Vector2(1, 1)),
        color: tsl.uniform(new three.Vector3(1, 1, 1)),
        alpha: tsl.uniform(1)
      }
      const m = new three.NodeMaterial()
      m.transparent = true
      // The graph already returns premultiplied color: three must not multiply by alpha again
      // (premultipliedAlpha: true would), so blend with ONE / ONE_MINUS_SRC_ALPHA by hand.
      m.premultipliedAlpha = false
      m.blending = three.CustomBlending
      m.blendEquation = three.AddEquation
      m.blendSrc = three.OneFactor
      m.blendDst = three.OneMinusSrcAlphaFactor
      m.blendSrcAlpha = three.OneFactor
      m.blendDstAlpha = three.OneMinusSrcAlphaFactor
      m.depthTest = false
      m.depthWrite = false
      m.toneMapped = false
      m.fragmentNode = build({ ...u, uv: tsl.screenUV }, tsl)
      renderer = r
      material = m
      uniforms = u
      quad = new three.QuadMesh(m)
    },
    render(f: FxFrame) {
      if (!renderer || !quad || !uniforms) return
      if (size[0] !== f.size[0] || size[1] !== f.size[1]) {
        size = [f.size[0], f.size[1]]
        renderer.setSize(size[0], size[1], false)
      }
      uniforms.time.value = f.time
      uniforms.progress.value = f.progress
      uniforms.resolution.value.set(f.size[0], f.size[1])
      uniforms.color.value.set(f.color[0], f.color[1], f.color[2])
      uniforms.alpha.value = f.alpha
      renderer.setClearColor(0x000000, 0)
      quad.render(renderer)
    },
    dispose() {
      disposed = true
      material?.dispose()
      renderer?.dispose()
      renderer = null
      quad = null
      material = null
      uniforms = null
    }
  }
}
