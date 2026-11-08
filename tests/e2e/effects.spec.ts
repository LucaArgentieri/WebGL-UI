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

test.describe('halftone backdrop', () => {
  test('transparent at 0; at 1 a veil with a screen of dots (not uniform), so it needs keepBackdrop', async ({ page }) => {
    await page.goto('/docs/effects.html')
    const start = await probe(page, 'halftone', 0, [1, 1, 1], 0.9)
    expect(near(start, [255, 255, 255]), `start: ${start}`).toBe(true)
    // sample a row across the box at the end: dots make it vary, the veil keeps it light
    const row = await page.evaluate(async () => {
      const { renderer, effects } = (window as any).__docs
      const host = document.createElement('div')
      host.id = 'probe2'
      host.style.cssText = 'position:fixed;left:0;top:0;width:480px;height:320px;z-index:10;background:#fff'
      document.body.append(host)
      await renderer.prepare(effects.halftone)
      void renderer.play(host, { effect: effects.halftone, from: 1, to: 1, duration: 3000, color: [1, 1, 1], alpha: 0.9, scale: 1 })
      return true
    })
    expect(row).toBe(true)
    await page.waitForTimeout(250)
    const png = (await page.locator('#probe2').screenshot()).toString('base64')
    const stats = await page.evaluate(async b64 => {
      const img = new Image()
      img.src = 'data:image/png;base64,' + b64
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const d = ctx.getImageData(0, 0, c.width, c.height).data
      let min = 255, max = 0
      for (let i = 0; i < d.length; i += 4) { min = Math.min(min, d[i]!); max = Math.max(max, d[i]!) }
      return { min, max }
    }, png)
    expect(stats.max - stats.min, JSON.stringify(stats)).toBeGreaterThan(40) // ink dots on a light veil
    expect(stats.max, JSON.stringify(stats)).toBeGreaterThan(220)
  })
})

test.describe('glass', () => {
  test('only light while the glass forms: transparent at 0 and at 1, light in between', async ({ page }) => {
    await page.goto('/docs/effects.html')
    expect(near(await probe(page, 'glass', 0, [1, 1, 1]), [255, 255, 255])).toBe(true)
    expect(near(await probe(page, 'glass', 1, [1, 1, 1]), [255, 255, 255])).toBe(true)
    // mid-way, the box must not be painted over: the centre stays (nearly) what is behind
    const mid = await probe(page, 'glass', 0.5, [1, 1, 1])
    expect(mid.slice(0, 3).every(v => v > 200), `mid: ${mid}`).toBe(true)
  })
})

test.describe('liquid glass (GLSL twin)', () => {
  test('transparent at 0; at 1 a visible glass pane (shading and highlights), not a flat veil', async ({ page }) => {
    await page.goto('/docs/effects.html')
    expect(near(await probe(page, 'liquid-glass', 0, [1, 1, 1], 0.12), [255, 255, 255])).toBe(true)
    await page.evaluate(async () => {
      const { renderer, effects } = (window as any).__docs
      const host = document.createElement('div')
      host.id = 'probe3'
      host.style.cssText = 'position:fixed;left:0;top:0;width:480px;height:320px;z-index:10;background:#808080'
      document.body.append(host)
      await renderer.prepare(effects['liquid-glass'])
      void renderer.play(host, { effect: effects['liquid-glass'], from: 1, to: 1, duration: 3000, color: [1, 1, 1], alpha: 0.12, scale: 1, params: { uDrift: 3 } })
    })
    await page.waitForTimeout(250)
    const png = (await page.locator('#probe3').screenshot()).toString('base64')
    const range = await page.evaluate(async b64 => {
      const img = new Image()
      img.src = 'data:image/png;base64,' + b64
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const d = ctx.getImageData(40, 40, c.width - 80, c.height - 80).data // inside the rim
      let min = 255, max = 0
      for (let i = 0; i < d.length; i += 4) { min = Math.min(min, d[i + 1]!); max = Math.max(max, d[i + 1]!) }
      return max - min
    }, png)
    expect(range).toBeGreaterThan(25)
  })
})
