import { test, expect } from './fixtures'
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

test.describe('details: exclusive accordion (name)', () => {
  const openIds = (page: import('@playwright/test').Page) =>
    page.evaluate(() => [...document.querySelectorAll<HTMLDetailsElement>('details[name="faq"]')].filter(d => d.open).map(d => d.id))

  test('opening one closes the open sibling natively at once; the sibling collapses smoothly and leaves nothing behind', async ({ page }) => {
    await page.goto('/details.html')
    await isReady(page)
    await page.locator('#g1 summary').click()
    await page.waitForTimeout(1200)
    expect(await openIds(page)).toEqual(['g1'])

    await page.locator('#g2 summary').click()
    expect(await openIds(page)).toEqual(['g2']) // native: at most one open, immediately
    expect(await page.locator('#g1').evaluate(d => d.getAnimations().length)).toBe(1) // the collapse
    await page.waitForTimeout(1200)
    expect(await page.locator('#g1').evaluate(d => d.getAnimations().length)).toBe(0)
    await expect(page.locator('#g1')).not.toHaveAttribute('style', /\S/)
    await expect(page.locator('#g2')).not.toHaveAttribute('style', /height|overflow/)
  })

  test('opening a sibling while the first one is still opening: the newer one wins', async ({ page }) => {
    await page.goto('/details.html')
    await isReady(page)
    await page.locator('#g1 summary').click()
    await page.waitForTimeout(150) // g1 is mid-animation
    await page.locator('#g2 summary').click()
    await page.waitForTimeout(1500)
    expect(await openIds(page)).toEqual(['g2'])
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect(page.locator('#g1')).not.toHaveAttribute('style', /\S/)
  })

  test('random clicks keep the invariant: at most one open, and nothing left behind', async ({ page }) => {
    await page.goto('/details.html')
    await isReady(page)
    for (let i = 0; i < 30; i++) {
      await page.locator(`#g${1 + Math.floor(Math.random() * 3)} summary`).click()
      expect((await openIds(page)).length).toBeLessThanOrEqual(1)
      await page.waitForTimeout(Math.random() * 160)
    }
    await page.waitForTimeout(1600)
    expect((await openIds(page)).length).toBeLessThanOrEqual(1)
    await expect(page.locator('canvas')).toHaveCount(0)
    for (const id of ['g1', 'g2', 'g3']) {
      await expect(page.locator(`#${id}`)).not.toHaveAttribute('style', /height|overflow/)
      expect(await page.locator(`#${id}`).evaluate(d => d.getAnimations().length)).toBe(0)
    }
  })
})
