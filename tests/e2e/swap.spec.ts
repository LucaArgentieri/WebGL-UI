import { test, expect } from './fixtures'
import { disableWebGL2, isReady } from './helpers'

test.describe('swap', () => {
  test('covers, swaps the DOM underneath, reveals; height follows; nothing left behind', async ({ page }) => {
    await page.goto('/swap.html')
    await isReady(page)
    const region = page.locator('#region')
    const h0 = await region.evaluate(el => (el as HTMLElement).offsetHeight)
    const done = page.evaluate(() => (window as any).__webglUi.next(0))
    await expect(region.locator('canvas')).toHaveCount(1)
    await expect(region.locator('.swap-title')).toHaveText('Page 1') // still the old content while covering
    await done
    await expect(region.locator('.swap-title')).toHaveText('Page 2')
    await expect(region.locator('canvas')).toHaveCount(0)
    expect(await region.evaluate(el => (el as HTMLElement).offsetHeight)).toBeGreaterThan(h0) // page 2 has two quotes
    await expect(region).not.toHaveAttribute('style', /\S/)
    await expect(region).not.toHaveAttribute('data-animating', '')
  })

  test('focus on the removed button lands on the new content, not on the body', async ({ page }) => {
    await page.goto('/swap.html')
    await isReady(page)
    await page.locator('#region [data-next]').focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#region .swap-title')).toHaveText('Page 2', { timeout: 4000 })
    await expect(page.locator('#region')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.locator('#region [data-next]')).toBeFocused() // the next stop is inside the new content
  })

  test('rapid swaps are queued and end on the last page', async ({ page }) => {
    await page.goto('/swap.html')
    await isReady(page)
    await page.evaluate(() => Promise.all([0, 0, 0].map(i => (window as any).__webglUi.next(i))))
    await expect(page.locator('#region .swap-title')).toHaveText('Page 4')
    await expect(page.locator('canvas')).toHaveCount(0)
  })

  test('with a view transition', async ({ page }) => {
    await page.goto('/swap.html')
    await isReady(page)
    test.skip(!(await page.evaluate(() => 'startViewTransition' in document)), 'no view transitions')
    await page.evaluate(() => (window as any).__webglUi.next(1))
    await expect(page.locator('#region-vt .swap-title')).toHaveText('Page 2')
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect.poll(() => page.locator("#region-vt").evaluate(el => (el as HTMLElement).style.getPropertyValue('view-transition-name'))).toBe('')
  })

  test('a failing update uncovers the region and leaves nothing behind', async ({ page }) => {
    await page.goto('/swap.html')
    await isReady(page)
    await page.evaluate(() => (window as any).__webglUi.fail())
    await expect(page.locator('canvas')).toHaveCount(0, { timeout: 2000 })
    await expect(page.locator('#region')).not.toHaveAttribute('data-animating', '')
    await expect(page.locator('#region .swap-title')).toHaveText('Page 1')
  })

  test('without WebGL2 and with reduced motion: the swap is immediate', async ({ page }) => {
    await disableWebGL2(page)
    await page.goto('/swap.html')
    await page.evaluate(() => (window as any).__webglUi.next(0))
    await expect(page.locator('#region .swap-title')).toHaveText('Page 2')
    await expect(page.locator('canvas')).toHaveCount(0)
  })
})
