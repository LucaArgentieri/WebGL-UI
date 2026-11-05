import { test, expect } from './fixtures'

const pages = ['index', 'details', 'dialog', 'popover', 'image', 'effects', 'cookbook']

test.describe('documentation', () => {
  for (const name of pages) {
    test(`${name}: loads without errors, marks itself in the nav, no horizontal overflow on a phone`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', e => errors.push(e.message))
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(`/docs/${name}.html`)
      await expect(page.locator('.docs-nav [aria-current="page"]')).toHaveCount(1)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(0)
      expect(errors).toEqual([])
    })
  }

  test('reference pages are served from docs/*.md', async ({ page }) => {
    await page.goto('/docs/reference/parity.html')
    await expect(page.locator('h1')).toHaveText('Native parity')
  })

  test('live examples run on one shared canvas and clean up', async ({ page }) => {
    await page.goto('/docs/cookbook.html')
    // the custom effect's source on the page is the one that runs
    await expect(page.locator('code[data-source="blinds"]')).toContainText('nine horizontal slats')
    const d = page.locator('details[data-effect="blinds"]')
    await d.locator('summary').click()
    await expect(d).toHaveJSProperty('open', true)
    await expect(page.locator('details canvas')).toHaveCount(1)
    await expect(page.locator('canvas')).toHaveCount(0, { timeout: 3000 })

    await page.getByRole('button', { name: 'Open', exact: true }).click()
    expect(await page.evaluate(() => document.getElementById('cb-pop')!.matches(':popover-open'))).toBe(true)
  })

  test('dialog page: both layouts open and close natively', async ({ page }) => {
    await page.goto('/docs/dialog.html')
    for (const id of ['dlg-host', 'dlg-viewport']) {
      await page.locator(`[data-open-dialog="${id}"]`).click()
      await expect(page.locator(`#${id}`)).toHaveJSProperty('open', true)
      await page.waitForTimeout(900)
      await page.keyboard.press('Escape')
      await expect(page.locator(`#${id}`)).toHaveJSProperty('open', false, { timeout: 3000 })
    }
    await expect(page.locator('canvas')).toHaveCount(0)
  })
})
