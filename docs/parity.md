# Native parity

Goal: indistinguishable from the native element for keyboard, assistive technology, scripts and find-in-page. WebGL only changes how it looks.

Source of truth: the MDN pages of each element (attributes, DOM interface, events, accessibility notes, browser compatibility). The links below are written from memory: check them and the compatibility tables when working on each element.

## Checklist (every element)

- Native events fire in the same order and with the same meaning.
- Attributes and properties are consistent with the logical state.
- Keyboard: Enter, Space, Esc, Tab, Shift+Tab, repeated keys.
- Focus enters and returns where the native element would put it.
- Screen readers: no content lives only in the canvas; the canvas is `aria-hidden`.
- Find-in-page, print, RTL, zoom, resize mid-animation.
- Native fallback (no canvas, no interception) under `prefers-reduced-motion: reduce`, `forced-colors: active`, `prefers-contrast: more` and `prefers-reduced-transparency: reduce` (`effectsAllowed()`), tested with emulation.
- Animations never last more than 5 s (`MAX_DURATION`, WCAG 2.2.2); effects must not flash more than three times per second (WCAG 2.3.1).
- Tabbing during an animation never lands on the canvas.
- Every unavoidable difference is documented below.
- The stress test passes.

## `<details>` (MDN: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/details)

| Feature | Status |
| --- | --- |
| `open` attribute / property | native; written only by `settle()` |
| Enter / Space on `<summary>` | native click, intercepted to animate |
| `toggle` event | native, fires when `open` changes (at the start of opening, at the end of closing) |
| `name` (exclusive accordion) | opening one closes the others natively and instantly (the invariant "at most one open" always holds); the closed one collapses with a plain height animation instead of jumping. A details closed this way while it was still animating gives its animation up |
| Find-in-page opening a closed details | native, no animation |
| Reduced motion / no WebGL | pure native |

Documented differences: while closing, `open` stays `true` until the animation ends, so assistive technology announces it expanded for that time.

While animating, `<details>`, `<dialog>` and popovers get `[data-animating]` and `--p` (0..1, the same progress the shader uses), and both are removed at the end. CSS can follow it for opacity, blur and the like (the showcase does). They are decoration hooks: nothing native depends on them.

The cover an effect draws on `<details>` and popovers is the surface color unless the page sets the custom property `--fx-cover: r, g, b` (0..255) on the element. A dark cover makes the element's own box appear from the effect instead of showing it complete first; fade the box in with `--p` (the showcase does).

## `<dialog>` (MDN: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog)

| Feature | Status |
| --- | --- |
| `showModal()` | native call, synchronous (same errors); animation starts after |
| `close(returnValue)` | animated; the native `close()` runs at the end |
| `show()` (non-modal) | not wrapped |
| `commandfor` + `command="show-modal"` / `"close"` | cancelable `command` event intercepted and animated; `close` uses the button's `value` as `returnValue`. `request-close` stays native and goes through `cancel` (animated) |
| `requestClose()` | goes through `cancel`, covered by a test where supported |
| `cancel` event (Esc, light dismiss) | intercepted to animate; an earlier `preventDefault` wins |
| `close` event, `returnValue` | native; delivered at the end of the closing animation |
| `<form method="dialog">` | `submit` intercepted; `returnValue` = submitter value |
| `closedby` | native, not reimplemented |
| Top layer, `inert`, focus trap, initial focus | native, started synchronously by `showModal()` |
| Focus restore | native, at the end of the closing animation |
| `::backdrop` | transparent while animating; CSS takes over at the end |

Documented differences:

- While closing, `open` stays `true` and `close` / focus restore arrive when the animation ends.
- A non-cancelable `cancel` (browser anti-abuse for repeated Esc without user activation) closes the dialog immediately, without animation.
- The canvas is inserted inside the `<dialog>` during the animation.
- `layout: 'host'` paints the effect over the dialog box instead of the backdrop, and `layout: 'behind'` paints the panel's sheet behind its content, so the dialog appears from nothing; in both, the backdrop is plain CSS that fades in with `--p` (`dialog.css`, `[data-fx-host]`, `[data-fx-behind]`).

