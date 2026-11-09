import { createRenderer, createExpiryFx, burnEffect, effectsAllowed, type ExpiryFx } from 'webgl-ui'

const renderer = createRenderer()
const undo = document.getElementById('undo') as HTMLButtonElement
const left = document.getElementById('left')!
const done = document.getElementById('done')!
const announce = document.getElementById('announce')!
const seconds = Number(new URLSearchParams(location.search).get('s')) || 7
let fx: ExpiryFx | null = null

function send() {
  fx?.destroy()
  done.hidden = true
  undo.hidden = false
  left.textContent = String(seconds)
  announce.textContent = `Message sent. You can undo it for ${seconds} seconds.`
  fx = createExpiryFx(undo, {
    renderer,
    seconds,
    onTick: s => { left.textContent = String(s) },
    // Same task as the last frame (the button fully burned): hide it now, so nothing flashes.
    onExpire: () => {
      undo.hidden = true
      done.textContent = 'Sent.'
      done.hidden = false
      announce.textContent = 'Message sent.'
    }
  })
  fx.start()
}

undo.addEventListener('click', () => {
  fx?.cancel()
  undo.hidden = true
  done.textContent = 'Sending undone.'
  done.hidden = false
  announce.textContent = 'Sending undone.'
})
document.getElementById('send')!.addEventListener('click', send)
document.getElementById('more')!.addEventListener('click', () => fx?.extend(5))

renderer.prepare(burnEffect).then(ready => {
  document.getElementById('status')!.textContent = !ready
    ? 'WebGL2 is not available: the timer runs, without fire.'
    : !effectsAllowed()
      ? 'Reduced motion or another accessibility preference: the timer runs, without fire.'
      : 'Hover or focus the button to stop the clock.'
  send()
})

Object.assign(window, { __webglUi: { ready: () => renderer.prepare(burnEffect), fx: () => fx, renderer, burnEffect } })
