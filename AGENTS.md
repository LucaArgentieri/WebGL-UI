# AGENTS.md

Guidance for coding agents (and humans) working on WebGL UI. Read this before changing anything: the library is small, but its value is in a few rules that are easy to break without noticing.

## What this is

WebGL UI adds WebGL (and WebGPU) animation to **native HTML elements** — `<details>`, `<dialog>`, `popover`, `<img>`, `<progress>`, `<meter>`, and content swaps — **without replacing them**. The element keeps its state, events, keyboard, focus and place in the accessibility tree; the library only decides *when* to paint and *what* the surface looks like while the state changes.

Live: https://lucaargentieri.github.io/WebGL-UI/ (showcase) and `/docs/` (components, cookbook, reference).

## Philosophy (non-negotiable)

1. **Native first.** Never reimplement what the browser does: focus trap, Esc, `inert`, roles, focus restore, light dismiss, exclusive accordions. Wrap the native call, let the browser do the work, animate around it.
2. **The native element is the source of truth.** Its attributes and events must always tell the truth from the outside. The library keeps a *logical target* (where the element is heading) and writes the real state in one place only (`settle()`).
3. **WebGL is decoration.** The canvas is `aria-hidden`, takes no focus or pointer events, holds no content, and exists only while an animation runs. Nothing may carry meaning only in the canvas.
4. **Progressive enhancement.** No WebGL2/WebGPU, a lost context, `prefers-reduced-motion`, `forced-colors`, `prefers-contrast: more`, `prefers-reduced-transparency`: the element behaves exactly like the native one (`effectsAllowed()`). The decision to intercept an event is always synchronous.
5. **Functions, not classes.** Small composable functions (`createXxxFx(element, options)` returning a handle), no hidden global state beyond what is documented (one device/context per canvas, the collapse map for accordions).
6. **CSS can follow, CSS can do the rest.** While animating, elements expose `[data-animating]` and `--p` (the same progress the shader gets). Opacity, blur, shadows, backdrops belong to CSS; WebGL does what CSS cannot (organic edges, noise, sampling pixels).
7. **Every claim is tested.** Each element has a parity table against MDN (`docs/parity.md`), a playground page with a stress test, and e2e tests including the fallbacks.

When a request conflicts with these rules (e.g. "animate Esc on a popover"), say so and explain the trade-off instead of breaking a rule silently. Browser-initiated closes that cannot be vetoed stay instant and are documented.

## Mental model

```
native element ──(click / method / command / native event)──► element wrapper (src/elements/*)
                                                                │  logical target, runId, settle()
                                                                ▼
                                                    renderer.play(host, { effect, from, to, … })
                                                                │  one canvas, one context, one animation at a time
                                                                ▼
                                                    effect.render(frame)  (GLSL / WGSL / TSL)
```

- **Renderer** (`src/core/renderer.ts`): one canvas + one context, shared by every element of a page. `prepare(effect)` initializes an effect (idempotent), `play()` runs one animation (a new one cancels the previous; `owner` scopes `cancel`), a deadline ends an animation even if frames stall, a throwing frame never leaves the canvas.
- **Effect** (`EffectDef` → `Effect`): `init(canvas)`, `render(frame)`, `dispose()`. Backends: raw GLSL (`src/core/glsl.ts`), raw WGSL on WebGPU with a GLSL fallback (`src/core/wgsl.ts`), TSL via three.js (`packages/tsl`). One canvas holds one kind of context: GLSL and WGSL/TSL effects need separate renderers.
- **Progress** `uProgress` / `fx.progress`: 0 → 1 while showing, 1 → 0 while hiding, eased. Reversals start from the current progress (no jumps).
- **Two families of effects**
  - *Cover*: fully covering at 0, fully transparent at 1 (`inkEffect`, `dissolveEffect`, `wipeEffect`). Used over content that is revealed.
  - *Veil*: transparent at 0, uniform `uColor × uAlpha` at 1 (`inkVeilEffect`, `backdropEffect`). Used for backdrops, and with `layout: 'behind'` to paint a surface that appears from nothing. Its last frame must equal the CSS that takes over.
  - *Persisted backdrop*: when the last frame cannot be drawn by CSS (`halftoneEffect`: noise-sized dots), the dialog's `keepBackdrop` reads that frame in `onEnd` and hands it to the `::backdrop` as an image. The canvas still goes away; the image is plain CSS decoration.
- **Layouts**: `host` (canvas over the host's content), `behind` (canvas behind the content, z-index −1, host must be a stacking context — dialogs and popovers in the top layer are), `viewport` (fixed, behind a dialog's panel; drawn at half resolution).
- **Colors**: `--fx-cover: r, g, b` (0–255, commas) on the element chooses what the shader paints; otherwise the surface background. Dialog backdrops use `--fx-rgb` / `--fx-a`, read by both CSS and shader.

## Repository map

