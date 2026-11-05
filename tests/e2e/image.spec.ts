import { test, expect } from './fixtures'
import { disableWebGL2, isReady } from './helpers'
import type { Page } from '@playwright/test'

async function centerPixel(page: Page, selector: string) {
  const png = (await page.locator(selector).screenshot()).toString('base64')
  return page.evaluate(async b64 => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + b64
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    // a point on the black disc's red center in the plate
    return [...ctx.getImageData(Math.round(c.width * 0.66), Math.round(c.height * 0.5), 1, 1).data]
  }, png)
}

test.describe('image', () => {
  test('reveal on load: pending until the cover is drawn, then the canvas, then nothing left', async ({ page }) => {
    await page.goto('/image.html')
    await isReady(page)
    const stage = page.locator('#stage1')
    await expect(stage).toHaveAttribute('data-fx-pending', '')
    await page.locator('#load').click()
    await expect(stage.locator('canvas')).toHaveCount(1)
    await expect(stage).not.toHaveAttribute('data-fx-pending', '')
    await expect(stage.locator('canvas')).toHaveCount(0, { timeout: 4000 })
    await expect(stage).not.toHaveAttribute('style', /position/)
    await expect(page.locator('#img1')).toHaveAttribute('alt', /Plate No\. 1/)
  })

  test('the effect samples the real image (object-fit: cover included)', async ({ page }) => {
    await page.goto('/image.html')
    await isReady(page)
    const native = await centerPixel(page, '#stage2')
    await page.evaluate(() => (window as any).__webglUi.probe('stage2', 'img2'))
    await page.waitForTimeout(250)
    const sampled = await centerPixel(page, '#stage2')
    expect(sampled[0]).toBeGreaterThan(120) // not the "could not sample" red-only answer…
    for (let i = 0; i < 3; i++) expect(Math.abs(sampled[i]! - native[i]!), `${sampled} vs ${native}`).toBeLessThan(28)
  })

  test('replay: a loaded image can be revealed again and ends unchanged', async ({ page }) => {
    await page.goto('/image.html')
    await isReady(page)
    await page.locator('#replay').click()
    await expect(page.locator('#stage2 canvas')).toHaveCount(1)
    await expect(page.locator('#stage2 canvas')).toHaveCount(0, { timeout: 4000 })
  })

  test('without WebGL2: the image loads natively, never hidden', async ({ page }) => {
    await disableWebGL2(page)
    await page.goto('/image.html')
    await page.locator('#load').click()
    await expect(page.locator('#img1')).toHaveJSProperty('complete', true)
    await expect(page.locator('#stage1')).not.toHaveAttribute('data-fx-pending', '', { timeout: 3000 })
    await expect(page.locator('canvas')).toHaveCount(0)
  })

  test('reduced motion: never pending, no canvas', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/image.html')
    await expect(page.locator('#stage1')).not.toHaveAttribute('data-fx-pending', '')
    await page.locator('#load').click()
    await expect(page.locator('canvas')).toHaveCount(0)
  })
})
