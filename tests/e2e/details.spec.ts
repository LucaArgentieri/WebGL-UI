import { test, expect } from '@playwright/test'
import { disableWebGL2, isReady, runStress } from './helpers'

test.describe('details', () => {
  test('WebGL2 is available in this environment', async ({ page }) => {
    await page.goto('/details.html')
    expect(await isReady(page)).toBe(true)
  })

  test('opens at once and closes after the animation, like the native one from the outside', async ({ page }) => {
    await page.goto('/details.html')
    await isReady(page)
    const d = page.locator('#d1')
    await d.locator('summary').click()
    await expect(d).toHaveJSProperty('open', true)
    await expect(page.locator('details canvas')).toHaveCount(1) // the effect is running
    await expect(page.locator('details canvas')).toHaveCount(0, { timeout: 3000 })
    await expect(d).toHaveAttribute('open', '')
    await expect(d).not.toHaveAttribute('style', /height/)

    await d.locator('summary').click()
    await expect(d).toHaveJSProperty('open', false, { timeout: 3000 })
    await expect(page.locator('details canvas')).toHaveCount(0)
  })

  test('keyboard: Enter and Space on the summary', async ({ page }) => {
    await page.goto('/details.html')
    await isReady(page)
    const d = page.locator('#d2')
    await d.locator('summary').focus()
    await page.keyboard.press('Enter')
    await expect(d).toHaveJSProperty('open', true)
    await page.waitForTimeout(1000)
    await page.keyboard.press('Space')
    await expect(d).toHaveJSProperty('open', false, { timeout: 3000 })
  })

  test('a reversal halfway through ends in the last requested state', async ({ page }) => {
    await page.goto('/details.html')
    await isReady(page)
    const d = page.locator('#d1')
    const s = d.locator('summary')
    await s.click() // open
    await page.waitForTimeout(250)
    await s.click() // close halfway
    await page.waitForTimeout(150)
    await s.click() // open again halfway
    await expect(d).toHaveJSProperty('open', true)
    await page.waitForTimeout(1500)
    await expect(d).toHaveJSProperty('open', true)
    await expect(page.locator('details canvas')).toHaveCount(0)
    await expect(d).not.toHaveAttribute('style', /height|overflow/)
  })

  test('prefers-reduced-motion: native behavior, no canvas ever', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/details.html')
    await isReady(page)
    const d = page.locator('#d1')
    await d.locator('summary').click()
    await expect(d).toHaveJSProperty('open', true)
    await expect(page.locator('details canvas')).toHaveCount(0)
    await d.locator('summary').click()
    await expect(d).toHaveJSProperty('open', false) // immediate, no waiting
  })

  test('without WebGL2: native behavior', async ({ page }) => {
    await disableWebGL2(page)
    await page.goto('/details.html')
    expect(await isReady(page)).toBe(false)
    const d = page.locator('#d1')
    await d.locator('summary').click()
    await expect(d).toHaveJSProperty('open', true)
    await d.locator('summary').click()
    await expect(d).toHaveJSProperty('open', false)
  })

  for (let i = 1; i <= 3; i++) {
    test(`stress test, run ${i}`, async ({ page }) => {
      await page.goto('/details.html')
      await isReady(page)
      const r = await runStress(page)
      expect(r.problems, `${r.snapshot}\n${r.tail}`).toEqual([])
    })
  }
})