```
src/core/        renderer, types, GLSL and WGSL backends, colors, preferences (effectsAllowed, MAX_DURATION)
src/effects/     built-in effects (ink, ink-wgsl, dissolve, wipe, backdrop, bar)
src/elements/    one folder per element/helper: details, dialog (+ dialog.css), popover, image, progress (+ progress.css), swap
packages/tsl/    optional TSL backend (three.js peer dependency, lazy-loaded)
playground/      Vite multi-page app: showcase (index), one page per element with stress tests, spikes/
playground/docs/ documentation site (static HTML + docs.ts wiring live examples; nav in _nav.html, inlined at build)
docs/            parity.md, architecture.md, html-in-canvas.md (rendered as the docs "Reference" section)
tests/e2e/       Playwright specs (Chromium, Firefox, WebKit in CI); fixtures.ts, helpers.ts
scripts/         docs-reference.mjs (markdown → HTML, build and dev server)
```

## Using it

```ts
import { createRenderer, createDetailsFx, createDialogFx, createPopoverFx, inkEffect, inkVeilEffect } from 'webgl-ui'
import 'webgl-ui/src/elements/dialog/dialog.css'

const renderer = createRenderer() // one per page
document.querySelectorAll('details').forEach(d => createDetailsFx(d, { renderer, effect: inkEffect }))
createDialogFx(dialog, { renderer, effect: inkVeilEffect, layout: 'behind' })
createPopoverFx(menu, { renderer, effect: inkVeilEffect, layout: 'behind' })
```

| Need | Function | Notes |
| --- | --- | --- |
| `<details>` reveal + height | `createDetailsFx` | content is the first non-summary child; exclusive accordions supported |
| Modal `<dialog>` | `createDialogFx` | needs `dialog.css` and a `[data-fx-panel]`; layouts `viewport` / `behind` / `host`; `keepBackdrop`, `paintsPanel` |
| `popover` | `createPopoverFx` | methods, `popovertarget`, `commandfor`; Esc/light dismiss stay instant |
| `<img>` / `<picture>` | `createImageFx` | effects may sample the image (`uImage`); `[data-fx-pending]` while loading |
| `<progress>` / `<meter>` | `createProgressFx` | needs `progress.css`; extra uniforms via `params` |
| Content swaps | `createSwapFx(region).run(update)` | cover → your DOM update → reveal; focus and height handled |
| Custom effects | `defineGlslEffect`, `defineWgslEffect`, `defineTslEffect` | see "Writing an effect" |

The docs site (`playground/docs/`) has a page per component with options, returned handle, CSS hooks and behavior, plus a cookbook. Keep it in sync with the code.

## Extending

### Adding an element

1. Read the MDN page. List every **native path** that changes the state, including the ones the browser takes alone (Esc, light dismiss, `name` groups, find-in-page, `command` events). Decide for each: intercepted and animated, or native and documented.
2. Copy the shape of an existing wrapper (`popover` is the most complete): logical `target`, `progress`, `runId` (the latest run wins; superseded runs write nothing), `owner` for `renderer.cancel(owner)`, `settle()` as the only writer of native state, `fxAvailable()` (prepare + `effectsAllowed()`), `prepare(effect)` at creation.
3. Native events are often **asynchronous** (`toggle`, `close`). Before acting, reconcile the logical state with the real one (see `syncState()` in popover and the name-group check in details).
4. Expose `[data-animating]` and `--p`; remove every inline style and attribute you added when the run settles or is aborted.
5. Add: a parity section in `docs/parity.md`, a playground page (+ `vite.config.ts` input, + link in `playground/index.html`) with a stress test, e2e tests (behavior, reversals, stress, no WebGL2, preferences), a docs page (+ `_nav.html`, `vite.config.ts` `docs` list, `tests/e2e/docs.spec.ts` pages list), README.

### Writing an effect

- **Premultiplied alpha**, always. A cover is fully transparent at progress 1; a veil ends on uniform `uColor × uAlpha`. Test both ends with a pixel probe (`tests/e2e/effects.spec.ts`, `webgpu.spec.ts`).
- **No flashing** above 3 Hz (WCAG 2.3.1); one sweep per interaction. Durations are capped at 5 s (`MAX_DURATION`).
- **The canvas is a rectangle**: fade edge details (ink "soak") near the canvas borders, or they look cut.
- **Make the end reachable on any aspect ratio** (normalize distances by the farthest corner), otherwise the remaining cover disappears at once when the canvas is removed.
- **UV conventions**: GLSL `gl_FragCoord / uResolution` has its origin at the bottom left; WGSL `uv` and TSL `uv` at the top left.
- GLSL extras: `uImage` / `uImageScale` / `uHasImage` (image sampling, must degrade to a plain cover when `uHasImage == 0`), any uniform by name via `PlayOptions.params`. WGSL: no image or params yet.
- Cost matters on software renderers: prefer few octaves of noise; viewport effects are already half resolution.

### Adding a backend