## `popover` (MDN: https://developer.mozilla.org/en-US/docs/Web/API/Popover_API)

| Feature | Status |
| --- | --- |
| `showPopover()` | native call, synchronous (same errors); animation starts after |
| `hidePopover()` | animated; the native `hidePopover()` runs at the end |
| `togglePopover(force)` | wrapped; returns the logical state (where it is heading) |
| `commandfor` + `command` (`show-popover`, `hide-popover`, `toggle-popover`) | cancelable `command` event intercepted and routed to the wrapped methods; an earlier `preventDefault` wins |
| `popover="hint"` | wrapped like the other values; opening an auto popover closes hints natively (instant) |
| `popovertarget` / `popovertargetaction` buttons | click intercepted (the browser runs an internal algorithm, not the JS methods) and routed to the wrapped methods |
| `popover="auto"` light dismiss, Esc | native, instant (see differences) |
| `popover="manual"` | no light dismiss, closes only through the button or a script |
| `toggle` event | native; closing fires it at the end of the animation |
| Top layer, focus handling | native, started synchronously by `showPopover()` |
| Reduced motion / no WebGL | pure native |

Documented differences:

- Closes the browser does by itself (Esc, light dismiss, another auto popover opening) are instant: they cannot be cancelled, so they are not animated.
- While closing through the button or a script, the popover stays open (`:popover-open`) until the animation ends.
- The canvas is inserted inside the popover during the animation.

## `<img>` / `<picture>` (MDN: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img)

| Feature | Status |
| --- | --- |
| `alt`, `srcset`, `sizes`, `loading`, `decoding` | native, untouched |
| `load` / `decode()` | the reveal starts after `decode()` resolves; the first frame (full cover) is drawn before the image is shown |
| Layout, intrinsic size, `object-fit` | native; the effect samples the image with the same `cover` / `contain` fit (centered) |
| Cross-origin without CORS | cannot be sampled: plain cover effect (`uHasImage = 0`), never an error |
| `error` | the image is shown natively (no pending state left) |
| Reduced motion and other preferences / no WebGL | native load, never hidden |

Documented differences: while loading, a watched image's stage carries `[data-fx-pending]`; the recommended CSS hides the image with `opacity` only, so it stays in the accessibility tree. `object-position` other than center is not reproduced in the sampled image.

## `<progress>` / `<meter>` (MDN: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/progress, https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meter)

| Feature | Status |
| --- | --- |
| `value`, `max`, `min` (reflected attributes, set by markup or script) | native; changes are observed and the paint follows |
| Role and value announced by assistive technology | native, updated at once |
| Indeterminate progress (`value` absent) | native, browser animation |
| `low`, `high`, `optimum` (meter) | native meaning kept; the contract paints one fill color |
| `dir="rtl"` | fills from the right |
| Forced colors | system bar (`appearance: auto`), effect off |
| Reduced motion and other preferences / no WebGL | native bar, never hidden |

Documented differences: the CSS contract (`progress.css`) replaces the platform look of the bar with a flat track and fill, so that the effect's last frame and the native bar match exactly.

## Content swaps (`createSwapFx`)

Not an element: a helper around a DOM update you make. Its contract is about what it must not break.

| Feature | Status |
| --- | --- |
| The DOM update | yours, applied at once under the cover; nothing cloned or faked |
| Focus | if it was inside the region and the update removed it, it moves to the region (`tabindex="-1"`) |
| Announcements | the author's (`aria-live` on the region, or a status message) |
| `document.startViewTransition` | opt-in (`viewTransition: true`); the region gets a temporary `view-transition-name` |
| A failing update | the region is uncovered and left as it was |
| Reduced motion and other preferences / no WebGL | the update runs immediately; focus still handled |
