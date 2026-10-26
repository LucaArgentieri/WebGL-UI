import { test, expect } from './fixtures'
import { disableWebGL2, runStress } from './helpers'

const readyAll = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as any).__webglUi.ready() as Promise<boolean[]>)

// Counts every canvas created by the page: one renderer must mean exactly one canvas (one WebGL context).
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

test.describe('mixed: one renderer, several elements and effects', () => {
  test('all three effects are ready on one renderer', async ({ page }) => {
    await page.goto('/mixed.html')
    expect(await readyAll(page)).toEqual([true, true, true])
  })

  test('one canvas for everything, whatever the effects used', async ({ page }) => {
    await countCanvases(page)
    await page.goto('/mixed.html')
    await readyAll(page)
    await page.locator('#m1 summary').click()
    await page.waitForTimeout(1000)
    await page.locator('#m2 summary').click()
    await page.waitForTimeout(1000)
    await page.locator('#open').click()
    await page.waitForTimeout(1000)
    await page.keyboard.press('Escape')
    await expect(page.locator('#mdlg')).toHaveJSProperty('open', false, { timeout: 3000 })
    expect(await page.evaluate(() => (window as any).__canvases)).toBe(1)
  })

  test('two details with different effects animating one after the other both end open', async ({ page }) => {
    await page.goto('/mixed.html')
    await readyAll(page)
    await page.locator('#m1 summary').click()
    await page.waitForTimeout(200)
    await page.locator('#m2 summary').click() // takes the canvas away from m1 mid-animation
    await page.waitForTimeout(1500)
    await expect(page.locator('#m1')).toHaveJSProperty('open', true)
    await expect(page.locator('#m2')).toHaveJSProperty('open', true)
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect(page.locator('#m1')).not.toHaveAttribute('style', /height|overflow/)
  })

  test('opening the dialog while a details animates: both end in the requested state', async ({ page }) => {
    await page.goto('/mixed.html')
    await readyAll(page)
    await page.locator('#m1 summary').click()
    await page.waitForTimeout(150)
    await page.evaluate(() => (document.getElementById('mdlg') as HTMLDialogElement).showModal())
    await page.waitForTimeout(1500)
    await expect(page.locator('#m1')).toHaveJSProperty('open', true)
    await expect(page.locator('#mdlg')).toHaveJSProperty('open', true)
    await expect(page.locator('canvas')).toHaveCount(0)
  })

  test('without WebGL2: every element is native', async ({ page }) => {
    await disableWebGL2(page)
    await page.goto('/mixed.html')
    expect(await readyAll(page)).toEqual([false, false, false])
    await page.locator('#m1 summary').click()
    await expect(page.locator('#m1')).toHaveJSProperty('open', true)
    await page.locator('#open').click()
    await expect(page.locator('#mdlg')).toHaveJSProperty('open', true)
    await page.keyboard.press('Escape')
    await expect(page.locator('#mdlg')).toHaveJSProperty('open', false)
  })

  for (let i = 1; i <= 3; i++) {
    test(`stress test across element types, run ${i}`, async ({ page }) => {
      await countCanvases(page)
      await page.goto('/mixed.html')
      await readyAll(page)
      const r = await runStress(page)
      expect(r.problems, `${r.snapshot}\n${r.tail}`).toEqual([])
      expect(await page.evaluate(() => (window as any).__canvases)).toBe(1)
    })
  }
})
