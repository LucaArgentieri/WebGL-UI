# Native parity

Goal: indistinguishable from the native element for keyboard, assistive technology, scripts and find-in-page. WebGL only changes how it looks.

Source of truth: the MDN pages of each element (attributes, DOM interface, events, accessibility notes, browser compatibility). The links below are written from memory: check them and the compatibility tables when working on each element.

## Checklist (every element)

- Native events fire in the same order and with the same meaning.
- Attributes and properties are consistent with the logical state.
- Keyboard: Enter, Space, Esc, Tab, Shift+Tab, repeated keys.
- Focus enters and returns where the native element would put it.
- Screen readers: no content lives only in the canvas; the canvas is `aria-hidden`.
- Find-in-page, print, forced-colors, `prefers-reduced-motion`, RTL, zoom, resize mid-animation.
- Every unavoidable difference is documented below.
- The stress test passes.

## `<details>` (MDN: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/details)

| Feature | Status |
| --- | --- |
| `open` attribute / property | native; written only by `settle()` |
| Enter / Space on `<summary>` | native click, intercepted to animate |
| `toggle` event | native, fires when `open` changes (at the start of opening, at the end of closing) |
| `name` (exclusive accordion) | opening one closes the others natively and instantly |
| Find-in-page opening a closed details | native, no animation |
| Reduced motion / no WebGL | pure native |

Documented differences: while closing, `open` stays `true` until the animation ends, so assistive technology announces it expanded for that time.

While animating, `<details>`, `<dialog>` and popovers get `[data-animating]` and `--p` (0..1, the same progress the shader uses), and both are removed at the end. CSS can follow it for opacity, blur and the like (the showcase does). They are decoration hooks: nothing native depends on them.

## `<dialog>` (MDN: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog)

| Feature | Status |
| --- | --- |
| `showModal()` | native call, synchronous (same errors); animation starts after |
| `close(returnValue)` | animated; the native `close()` runs at the end |
| `show()` (non-modal) | not wrapped |
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

## `popover` (MDN: https://developer.mozilla.org/en-US/docs/Web/API/Popover_API)

| Feature | Status |
| --- | --- |
| `showPopover()` | native call, synchronous (same errors); animation starts after |
| `hidePopover()` | animated; the native `hidePopover()` runs at the end |
| `togglePopover(force)` | wrapped; returns the logical state (where it is heading) |
| `popovertarget` / `popovertargetaction` buttons | click intercepted (the browser runs an internal algorithm, not the JS methods) and routed to the wrapped methods |
| `popover="auto"` light dismiss, Esc | native, instant (see differences) |
| `popover="manual"` | no light dismiss, closes only through the button or a script |
| `toggle` event | native; closing fires it at the end of the animation |
| Top layer, focus handling | native, started synchronously by `showPopover()` |
| Reduced motion / no WebGL | pure native |

Documented differences:

- Closes the browser does by itself (Esc, light dismiss, another auto popover opening) are instant: they cannot be cancelled, so they are not animated.
- While closing through the button or a script, the popover stays open (`:popover-open`) until the animation ends.
- `invoketarget` / `commandfor` invokers are not intercepted yet; they work natively without animation on close.
- The canvas is inserted inside the popover during the animation.
