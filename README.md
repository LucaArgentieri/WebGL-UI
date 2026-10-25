# WebGL UI

Accessible-by-default WebGL effects for native HTML elements. Functions-first, framework-agnostic.

WebGL UI adds WebGL animation to native elements (`<dialog>`, `<details>`, and next `popover`, `<progress>`…) **without replacing them**. The native element stays the source of truth for state, events, focus and ARIA; WebGL only paints the surface. Scope and behavior follow the HTML specification as documented on MDN, and every element ships with a native-parity checklist and a stress test.

> Status: v0, experimental. The goal of this first version is to find out whether the idea is sound and usable. Not published to npm yet.

## Try it

```bash
npm install
npm run dev          # playground at http://localhost:5173
npm run typecheck
npm run test:e2e     # Playwright (Chromium): behavior checks + stress tests
```

The playground has one page per element. Each page has a **stress test** button: random, fast operations (including several in the same tick) followed by an invariant check.

## Usage

```ts
import { createRenderer, createGlslEffect, createDetailsFx, DISSOLVE_FRAG } from 'webgl-ui'

// One renderer per page: one canvas, one WebGL context, one active animation.
const renderer = createRenderer(createGlslEffect(DISSOLVE_FRAG))

document.querySelectorAll('details').forEach(d => createDetailsFx(d, { renderer }))
```

```ts
import { createRenderer, createGlslEffect, createDialogFx, BACKDROP_FRAG } from 'webgl-ui'
import 'webgl-ui/src/elements/dialog/dialog.css' // CSS contract, see the file

const renderer = createRenderer(createGlslEffect(BACKDROP_FRAG))
const dialog = document.querySelector('dialog')!

// Register your own `cancel` listeners BEFORE this line: whoever vetoes the close wins.
createDialogFx(dialog, { renderer })

dialog.showModal() // same signature as the native method, now animated
```

Without WebGL2, with `prefers-reduced-motion: reduce`, or after a lost context, the elements behave exactly like the native ones.

## Principles

1. **Native first.** Never reimplement what the browser already does (focus trap, Esc, `inert`, ARIA role, focus restore).
2. **WebGL is decoration.** The canvas is `aria-hidden`, takes no focus or pointer events and holds no content.
3. **Progressive enhancement.** No WebGL, reduced motion, lost context: native behavior.
4. **Functions, not classes.** Small composable functions, no hidden global state, tree-shakeable.
5. **Backend-agnostic core.** An `Effect` (`init`, `render`, `dispose`) can be raw GLSL today, TSL or anything else later.

## Native parity

"Behaves like the native element" is an explicit contract, checked per element against the MDN reference. See [docs/parity.md](docs/parity.md) and [docs/architecture.md](docs/architecture.md).

## Layout

```
src/core/        renderer, GLSL backend, types
src/effects/     fragment shaders
src/elements/    one folder per element, named like its MDN page
playground/      Vite multi-page app
tests/e2e/       Playwright tests (real Chromium, software WebGL)
docs/            parity checklists, architecture
```

## Roadmap

- Backends: TSL (three.js) as an optional package, never a core dependency.
- Elements: `popover`, `<progress>`, `<input type="checkbox">`, `<input type="range">`, `<img>`/`<picture>`.
- Package split (`core`, `element` web components, `three`) once the API settles.
- Firefox and WebKit in the e2e matrix.
