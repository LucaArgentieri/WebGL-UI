# Spike: HTML-in-Canvas

Issue #8. Question: can an effect distort an element's own pixels (the text itself bleeding like ink) instead of drawing a cover over it, without losing what makes the element native? Live page: `playground/spikes/html-in-canvas.html`.

## The API, as of November 2026

| | Chromium 147–156, behind the `CanvasDrawElement` flag | Chrome 157+ |
| --- | --- | --- |
| Opt-in on the canvas | `<canvas layoutsubtree>` | `<canvas content="drawable">`, `[drawable]` on each child drawn |
| WebGL upload | `gl.texElementImage2D(target, internalformat, element)` | `gl.texElementSubImage2D(...)` |
| Repaint signal | `paint` event, `canvas.requestPaint()` | same |
| Firefox, Safari | none | none |

The spike feature-detects both shapes and sets both attributes. Only the first shape could be exercised here (Chromium 153 with the flag): the Chrome 157 upload path is written from the published names but **not verified**.

## What was verified

Chromium 153 + flag, headless, SwiftShader; each item is an e2e test (`tests/e2e/spike-html-in-canvas.spec.ts`).

| Check | Result |
| --- | --- |
| Element uploaded as a WebGL texture | yes: the article's text comes back in the canvas pixels |
| Effect on the element's own pixels | yes: at half progress the letters themselves are displaced and darkened along the front |
| Accessibility tree | the children keep their roles and names (link, button, text) |
| Hit testing | clicking the button inside the canvas fires its handler |
| Keyboard | Tab moves into the link inside the canvas; the focus ring is painted (through the `paint` event) |
| Find-in-page | `window.find()` finds text inside the canvas |
| Selection | triple click selects the paragraph inside the canvas |
| Without the API | the article stays plain DOM; no canvas is created |

Not verified: Chrome 157 shapes, context loss (the spike reloads), high-DPI precision, performance, WICG issue #172 (it concerns a WebGL canvas moved into a drawable canvas; here the drawable canvas is the WebGL one).

## What it means for an API

1. **The canvas must be created at runtime, and only where the API exists.** Canvas children are fallback content: a browser that has `<canvas>` but not this API never paints them. Authors cannot write the canvas in their markup.
2. **The canvas becomes the element's only display.** It must draw on every `paint` event, forever, not only while animating. That breaks the current model (one shared canvas, attached only during an animation): each drawable element needs its own canvas and WebGL context, and browsers cap contexts (around sixteen). It can only be an opt-in for a few elements per page.
3. **The element moves.** It becomes a child of the canvas: selectors such as `main > article`, layout (the canvas must be sized to its content, here with a `ResizeObserver`) and margins change. That is visible to the page's CSS and scripts.
4. **The native contract seems to hold** for what was tested: semantics, focus, hit testing, search and selection all stay with the real element.

## Verdict

Promising and worth keeping as a progressive layer, not ready for the core. Proposed shape for a later issue, once Chrome 157 is verified and the API stops moving:

- a separate entry point, e.g. `createDrawableFx(element, { effect })`, Chrome-only, feature-detected;
- the effect receives the element as `uElement` and must draw it exactly at rest (the canvas is the display);
- everywhere else, the existing cover effects (details, swap, image) are the fallback, unchanged.

Re-evaluate when Firefox or WebKit signal an implementation.
