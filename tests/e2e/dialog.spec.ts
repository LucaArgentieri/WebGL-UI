import { test, expect } from '@playwright/test'
import { disableWebGL2, isReady, runStress } from './helpers'

const logTexts = (page: import('@playwright/test').Page) => page.locator('#log li').allTextContents()

test.describe('dialog', () => {
  test('WebGL2 is available in this environment', async ({ page }) => {
    await page.goto('/dialog.html')
    expect(await isReady(page)).toBe(true)
  })

  test('showModal: modal, focus inside, backdrop effect then clean', async ({ page }) => {
    await page.goto('/dialog.html')
    await isReady(page)
    await page.locator('#openA').click()
    const dlg = page.locator('#dlgA')
    await expect(dlg).toHaveJSProperty('open', true)
    expect(await dlg.evaluate(d => d.matches(':modal'))).toBe(true)
    await expect(page.locator('#a-name')).toBeFocused()
    await expect(page.locator('dialog canvas')).toHaveCount(1)
    await expect(dlg).toHaveAttribute('data-animating', '')
    await expect(page.locator('dialog canvas')).toHaveCount(0, { timeout: 3000 })
    await expect(dlg).not.toHaveAttribute('data-animating', '')
    expect(await dlg.evaluate(d => (d as HTMLElement).style.getPropertyValue('--p'))).toBe('')
  })

  test('Tab never reaches the inert page, same as a plain native dialog', async ({ page }) => {
    await page.goto('/dialog.html')
    await isReady(page)

    // Where focus can land while tabbing with a modal open: an element inside it, or nothing (browser UI).
    // The page behind must stay unreachable (inert). A plain native dialog is the reference.
    const tabThrough = async (selector: string) => {
      const landed: string[] = []
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Tab')
        landed.push(await page.evaluate(sel => {
          const el = document.activeElement
          if (!el || el === document.body) return 'none'
          return el.closest(sel) ? 'inside' : 'OUTSIDE:' + (el.id || el.tagName)
        }, selector))
      }
      return landed
    }

    await page.evaluate(() => {
      const ref = document.createElement('dialog')
      ref.id = 'native-ref'
      ref.innerHTML = '<form method="dialog"><input id="r-in"><button value="x">x</button></form>'
      document.body.append(ref)
    })
    await page.evaluate(() => (document.getElementById('native-ref') as HTMLDialogElement).showModal())
    const reference = await tabThrough('#native-ref')
    await page.evaluate(() => (document.getElementById('native-ref') as HTMLDialogElement).close())

    await page.locator('#openA').click()
    await page.waitForTimeout(1000)
    const ours = await tabThrough('#dlgA')

    expect(reference.filter(x => x.startsWith('OUTSIDE'))).toEqual([])
    expect(ours.filter(x => x.startsWith('OUTSIDE'))).toEqual([])
  })

  test('Esc: cancel then close, animated, focus back on the trigger', async ({ page }) => {
    await page.goto('/dialog.html')
    await isReady(page)
    await page.locator('#openA').click()
    await page.waitForTimeout(1000)
    await page.keyboard.press('Escape')
    const dlg = page.locator('#dlgA')
    await expect(dlg).toHaveJSProperty('open', true) // still open while the animation runs
    await expect(dlg).toHaveJSProperty('open', false, { timeout: 3000 })
    await expect.poll(() => logTexts(page).then(t => t.slice(0, 2))).toEqual(['dlgA: close, returnValue “”', 'dlgA: cancel'])
    await expect(page.locator('#openA')).toBeFocused()
    await expect(page.locator('dialog canvas')).toHaveCount(0)
  })

  test('form method=dialog: returnValue from the submitter', async ({ page }) => {
    await page.goto('/dialog.html')
    await isReady(page)
    const dlg = page.locator('#dlgA')

    await page.locator('#openA').click()
    await page.waitForTimeout(1000)
    await dlg.getByRole('button', { name: 'Save' }).click()
    await expect(dlg).toHaveJSProperty('open', false, { timeout: 3000 })
    await expect(dlg).toHaveJSProperty('returnValue', 'ok')
    await expect.poll(() => logTexts(page).then(t => t[0])).toBe('dlgA: close, returnValue “ok”')

    await page.locator('#openA').click()
    await page.waitForTimeout(1000)
    await dlg.getByRole('button', { name: 'Cancel' }).click()
    await expect(dlg).toHaveJSProperty('open', false, { timeout: 3000 })
    await expect(dlg).toHaveJSProperty('returnValue', 'cancel')
  })

  test('Enter in the field submits the form (implicit submission)', async ({ page }) => {
    await page.goto('/dialog.html')
    await isReady(page)
    await page.locator('#openA').click()
    await page.waitForTimeout(1000)
    await page.locator('#a-name').fill('x')
    await page.keyboard.press('Enter')
    const dlg = page.locator('#dlgA')
    await expect(dlg).toHaveJSProperty('open', false, { timeout: 3000 })
  })

  test('nested dialogs: Esc closes only the topmost', async ({ page }) => {
    await page.goto('/dialog.html')
    await isReady(page)
    await page.locator('#openA').click()
    await page.waitForTimeout(1000)
    await page.locator('#openB').click()
    await page.waitForTimeout(1000)
    await expect(page.locator('#dlgB')).toHaveJSProperty('open', true)
    await page.keyboard.press('Escape')
    await expect(page.locator('#dlgB')).toHaveJSProperty('open', false, { timeout: 3000 })
    await expect(page.locator('#dlgA')).toHaveJSProperty('open', true)
    await page.waitForTimeout(500)
    await page.keyboard.press('Escape')
    await expect(page.locator('#dlgA')).toHaveJSProperty('open', false, { timeout: 3000 })
  })

  test('light dismiss (closedby="any"): click outside', async ({ page }) => {
    await page.goto('/dialog.html')
    await isReady(page)
    const supported = await page.evaluate(() => 'closedBy' in HTMLDialogElement.prototype)
    test.skip(!supported, 'closedby is not supported by this browser')
    await page.locator('#openA').click()
    await page.waitForTimeout(1000)
    await page.mouse.click(4, 4)
    await expect(page.locator('#dlgA')).toHaveJSProperty('open', false, { timeout: 3000 })
  })

  test('requestClose() goes through cancel and is animated', async ({ page }) => {
    await page.goto('/dialog.html')
    await isReady(page)
    const supported = await page.evaluate(() => typeof HTMLDialogElement.prototype.requestClose === 'function')
    test.skip(!supported, 'requestClose is not supported by this browser')
    await page.locator('#openA').click()
    await page.waitForTimeout(1000)
    await page.evaluate(() => (document.getElementById('dlgA') as HTMLDialogElement).requestClose())
    await expect(page.locator('#dlgA')).toHaveJSProperty('open', true)
    await expect(page.locator('#dlgA')).toHaveJSProperty('open', false, { timeout: 3000 })
  })

  test('programmatic open/close/open in the same tick ends open', async ({ page }) => {
    await page.goto('/dialog.html')
    await isReady(page)
    await page.evaluate(() => {
      const d = document.getElementById('dlgA') as HTMLDialogElement
      d.showModal()
      d.close()
      d.showModal()
    })
    await page.waitForTimeout(1500)
    await expect(page.locator('#dlgA')).toHaveJSProperty('open', true)
    await expect(page.locator('dialog canvas')).toHaveCount(0)
  })

  test('prefers-reduced-motion: native behavior, no canvas, Esc is immediate', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/dialog.html')
    await isReady(page)
    await page.locator('#openA').click()
    await expect(page.locator('#dlgA')).toHaveJSProperty('open', true)
    await expect(page.locator('dialog canvas')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.locator('#dlgA')).toHaveJSProperty('open', false)
  })

  test('without WebGL2: native behavior', async ({ page }) => {
    await disableWebGL2(page)
    await page.goto('/dialog.html')
    expect(await isReady(page)).toBe(false)
    await page.locator('#openA').click()
    await expect(page.locator('#dlgA')).toHaveJSProperty('open', true)
    await page.keyboard.press('Escape')
    await expect(page.locator('#dlgA')).toHaveJSProperty('open', false)
  })

  for (let i = 1; i <= 3; i++) {
    test(`stress test, run ${i}`, async ({ page }) => {
      await page.goto('/dialog.html')
      await isReady(page)
      const r = await runStress(page)
      expect(r.problems, `${r.snapshot}\n${r.tail}`).toEqual([])
    })
  }
})
