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
  test('details, dialog and popover share one canvas; --p and data-animating follow the animation and are cleaned up', async ({ page }) => {
    await countCanvases(page)
    await page.goto('/')
    await expect(page.locator('#status')).toContainText('One renderer, two effects')

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
    await expect(page.locator('#home-dialog')).toHaveJSProperty('open', true)
    await page.waitForTimeout(1000)
    await page.keyboard.press('Escape')
    await expect(page.locator('#home-dialog')).toHaveJSProperty('open', false, { timeout: 3000 })

    await page.getByRole('button', { name: 'Popover' }).click()
    expect(await page.evaluate(() => document.getElementById('home-pop')!.matches(':popover-open'))).toBe(true)
    await page.waitForTimeout(1000)
    await page.locator('#home-pop').getByRole('button', { name: 'Close' }).click()
    await expect.poll(() => page.evaluate(() => document.getElementById('home-pop')!.matches(':popover-open')), { timeout: 3000 }).toBe(false)

    await expect(page.locator('canvas')).toHaveCount(0)
    expect(await page.evaluate(() => (window as any).__canvases)).toBe(1)
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

  test('reduced motion: native, no canvas, no pointer RGB split', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await expect(page.locator('#status')).toContainText('Reduced motion')
    await page.mouse.move(900, 300)
    await page.waitForTimeout(100)
    expect(await page.locator('.rgb').evaluate(el => el.style.getPropertyValue('--sx'))).toBe('')
    await page.locator('details').first().locator('summary').click()
    await expect(page.locator('canvas')).toHaveCount(0)
  })
})
