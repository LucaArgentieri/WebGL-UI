import { test, expect } from '@playwright/test'
import { disableWebGL2, isReady, runStress } from './helpers'

test.describe('tsl backend', () => {
  test('the TSL effect initializes (WebGPU or its WebGL2 fallback)', async ({ page }) => {
    await page.goto('/tsl.html')
    expect(await isReady(page)).toBe(true)
  })

  test('three.js is only requested by the TSL page', async ({ page }) => {
    const chunks: string[] = []
    page.on('request', r => { if (/three/.test(r.url())) chunks.push(r.url()) })
    await page.goto('/details.html')
    await isReady(page)
    expect(chunks).toEqual([])
  })

  test('the effect is really drawn: pixels are written with the expected uv orientation', async ({ page }) => {
    await page.goto('/tsl.html')
    await isReady(page)
    expect(await page.evaluate(() => (window as any).__webglUi.probe())).toBe(true)
    await page.waitForTimeout(300)
    // A screenshot reads the composited result, which a canvas readback of a WebGL canvas cannot do reliably.
    const png = (await page.locator('#probe-host').screenshot()).toString('base64')
    const px = await page.evaluate(async b64 => {
      const img = new Image()
      img.src = 'data:image/png;base64,' + b64
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const at = (fx: number, fy: number) => [...ctx.getImageData(Math.floor(fx * (c.width - 1)), Math.floor(fy * (c.height - 1)), 1, 1).data]
      return [at(0.1, 0.1), at(0.9, 0.1), at(0.1, 0.9), at(0.9, 0.9)]
    }, png)
    const [tl, tr, bl, br] = px as [number[], number[], number[], number[]]
    // red = uv.x grows to the right, green = uv.y grows downwards (origin at the top left); fully opaque
    expect(tl[0]!).toBeLessThan(80); expect(tr[0]!).toBeGreaterThan(170)
    expect(tl[1]!).toBeLessThan(80); expect(bl[1]!).toBeGreaterThan(170)
    for (const p of [tl, tr, bl, br]) { expect(p[2]!).toBeLessThan(10); expect(p[3]!).toBe(255) }
  })

  test('output is premultiplied alpha: 50% red over white reads as (255, 128, 128)', async ({ page }) => {
    await page.goto('/tsl.html')
    await isReady(page)
    expect(await page.evaluate(() => (window as any).__webglUi.probe('half'))).toBe(true)
    await page.waitForTimeout(300)
    const png = (await page.locator('#probe-host').screenshot()).toString('base64')
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
    expect(px[0]!).toBeGreaterThan(245)
    expect(Math.abs(px[1]! - 128)).toBeLessThan(8)
    expect(Math.abs(px[2]! - 128)).toBeLessThan(8)
  })

  test('details animate with the TSL effect, open at once, canvas gone afterwards', async ({ page }) => {
    await page.goto('/tsl.html')
    await isReady(page)
    const d = page.locator('#d1')
    await d.locator('summary').click()
    await expect(d).toHaveJSProperty('open', true)
    await expect(page.locator('details canvas')).toHaveCount(1)
    await expect(page.locator('details canvas')).toHaveCount(0, { timeout: 3000 })
    await d.locator('summary').click()
    await expect(d).toHaveJSProperty('open', false, { timeout: 3000 })
  })

  test('without WebGL2: native behavior', async ({ page }) => {
    await disableWebGL2(page)
    await page.goto('/tsl.html')
    expect(await isReady(page)).toBe(false)
    await page.locator('#d1 summary').click()
    await expect(page.locator('#d1')).toHaveJSProperty('open', true)
    await expect(page.locator('canvas')).toHaveCount(0)
  })

  for (let i = 1; i <= 2; i++) {
    test(`stress test, run ${i}`, async ({ page }) => {
      await page.goto('/tsl.html')
      await isReady(page)
      const r = await runStress(page)
      expect(r.problems, `${r.snapshot}\n${r.tail}`).toEqual([])
    })
  }
})
