import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// Issue #8 spike. Chromium builds before 157 need the CanvasDrawElement flag (set on the chromium project in
// playwright.config.ts); builds without the feature, and other engines, skip the "supported" tests.

const supported = (page: Page) => page.evaluate(() => (window as any).__spike.supported as boolean)

async function darkPixels(page: Page) {
  const png = (await page.locator('.spike-canvas').screenshot()).toString('base64')
  return page.evaluate(async b64 => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + b64
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (d[i]! < 90) n++
    return n
  }, png)
}

test.describe('spike: HTML-in-Canvas', () => {
  test('where supported: the article lives in a drawable canvas and is drawn from its own pixels', async ({ page }) => {
    await page.goto('/spikes/html-in-canvas.html')
    test.skip(!(await supported(page)), 'HTML-in-Canvas not available in this browser build')
    await expect(page.locator('canvas.spike-canvas > #sheet')).toHaveCount(1)
    await page.waitForTimeout(200)
    const atRest = await darkPixels(page)
    expect(atRest).toBeGreaterThan(500) // the text is visible: it comes from the element texture
    await page.evaluate(() => (window as any).__spike.setProgress(0))
    expect(await darkPixels(page)).toBeLessThan(atRest / 4) // fully covered: no text
  })

  test('accessibility tree, hit testing and keyboard still reach the children', async ({ page }) => {
    await page.goto('/spikes/html-in-canvas.html')
    test.skip(!(await supported(page)), 'HTML-in-Canvas not available in this browser build')
    await expect(page.getByRole('link', { name: 'link' })).toBeVisible()
    await page.getByRole('button', { name: /Clicked/ }).click()
    await expect(page.locator('#count')).toHaveText('1')
    await page.locator('#play').focus()
    await page.keyboard.press('Tab')
    await expect(page.locator('#inner-link')).toBeFocused()
  })

  test('find-in-page and selection work on the drawn text', async ({ page }) => {
    await page.goto('/spikes/html-in-canvas.html')
    test.skip(!(await supported(page)), 'HTML-in-Canvas not available in this browser build')
    expect(await page.evaluate(() => (window as any).find('select it, search it'))).toBe(true)
    await page.locator('#sheet p').click({ clickCount: 3 })
    expect(await page.evaluate(() => getSelection()!.toString())).toContain('This paragraph is real text')
  })

  test('without the API: plain DOM, no canvas', async ({ browser }) => {
    const page = await browser.newPage()
    await page.addInitScript(() => { delete (HTMLCanvasElement.prototype as any).requestPaint })
    await page.goto('/spikes/html-in-canvas.html')
    expect(await supported(page)).toBe(false)
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect(page.locator('main > #sheet')).toBeVisible()
    await page.close()
  })
})
