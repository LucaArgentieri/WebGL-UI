# Architecture

## Effect contract

```ts
interface Effect {
  init(canvas: HTMLCanvasElement): void | Promise<void>
  render(frame: FxFrame): void   // time, progress, size, pointer, color, alpha
  dispose(): void
}
```

Standard uniforms for GLSL effects: `uTime`, `uProgress` (0 → 1 showing, 1 → 0 hiding), `uResolution`, `uPointer`, `uColor`, `uAlpha`. Fragment shaders write premultiplied alpha.

## Effects and renderer

An effect is described by an `EffectDef` (`{ name, create() }`, e.g. from `defineGlslEffect`). `createRenderer()` owns one canvas and one WebGL context and creates one `Effect` instance per definition, lazily and on its own canvas, so any number of effects share the same context. Programs are selected every frame (`useProgram`). A lost context re-initializes every effect when it comes back.

`prepare(def)` starts initializing an effect (idempotent) and `isReady(def)` tells whether it can render. Elements call `prepare` at creation and fall back to native behavior until the effect is ready, so the decision to intercept an event is always synchronous.

`play(host, { effect, ... })` appends the canvas to the host, runs a single `requestAnimationFrame` loop and resolves `true` (finished) or `false` (cancelled / backend failed). Only one animation is active at a time; a new `play` cancels the previous one. Animations carry an `owner` so an element only ever cancels its own.

One canvas can only hold one kind of context, so all the effects of a renderer must target the same one (raw WebGL2 here). A TSL effect gets a renderer of its own.

## TSL backend (`packages/tsl`)

`defineTslEffect(name, build, options)` returns an `EffectDef` like `defineGlslEffect`. On first use it loads `three/webgpu` and `three/tsl` with a dynamic `import()`, creates a `WebGPURenderer` on the renderer's canvas (WebGPU when available, WebGL2 otherwise; `backend: 'webgl'` forces WebGL2) and draws a full-screen `QuadMesh` whose `fragmentNode` is the user's graph. The graph receives the same inputs as a GLSL effect (`time`, `progress`, `resolution`, `color`, `alpha`, plus `uv`) as TSL nodes.

Contract details, all covered by e2e tests: the graph returns premultiplied alpha, so the material blends with `ONE / ONE_MINUS_SRC_ALPHA` and three's own premultiply is off (otherwise the color is multiplied by alpha twice); `uv` has its origin at the top left; output color space is linear so sRGB inputs are written untouched. If neither WebGPU nor WebGL2 is available, init fails and the elements stay native.

Layouts: `host` (canvas covers a positioned host) and `viewport` (fixed, behind the host's content: used inside a `<dialog>`, because `::backdrop` cannot contain a canvas).

## Element state machine (every element follows it)

1. **Logical state is separate from the animation.** `target` flips immediately on every action, like the native attribute. The animation chases the target, never the opposite.
2. **One place writes the final state.** `settle()` sets the native attribute / calls the native method and removes every inline style and attribute added during the animation.
3. **The last action wins.** The animation restarts from the current progress toward the new target, with a duration proportional to the distance. The shader clock is continuous.
4. **`runId`.** A superseded animation writes nothing anymore (styles, attributes, frames).
5. **Shared resources.** When another element takes the canvas, the previous one jumps to its own final state, never to the opposite one.
6. **One rAF loop per animation.** Every frame returns immediately if the animation is finished or cancelled.
7. **Every abnormal exit goes through `settle()`**: lost context, reduced motion, backend switch, errors.
8. **External changes** (native toggle, find-in-page, script) are picked up from native events when not animating.
9. **Fallback:** if the effect is not ready the event is not intercepted and native behavior applies.

## Stress test

Each playground page has one: random operations on several instances, several in the same tick, then invariants: final state equals the last operation, no leftover inline styles or attributes, no canvas in the DOM, renderer still ready. An element is not done until it passes (also run automatically by `npm run test:e2e`).
