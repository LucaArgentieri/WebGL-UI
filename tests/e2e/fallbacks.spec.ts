import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// Every preference that asks for the native behavior, and how to emulate it.
const preferences: { name: string; apply: (page: Page) => Promise<void> }[] = [
  { name: 'reduced motion', apply: page => page.emulateMedia({ reducedMotion: 'reduce' }) },
  { name: 'forced colors', apply: page => page.emulateMedia({ forcedColors: 'active' }) },
  { name: 'more contrast', apply: page => page.emulateMedia({ contrast: 'more' }) },
  {
    // Playwright cannot emulate this one yet: answer the media query from an init script.
    name: 'reduced transparency',
    apply: page => page.addInitScript(() => {
      const original = window.matchMedia.bind(window)
      window.matchMedia = (q: string) => {
        const list = original(q)
        if (!q.includes('prefers-reduced-transparency')) return list
        return Object.create(list, { matches: { value: true }, media: { value: q } })
      }
    })
  }
]

for (const pref of preferences) {
  test.describe(`native fallback: ${pref.name}`, () => {
    test('details opens and closes natively, no canvas', async ({ page }) => {
      await pref.apply(page)
      await page.goto('/details.html')
      const d = page.locator('#d1')
      await d.locator('summary').click()
      await expect(d).toHaveJSProperty('open', true)
      await expect(page.locator('canvas')).toHaveCount(0)
      await d.locator('summary').click()
      await expect(d).toHaveJSProperty('open', false) // at once: no closing animation
    })

    test('dialog opens and Esc closes it natively, no canvas', async ({ page }) => {
      await pref.apply(page)
      await page.goto('/dialog.html')
      await page.locator('#openA').click()
      await expect(page.locator('#dlgA')).toHaveJSProperty('open', true)
      await expect(page.locator('canvas')).toHaveCount(0)
      await page.keyboard.press('Escape')
      await expect(page.locator('#dlgA')).toHaveJSProperty('open', false)
    })

    test('popover opens and closes natively, no canvas', async ({ page }) => {
      await pref.apply(page)
      await page.goto('/popover.html')
      await page.locator('#t2').click()
      await expect(page.locator('canvas')).toHaveCount(0)
      await page.locator('#close2').click()
      expect(await page.evaluate(() => document.getElementById('p2')!.matches(':popover-open'))).toBe(false)
    })
  })
}

test.describe('focus and the canvas', () => {
  test('tabbing while a dialog animates never lands on the canvas', async ({ page }) => {
    await page.goto('/dialog.html')
    await page.locator('#openA').click()
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('CANVAS')
    }
  })

  test('tabbing while a details animates never lands on the canvas', async ({ page }) => {
    await page.goto('/details.html')
    await page.locator('#d1 summary').focus()
    await page.keyboard.press('Enter')
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('CANVAS')
    }
  })
})

test.describe('duration cap (WCAG 2.2.2)', () => {
  test('an animation asked to last a minute ends within five seconds', async ({ page }) => {
    await page.goto('/docs/effects.html')
    const ms = await page.evaluate(async () => {
      const { renderer, effects } = (window as any).__docs
      await renderer.prepare(effects.ink)
      const host = document.createElement('div')
      host.style.cssText = 'position:relative;width:100px;height:60px'
      document.body.append(host)
      const t0 = performance.now()
      await renderer.play(host, { effect: effects.ink, from: 0, to: 1, duration: 60000, color: [1, 1, 1] })
      return performance.now() - t0
    })
    expect(ms).toBeLessThan(5600)
  })
})
