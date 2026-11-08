import { test, expect } from './fixtures'
import { disableWebGL2 } from './helpers'

// Counts every canvas the page creates: one renderer must mean exactly one canvas.
async function countCanvases(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    ;(window as any).__canvases = 0
    const original = document.createElement.bind(document)
    document.createElement = ((tag: string, options?: ElementCreationOptions) => {
      if (String(tag).toLowerCase() === 'canvas') (window as any).__canvases++
      return original(tag, options)
    }) as typeof document.createElement
  })
}

test.describe('home (showcase)', () => {
  test('details and popover share one canvas, the dialog has its own (WebGPU); --p and data-animating follow the animation and are cleaned up', async ({ page }) => {
    await countCanvases(page)
    await page.goto('/')
    await expect(page.locator('#status')).toContainText('Open a row, the dialog or the popover')

    const d = page.locator('details').first()
    await d.locator('summary').click()
    await expect(d).toHaveJSProperty('open', true)
    await expect(d).toHaveAttribute('data-animating', '')
    const mid = await d.evaluate(el => parseFloat(el.style.getPropertyValue('--p')))
    expect(mid).toBeGreaterThanOrEqual(0)
    expect(mid).toBeLessThanOrEqual(1)
    await expect(d).not.toHaveAttribute('data-animating', '', { timeout: 3000 })
    expect(await d.evaluate(el => el.style.getPropertyValue('--p'))).toBe('')

    await page.locator('#open-dialog').click()
    const dlg = page.locator('#home-dialog')
    await expect(dlg).toHaveJSProperty('open', true)
    // liquid glass: viewport layout on its own (WebGPU) renderer; the surface drifts to a stop, then its still
    // frame becomes the ::backdrop image and the canvas goes; the frosting is CSS
    await expect(page.locator('#home-dialog > canvas')).toHaveCount(1)
    await expect(dlg).toHaveAttribute('data-fx-snapshot', '', { timeout: 12000 })
    await expect(page.locator('canvas')).toHaveCount(0)
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('home-dialog')!, '::backdrop').backgroundImage)).toContain('blob:')
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('home-dialog')!, '::backdrop').backdropFilter)).toContain('blur')
    await page.keyboard.press('Escape')
    await expect(dlg).toHaveJSProperty('open', false, { timeout: 4000 })

    await page.getByRole('button', { name: 'Popover' }).click()
    expect(await page.evaluate(() => document.getElementById('home-pop')!.matches(':popover-open'))).toBe(true)
    await page.waitForTimeout(1000)
    await page.locator('#home-pop').getByRole('button', { name: 'Close' }).click()
    await expect.poll(() => page.evaluate(() => document.getElementById('home-pop')!.matches(':popover-open')), { timeout: 3000 }).toBe(false)

    await expect(page.locator('canvas')).toHaveCount(0)
    expect(await page.evaluate(() => (window as any).__canvases)).toBe(2) // one renderer for the page, one (WebGPU) for the dialog
  })

  test('without WebGL2 every element is native', async ({ page }) => {
    await disableWebGL2(page)
    await page.goto('/')
    await expect(page.locator('#status')).toContainText('WebGL2 is not available')
    await page.locator('details').first().locator('summary').click()
    await expect(page.locator('details').first()).toHaveJSProperty('open', true)
    await page.locator('#open-dialog').click()
    await expect(page.locator('#home-dialog')).toHaveJSProperty('open', true)
    await page.keyboard.press('Escape')
    await expect(page.locator('#home-dialog')).toHaveJSProperty('open', false)
    await expect(page.locator('canvas')).toHaveCount(0)
  })

  test('reduced motion: native, no canvas', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await expect(page.locator('#status')).toContainText('Reduced motion')
    await page.locator('details').first().locator('summary').click()
    await expect(page.locator('canvas')).toHaveCount(0)
  })
})
