import { test, expect } from './fixtures'
import { isReady } from './helpers'
import type { Page } from '@playwright/test'

const left = (page: Page) => page.evaluate(() => (window as any).__webglUi.fx().secondsLeft() as number)

test.describe('burn timer (createExpiryFx)', () => {
  test('burns while the time runs, then the button is replaced in the same task, nothing left behind', async ({ page }) => {
    // The burn starts on load: watch for the canvas from the first script, before the page's own.
    await page.addInitScript(() => {
      new MutationObserver(records => {
        for (const r of records) for (const n of r.addedNodes) if (n instanceof HTMLCanvasElement) (window as any).__burnCanvas = true
      }).observe(document, { childList: true, subtree: true })
    })
    await page.goto('/burn.html?s=3')
    await isReady(page)
    await expect.poll(() => page.evaluate(() => (window as any).__burnCanvas === true)).toBe(true)
    await expect(page.locator('#left')).not.toHaveText('3', { timeout: 3000 }) // the countdown moves
    await expect(page.locator('#done')).toHaveText('Sent.', { timeout: 8000 })
    await expect(page.locator('#undo')).toBeHidden()
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect(page.locator('#undo')).not.toHaveAttribute('style', /\S/)
    await expect(page.locator('#announce')).toHaveText('Message sent.')
  })

  test('hovering stops the clock and the flames (WCAG 2.2.1, 2.2.2); leaving resumes', async ({ page }) => {
    await page.goto('/burn.html?s=4')
    await isReady(page)
    await page.waitForTimeout(600)
    await page.locator('#undo').hover()
    await expect(page.locator('#undo')).toHaveAttribute('data-paused', '')
    const at = await left(page)
    await page.waitForTimeout(1600)
    expect(await left(page)).toBe(at)
    await expect(page.locator('#undo canvas')).toHaveCount(1) // the burned state stays on screen
    await page.mouse.move(5, 5)
    await expect(page.locator('#undo')).not.toHaveAttribute('data-paused', '')
    await expect(page.locator('#done')).toHaveText('Sent.', { timeout: 10000 })
  })

  test('keyboard focus stops the clock too', async ({ page }) => {
    await page.goto('/burn.html?s=4')
    await isReady(page)
    await page.locator('#undo').focus()
    await expect(page.locator('#undo')).toHaveAttribute('data-paused', '')
    const at = await left(page)
    await page.waitForTimeout(1500)
    expect(await left(page)).toBe(at)
  })

  test('pressing it in time cancels: nothing burns any more', async ({ page }) => {
    await page.goto('/burn.html?s=4')
    await isReady(page)
    await page.locator('#undo').click()
    await expect(page.locator('#done')).toHaveText('Sending undone.')
    await expect(page.locator('canvas')).toHaveCount(0)
  })

  test('the time limit can be extended', async ({ page }) => {
    await page.goto('/burn.html?s=4')
    await isReady(page)
    const before = await left(page)
    await page.locator('#more').click()
    expect(await left(page)).toBeGreaterThanOrEqual(before + 4)
  })

  test('reduced motion: no fire, the timer still runs and expires', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/burn.html?s=2')
    await expect(page.locator('#done')).toHaveText('Sent.', { timeout: 6000 })
    await expect(page.locator('canvas')).toHaveCount(0)
  })

  test('the effect: intact at 0, the box painted with the page colour at 1 (no fire left)', async ({ page }) => {
    await page.goto('/burn.html?s=60')
    await isReady(page)
    const sample = async (p: number) => {
      await page.evaluate(async progress => {
        const { renderer, burnEffect, fx } = (window as any).__webglUi
        fx().cancel()
        document.getElementById('probe')?.remove()
        const host = document.createElement('div')
        host.id = 'probe'
        host.style.cssText = 'position:fixed;left:100px;top:100px;width:240px;height:60px;z-index:10;background:#000'
        document.body.append(host)
        const dpr = Math.min(devicePixelRatio || 1, 2)
        void renderer.play(host, {
          effect: burnEffect, from: progress, to: progress, duration: 3000, layout: 'host', bleed: 40, color: [1, 1, 1],
          params: { uBox: [40 * dpr, 40 * dpr, 240 * dpr, 60 * dpr], uDrift: 1 }
        })
      }, p)
      await page.waitForTimeout(250)
      const png = (await page.locator('#probe').screenshot()).toString('base64')
      return page.evaluate(async b64 => {
        const img = new Image()
        img.src = 'data:image/png;base64,' + b64
        await img.decode()
        const c = document.createElement('canvas')
        c.width = img.width; c.height = img.height
        const ctx = c.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        const at = (fx: number) => ctx.getImageData(Math.round(fx * (c.width - 1)), c.height >> 1, 1, 1).data[0]!
        return [at(0.1), at(0.5), at(0.9)]
      }, png)
    }
    expect(await sample(0)).toEqual([0, 0, 0]) // black box untouched
    const end = await sample(1)
    expect(end.every(v => v > 245), `end ${end}`).toBe(true) // white page colour everywhere
  })
})
