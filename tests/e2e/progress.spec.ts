import { test, expect } from './fixtures'
import { disableWebGL2, isReady } from './helpers'
import type { Page } from '@playwright/test'

const stageOf = (page: Page, id: string) => page.locator(`#${id}`).locator('xpath=..')

// Reads a row of pixels across the middle of a stage (from a screenshot of the composited page).
async function row(page: Page, id: string, xs: number[]) {
  const png = (await stageOf(page, id).screenshot()).toString('base64')
  return page.evaluate(async ({ b64, xs }) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + b64
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    return xs.map(x => [...ctx.getImageData(Math.round(x * (c.width - 1)), c.height >> 1, 1, 1).data].slice(0, 3))
  }, { b64: png, xs })
}

test.describe('progress and meter', () => {
  test('a value change is animated: canvas over a transparent native bar, then the native bar alone', async ({ page }) => {
    await page.goto('/progress.html')
    await isReady(page)
    await page.locator('#plus').click()
    await expect(page.locator('#pr')).toHaveJSProperty('value', 45) // native value at once
    await expect(stageOf(page, 'pr').locator('canvas')).toHaveCount(1)
    expect(await page.locator('#pr').evaluate(el => getComputedStyle(el).opacity)).toBe('0')
    await expect(stageOf(page, 'pr').locator('canvas')).toHaveCount(0, { timeout: 3000 })
    expect(await page.locator('#pr').evaluate(el => getComputedStyle(el).opacity)).toBe('1')
    await expect(stageOf(page, 'pr')).not.toHaveAttribute('data-animating', '')
  })

  test('the last frame of the effect and the native bar are the same picture', async ({ page }) => {
    await page.goto('/progress.html')
    await isReady(page)
    const xs = [0.05, 0.3, 0.6, 0.95]
    const native = await row(page, 'mt', xs) // meter at 0.4
    // hold the effect at its end, at the same value, over the transparent native bar
    await page.evaluate(() => {
      const { renderer } = (window as any).__webglUi
      const mt = document.getElementById('mt')!
      const stage = mt.parentElement!
      stage.setAttribute('data-animating', '')
      const color = getComputedStyle(stage).color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => v / 255)
      void renderer.play(stage, { effect: (window as any).__inkBar, from: 1, to: 1, duration: 2500, color, params: { uValue: [0.4, 0.4], uRtl: 0 } })
    })
    await page.waitForTimeout(250)
    const painted = await row(page, 'mt', xs)
    for (let i = 0; i < xs.length; i++) {
      for (let k = 0; k < 3; k++) expect(Math.abs(painted[i]![k]! - native[i]![k]!), `x=${xs[i]}: ${painted[i]} vs ${native[i]}`).toBeLessThan(12)
    }
  })

  test('twenty quick updates: the bar ends on the last value, nothing left behind', async ({ page }) => {
    await page.goto('/progress.html')
    await isReady(page)
    await page.locator('#burst').click()
    await page.waitForTimeout(2500)
    const d = await page.evaluate(() => (window as any).__webglUi.fxs[0].debug())
    expect(d.running).toBe(false)
    expect(Math.abs(d.shown - d.value)).toBeLessThan(0.001)
    await expect(page.locator('canvas')).toHaveCount(0)
  })

  test('indeterminate stays native', async ({ page }) => {
    await page.goto('/progress.html')
    await isReady(page)
    await page.locator('#indeterminate').click()
    await page.waitForTimeout(100)
    await expect(page.locator('canvas')).toHaveCount(0)
    expect(await page.locator('#pr').evaluate(el => (el as HTMLProgressElement).position)).toBe(-1)
  })

  test('meter and right-to-left progress animate too', async ({ page }) => {
    await page.goto('/progress.html')
    await isReady(page)
    await page.locator('#meter-up').click()
    await expect(stageOf(page, 'mt').locator('canvas')).toHaveCount(1)
    await expect(page.locator('canvas')).toHaveCount(0, { timeout: 3000 })
    await page.locator('#rtl-plus').click()
    await expect(stageOf(page, 'pr-rtl').locator('canvas')).toHaveCount(1)
    await expect(page.locator('canvas')).toHaveCount(0, { timeout: 3000 })
  })

  test("without WebGL2: native bars, never hidden", async ({ page }) => {
    await disableWebGL2(page)
    await page.goto('/progress.html')
    await page.locator('#plus').click()
    await expect(page.locator('canvas')).toHaveCount(0)
    expect(await page.locator('#pr').evaluate(el => getComputedStyle(el).opacity)).toBe('1')
  })

  test('forced colors: native bars', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' })
    await page.goto('/progress.html')
    await page.locator('#plus').click()
    await expect(page.locator('canvas')).toHaveCount(0)
  })
})
