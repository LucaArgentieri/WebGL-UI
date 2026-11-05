import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// Pixel probes for the built-in GLSL effects: hold an effect at a fixed progress on a white box and read the
// composited result from a screenshot (a WebGL canvas cannot be read back reliably after compositing).
async function probe(page: Page, effect: string, progress: number, color: [number, number, number], alpha = 1) {
  await page.evaluate(({ effect, progress, color, alpha }) => {
    const { renderer, effects } = (window as any).__docs
    const host = document.createElement('div')
    host.id = 'probe'
    host.style.cssText = 'position:fixed;left:0;top:0;width:240px;height:160px;z-index:10;background:#fff'
    document.body.append(host)
    return renderer.prepare(effects[effect]).then(() => {
      void renderer.play(host, { effect: effects[effect], from: progress, to: progress, duration: 3000, color, alpha })
    })
  }, { effect, progress, color, alpha })
  await page.waitForTimeout(250)
  const png = (await page.locator('#probe').screenshot()).toString('base64')
  const px = await page.evaluate(async b64 => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + b64
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    return [...ctx.getImageData(c.width >> 1, c.height >> 1, 1, 1).data]
  }, png)
  await page.evaluate(() => { (window as any).__docs.renderer.cancel(); document.getElementById('probe')?.remove() })
  return px
}

const near = (a: number[], b: number[], tol = 14) => a.slice(0, 3).every((v, i) => Math.abs(v - b[i]!) <= tol)

test.describe('effects draw what they promise', () => {
  for (const effect of ['ink', 'dissolve', 'wipe', 'blinds']) {
    test(`${effect}: fully covered at progress 0, fully transparent at progress 1`, async ({ page }) => {
      await page.goto('/docs/effects.html')
      const covered = await probe(page, effect, 0, [1, 0, 0]) // red cover over a white box
      expect(near(covered, [255, 0, 0], 40), `covered: ${covered}`).toBe(true)
      const revealed = await probe(page, effect, 1, [1, 0, 0])
      expect(near(revealed, [255, 255, 255]), `revealed: ${revealed}`).toBe(true)
    })
  }

  for (const effect of ['ink-veil', 'backdrop']) {
    test(`${effect}: ends on the uniform CSS backdrop (color × alpha), so the hand-over is invisible`, async ({ page }) => {
      await page.goto('/docs/effects.html')
      const end = await probe(page, effect, 1, [0, 0, 0], 0.5) // 50% black over white
      expect(near(end, [128, 128, 128]), `end: ${end}`).toBe(true)
      const start = await probe(page, effect, 0, [0, 0, 0], 0.5)
      expect(near(start, [255, 255, 255]), `start: ${start}`).toBe(true)
    })
  }
})
