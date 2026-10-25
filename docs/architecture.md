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

## Renderer

`createRenderer(effect)` owns one canvas and one WebGL context. `play(host, options)` appends the canvas to the host, runs a single `requestAnimationFrame` loop and resolves `true` (finished) or `false` (cancelled / backend failed). Only one animation is active at a time; a new `play` cancels the previous one. Animations carry an `owner` so an element only ever cancels its own.

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
