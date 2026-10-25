export type Vec2 = [number, number]
export type Vec3 = [number, number, number]

/** What an effect receives on every frame. Sizes are in physical pixels. */
export interface FxFrame {
  /** uTime: seconds, continuous across reversals of the same animation. */
  time: number
  /** uProgress: 0 → 1 while showing, 1 → 0 while hiding. */
  progress: number
  /** uResolution */
  size: Vec2
  /** uPointer, normalized 0..1 */
  pointer: Vec2
  /** uColor: sRGB 0..1 */
  color: Vec3
  /** uAlpha */
  alpha: number
}

/**
 * Contract between the core and a rendering backend (raw GLSL, TSL, ...).
 * init() may be async: some backends need to load or initialize first.
 */
export interface Effect {
  init(canvas: HTMLCanvasElement): void | Promise<void>
  render(frame: FxFrame): void
  dispose(): void
}

/**
 * A reusable effect definition. A renderer creates and owns one Effect instance per definition,
 * lazily, on its own canvas: many definitions can share one renderer (one canvas, one WebGL context).
 * All definitions of a renderer must target the same kind of context (e.g. raw WebGL2).
 */
export interface EffectDef {
  readonly name: string
  create(): Effect
}

/**
 * 'host': the canvas covers the host element (host must be a positioned box).
 * 'viewport': the canvas covers the viewport, behind the host's content (use it inside a <dialog>).
 */
export type FxLayout = 'host' | 'viewport'

export interface PlayOptions {
  effect: EffectDef
  from: number
  to: number
  /** milliseconds */
  duration: number
  color: Vec3
  alpha?: number
  /** Start value of uTime, to keep the shader clock continuous across reversals. */
  time0?: number
  /** Who owns this animation: cancel(owner) only stops animations of that owner. */
  owner?: unknown
  layout?: FxLayout
  /** Called synchronously on every frame, before rendering, with the same progress the shader gets. */
  onFrame?: (progress: number, time: number) => void
}

export interface Renderer {
  readonly canvas: HTMLCanvasElement
  /** Initializes the effect on this renderer's canvas. Idempotent. Resolves true when it can render. */
  prepare(effect: EffectDef): Promise<boolean>
  isReady(effect: EffectDef): boolean
  /** Resolves true if the animation reached its end, false if it was cancelled or the backend failed. */
  play(host: HTMLElement, options: PlayOptions): Promise<boolean>
  /** Stops the active animation. With an owner, only if the active animation belongs to it. */
  cancel(owner?: unknown): void
  dispose(): void
}

export type RendererSource = Renderer | (() => Renderer)
