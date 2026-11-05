import { createRenderer, createImageFx, defineGlslEffect, inkImageEffect, effectsAllowed } from 'webgl-ui'

const renderer = createRenderer()
const img1 = document.getElementById('img1') as HTMLImageElement
const img2 = document.getElementById('img2') as HTMLImageElement
const fx1 = createImageFx(img1, { renderer })
const fx2 = createImageFx(img2, { renderer })

document.getElementById('load')!.addEventListener('click', () => { img1.src = './plate.svg' })
document.getElementById('replay')!.addEventListener('click', () => { void fx2.reveal() })

// Test probe: draws the sampled image as is (red if it could not be sampled).
const probeEffect = defineGlslEffect('image-probe', `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform sampler2D uImage;
uniform vec2 uImageScale;
uniform float uHasImage;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 c = uHasImage > 0.5 ? texture(uImage, (uv - 0.5) * uImageScale + 0.5).rgb : vec3(1.0, 0.0, 0.0);
  outColor = vec4(c, 1.0);
}`)

const reduced = !effectsAllowed()
renderer.prepare(inkImageEffect).then(ready => {
  document.getElementById('status')!.textContent = !ready
    ? 'WebGL2 is not available: the images load natively.'
    : reduced
      ? 'Reduced motion or another accessibility preference: the images load natively.'
      : 'Load the plate, or replay the reveal on the second one.'
})

Object.assign(window, {
  __webglUi: {
    ready: () => renderer.prepare(inkImageEffect),
    fx: [fx1, fx2],
    /** Holds the probe on a stage so a screenshot can compare it with the image. */
    async probe(stageId: string, imgId: string) {
      await renderer.prepare(probeEffect)
      const img = document.getElementById(imgId) as HTMLImageElement
      const stage = document.getElementById(stageId)!
      stage.style.position = 'relative'
      const r = img.getBoundingClientRect()
      const nw = img.naturalWidth, nh = img.naturalHeight, ba = r.width / r.height, ia = nw / nh
      const scale: [number, number] = getComputedStyle(img).objectFit === 'cover' ? (ia > ba ? [ba / ia, 1] : [1, ia / ba]) : [1, 1]
      void renderer.play(stage, { effect: probeEffect, from: 1, to: 1, duration: 2500, color: [1, 1, 1], image: img, imageScale: scale })
    }
  }
})
