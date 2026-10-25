import type { Effect, EffectDef, PlayOptions, Renderer, RendererSource } from './types'

const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)

export function resolveRenderer(source: RendererSource): Renderer {
  return typeof source === 'function' ? source() : source
}

interface Instance {
  effect: Effect
  ready: boolean
  init: Promise<boolean>
}

/**
 * One canvas, one WebGL context, one active animation at a time, any number of effects.
 * Create a single renderer per page and share it between all elements.
 */
export function createRenderer(): Renderer {
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.pointerEvents = 'none'
  canvas.style.display = 'block'

  const instances = new Map<EffectDef, Instance>()
  let disposed = false

  const initInstance = (inst: Instance): Promise<boolean> => {
    inst.init = (async () => {
      try {
        await inst.effect.init(canvas)
        inst.ready = !disposed
      } catch (err) {
        console.warn('[webgl-ui] effect init failed', err)
        inst.ready = false
      }
      return inst.ready
    })()
    return inst.init
  }

  function prepare(def: EffectDef): Promise<boolean> {
    let inst = instances.get(def)
    if (!inst) {
      inst = { effect: def.create(), ready: false, init: Promise.resolve(false) }
      instances.set(def, inst)
      initInstance(inst)
    }
    return inst.init
  }

  // A lost context takes every program with it: all effects are re-initialized when it comes back.
  const onLost = (e: Event) => {
    e.preventDefault()
    instances.forEach(inst => { inst.ready = false })
  }
  const onRestored = () => { instances.forEach(inst => { void initInstance(inst) }) }
  canvas.addEventListener('webglcontextlost', onLost)
  canvas.addEventListener('webglcontextrestored', onRestored)

  let stop: (() => void) | null = null
  let stopOwner: unknown = null

  function applyLayout(layout: 'host' | 'viewport') {
    const s = canvas.style
    s.inset = '0'
    s.width = '100%'
    s.height = '100%'
    if (layout === 'viewport') {
      s.position = 'fixed'
      s.zIndex = '-1'
    } else {
      s.position = 'absolute'
      s.zIndex = ''
    }
  }

  function play(host: HTMLElement, o: PlayOptions): Promise<boolean> {
    const inst = instances.get(o.effect)
    if (!inst || !inst.ready) return Promise.resolve(false)
    if (stop) stop()
    return new Promise<boolean>(resolve => {
      applyLayout(o.layout ?? 'host')
      host.append(canvas)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const fit = () => {
        // Assigning width/height clears the canvas: only when the size actually changes.
        const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
        const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
        if (canvas.width !== w) canvas.width = w
        if (canvas.height !== h) canvas.height = h
      }
      const t0 = performance.now()
      const time0 = o.time0 ?? 0
      let raf = 0
      let done = false

      const myStop = () => finish(false)
      const finish = (completed: boolean) => {
        if (done) return
        done = true
        cancelAnimationFrame(raf)
        // Only if this is still the active animation: an old one must not remove the canvas from a newer one.
        if (stop === myStop) {
          canvas.remove()
          stop = null
          stopOwner = null
        }
        resolve(completed)
      }
      stop = myStop
      stopOwner = o.owner ?? null

      const frame = (now: number) => {
        if (done) return // a queued frame after the end or a cancel must write nothing
        if (!inst.ready) return finish(false)
        fit()
        const elapsed = Math.max(now - t0, 0)
        const k = Math.min(elapsed / o.duration, 1)
        const progress = o.from + (o.to - o.from) * easeInOut(k)
        const time = time0 + elapsed / 1000
        o.onFrame?.(progress, time)
        inst.effect.render({
          time,
          progress,
          size: [canvas.width, canvas.height],
          pointer: [0.5, 0.5],
          color: o.color,
          alpha: o.alpha ?? 1
        })
        if (k < 1) raf = requestAnimationFrame(frame)
        else finish(true)
      }
      frame(performance.now()) // first frame right away: no flash of the underlying content
    })
  }

  return {
    canvas,
    prepare,
    isReady: def => instances.get(def)?.ready ?? false,
    play,
    cancel(owner?: unknown) {
      if (stop && (owner === undefined || stopOwner === owner)) stop()
    },
    dispose() {
      disposed = true
      if (stop) stop()
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      instances.forEach(inst => { inst.ready = false; inst.effect.dispose() })
      instances.clear()
      canvas.remove()
    }
  }
}
