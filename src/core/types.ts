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
  /** uImage: an image the effect may sample (same-origin or CORS-clean), or null. */
  image?: TexImageSource | null
  /** uImageScale: maps the canvas uv to the image uv around the center (object-fit). [1, 1] = fill. */
  imageScale?: Vec2
  /** Extra uniforms by name, for element-specific inputs (e.g. uValue for progress bars). */
  params?: Record<string, number | readonly number[]>
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
 * 'host': the canvas covers the host element, over its content (host must be a positioned box).
 * 'behind': the canvas covers the host element, behind its content (z-index -1): the host must be a stacking
 *   context (a dialog or popover in the top layer is one; elsewhere use `isolation: isolate`). The effect can then
 *   paint the host's own surface while the content stays on top.
 * 'viewport': the canvas covers the viewport, behind the host's content (use it inside a <dialog>).
 */
export type FxLayout = 'host' | 'behind' | 'viewport'

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
  /**
   * Called once, right after the last frame of an animation that reached its end, before the canvas is removed:
   * the only moment its pixels can be read (e.g. canvas.toDataURL()) to hand them over to CSS.
   */
  onEnd?: (canvas: HTMLCanvasElement) => void
  /** Resolution of the canvas relative to the device pixels. Default 1, or 0.5 with layout 'viewport'. */
  scale?: number
  /** An image effects may sample as uImage (see createImageFx). */
  image?: TexImageSource | null
  imageScale?: Vec2
  /**
   * Extra uniforms by name (float, vec2, vec3 or vec4), passed to the effect on every frame; a function is called
   * on every frame with the same progress and time the effect gets.
   */
  params?: Record<string, number | readonly number[]> | ((progress: number, time: number) => Record<string, number | readonly number[]>)
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