Implement `Effect` (async `init` is fine), report failures by throwing from `init` (elements then stay native), accept that one canvas = one context kind, and add a fallback path where possible (see `createWgslEffect`).

## Invariants and pitfalls (learned the hard way)

- **The canvas is appended to the host while animating.** Structural selectors see it: `p:last-child` stopped matching, a margin came back and the details jumped 14 px at the end. Use `:last-of-type` / `:not(canvas)` in CSS that targets animated content.
- **Measure with fractional sizes** (`getBoundingClientRect`) when you hand a height back to layout; integer `offsetHeight` leaves a sub-pixel jump.
- **Clipping**: a details clips its content while its height grows; soften the clip edge with a mask driven by `--p` (cookbook), not by guessing in the shader.
- **Async native events**: a native close can happen between your call and its `toggle`/`close` event. Check the element itself (`:popover-open`, `.open`) before trusting the logical state; a run closed natively must not reopen the element in `settle()`.
- **Premultiplied twice**: three.js multiplies by alpha again unless told not to (see `packages/tsl`).
- **`rgb(var(--x) / a)`** needs a space-separated custom property; a comma-separated one silently invalidates the whole declaration.
- **`::backdrop` inherits `--p`** from its dialog in current engines; older ones fall back to the default value.
- **Animated blur radius** re-rasterizes text every frame: change it in whole steps (`round()`), fade backdrop blur with opacity instead of radius.
- **The end of an animation is when native work happens** (a dialog's `close` event, focus restore): never make it depend on frame cadence (the renderer has a deadline).

## Testing

```bash
npm install
npm run typecheck
npm run build            # tsc + vite build + reference pages
npm run test:e2e         # Playwright; CI runs chromium, firefox, webkit as separate jobs
npx playwright test --project=chromium tests/e2e/details.spec.ts
```

- If Playwright cannot download browsers in your environment, create a git-ignored `pw.local.config.ts` that spreads `playwright.config.ts` and sets `launchOptions.executablePath` for an installed Chromium, then run `npx playwright test -c pw.local.config.ts`.
- Chromium is launched with SwiftShader (software WebGL), `CanvasDrawElement` (HTML-in-Canvas spike) and a SwiftShader WebGPU adapter.
- **Headless WebGPU canvases are not visible in screenshots**: check WGSL output by rendering offscreen and reading pixels back (`renderOffscreen` hook in `playground/src/webgpu.ts`).
- **Screenshots stall frames**: never sample "the middle of an animation" with a screenshot; hold the effect at a fixed progress (`from === to`) or slow time with an init script that scales `performance.now` and `requestAnimationFrame`.
- **Slow browsers finish animations before you look**: assert that a canvas *appeared* with `sawCanvas(page, selector, action)` (`tests/e2e/fixtures.ts`) instead of polling for it afterwards. Budgets in tests check clean-up, not speed: keep them generous.
- Headless Firefox in CI may have no WebGL2: tests that need it are skipped there (visibly), the fallback tests still run.
- The fixture prints the browser console on failure: read it before guessing.
- Pages exposes test hooks on `window.__webglUi` (`ready`, `runStress`, probes). Keep them small and documented.

## Docs and site

- `playground/docs/*.html` are hand-written pages sharing `docs.css`; the navigation lives in `playground/docs/_nav.html` and is inlined by a Vite plugin (with `aria-current`). Live examples are wired by `data-fx` / `data-effect` / `data-layout` attributes in `docs.ts`.
- `docs/*.md` become `/docs/reference/*.html` (build and dev server).
- GitHub Pages deploys `dist-playground/` on every push to `main` (`.github/workflows/pages.yml`).
- Visual language of the site: editorial, paper and ink, one serif, no rules; keep new pages consistent.

## Conventions

- English for code, comments, docs, commits, issues.
- Match the surrounding code: small functions, comments that explain *why*, no classes.
- Commits are authored by the maintainer; **do not add AI attribution or co-author trailers** to commits, PRs, issues or comments.
- One issue → one commit (or a few) with `Closes #N`; update docs, parity and tests in the same change.
- Before pushing: typecheck, build, the full e2e suite on Chromium at least; watch CI on all three engines.

## Where to improve next

- WGSL: image sampling and `params` (parity with GLSL); device-lost recovery.
- Several simultaneous effects on one canvas (scissor regions) → scroll-driven effects (`ScrollTimeline` / `ViewTimeline` as the clock).
- A WAAPI / `@starting-style` clock so browser-initiated closes can be animated where `overlay` exists.
- HTML-in-Canvas: a separate, feature-detected `createDrawableFx` (see `docs/html-in-canvas.md`), once Chrome 157 is verified.
- Form controls (checkbox, switch, range) with a wrapper contract; customizable `<select>`.
- Cross-document view transitions (`pagereveal`), once Firefox supports them.
- Package split and an npm release once the API settles; convert the remaining "canvas appears" e2e checks to `sawCanvas`.
