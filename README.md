# WebGL UI

Accessible-by-default WebGL effects for native HTML elements. Functions-first, framework-agnostic.

WebGL UI adds WebGL animation to native elements (`<dialog>`, `<details>`, `popover`, and next `<progress>`…) **without replacing them**. The native element stays the source of truth for state, events, focus and ARIA; WebGL only paints the surface. Scope and behavior follow the HTML specification as documented on MDN, and every element ships with a native-parity checklist and a stress test.

> Status: v0, experimental. The goal of this first version is to find out whether the idea is sound and usable. Not published to npm yet.

## Try it

Live playground and showcase: https://lucaargentieri.github.io/WebGL-UI/ (deployed from `main` by GitHub Pages).

```bash
npm install
npm run dev          # playground at http://localhost:5173
npm run typecheck
npm run test:e2e     # Playwright (Chromium, Firefox, WebKit): behavior checks + stress tests
```

The playground has one page per element. Each page has a **stress test** button: random, fast operations (including several in the same tick) followed by an invariant check.

## Usage

```ts
import { createRenderer, createDetailsFx } from 'webgl-ui'

// One renderer per page: one canvas, one WebGL context, shared by every element and every effect.
const renderer = createRenderer()

// Each element picks its own effect (default: dissolve for details, backdrop for dialog).
document.querySelectorAll('details').forEach(d => createDetailsFx(d, { renderer }))
```

```ts
import { createRenderer, createDetailsFx, createDialogFx, wipeEffect } from 'webgl-ui'
import 'webgl-ui/src/elements/dialog/dialog.css' // CSS contract, see the file

const renderer = createRenderer()
const dialog = document.querySelector('dialog')!

createDetailsFx(document.querySelector('details')!, { renderer, effect: wipeEffect })

// Register your own `cancel` listeners BEFORE this line: whoever vetoes the close wins.
createDialogFx(dialog, { renderer })

dialog.showModal() // same signature as the native method, now animated
```

```ts
import { createRenderer, createPopoverFx } from 'webgl-ui'

const renderer = createRenderer()
document.querySelectorAll('[popover]').forEach(p => createPopoverFx(p, { renderer }))
// popovertarget buttons and showPopover()/hidePopover()/togglePopover() are now animated
```

Built-in effects: `dissolveEffect`, `wipeEffect`, `backdropEffect`, and the paper-and-ink pair `inkEffect` / `inkVeilEffect` used by the showcase (a cover that recedes with an organic, fibrous edge, like ink soaking into paper). The elements also expose `--p` and `[data-animating]`, so CSS can add opacity or blur that follows the shader.

For a dialog, `createDialogFx(dialog, { renderer, effect, layout: 'host' })` paints the effect over the dialog box, so the modal itself appears from it, while the default (`'viewport'`) paints the backdrop. Set `--fx-cover: r, g, b` on the dialog, popover or details to choose the cover color.

Custom effects are raw GLSL ES 3.00 fragment shaders:

```ts
import { defineGlslEffect } from 'webgl-ui'

// May use: uTime, uProgress, uResolution, uPointer, uColor, uAlpha. Must write premultiplied alpha.
const myEffect = defineGlslEffect('my-effect', `#version 300 es ...`)
createDetailsFx(details, { renderer, effect: myEffect })
```

Effects can also be written in [TSL](https://threejs.org/docs/TSL.html) with the optional `packages/tsl` package (three.js is a peer dependency, loaded lazily; the core never imports it). A TSL effect needs a renderer of its own:

```ts
import { createRenderer, createDetailsFx } from 'webgl-ui'
import { defineTslEffect } from 'webgl-ui-tsl'

// The graph returns a vec4 with PREMULTIPLIED alpha. uv is 0..1 with the origin at the top left.
const fade = defineTslEffect('fade', ({ progress, color, uv }, { vec4, smoothstep }) => {
  const a = smoothstep(progress.sub(0.1), progress.add(0.1), uv.y).oneMinus()
  return vec4(color.mul(a), a)
})

const tslRenderer = createRenderer() // separate from the GLSL one
createDetailsFx(details, { renderer: tslRenderer, effect: fade })
```

Without WebGL2, with `prefers-reduced-motion: reduce`, or after a lost context, the elements behave exactly like the native ones. Until an effect has finished initializing (it starts at creation and is instant for GLSL) the element is native too.

## Principles

1. **Native first.** Never reimplement what the browser already does (focus trap, Esc, `inert`, ARIA role, focus restore).
2. **WebGL is decoration.** The canvas is `aria-hidden`, takes no focus or pointer events and holds no content.
3. **Progressive enhancement.** No WebGL, reduced motion, lost context: native behavior.
4. **Functions, not classes.** Small composable functions, no hidden global state, tree-shakeable.
5. **Backend-agnostic core.** An effect (`init`, `render`, `dispose`) can be raw GLSL today, TSL or anything else later. One renderer owns one canvas, so all its effects must target the same kind of context: a TSL effect needs its own renderer.

## Native parity

"Behaves like the native element" is an explicit contract, checked per element against the MDN reference. See [docs/parity.md](docs/parity.md) and [docs/architecture.md](docs/architecture.md).

## Layout

```
src/core/        renderer, GLSL backend, types
src/effects/     fragment shaders
src/elements/    one folder per element, named like its MDN page
packages/tsl/    optional TSL backend (three.js peer dependency)
playground/      Vite multi-page app
tests/e2e/       Playwright tests (real Chromium, software WebGL)
docs/            parity checklists, architecture
```

## Roadmap

- Backends: publish `webgl-ui-tsl` (today a source-only package in `packages/tsl`) and add more TSL effects.
- Elements: `<progress>`, `<input type="checkbox">`, `<input type="range">`, `<img>`/`<picture>`.
- Package split (`core`, `element` web components, `three`) once the API settles.
