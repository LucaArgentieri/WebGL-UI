import { test, expect } from './fixtures'
import { disableWebGL2, isReady, runStress } from './helpers'

const open = (page: import('@playwright/test').Page, id: string) =>
  page.evaluate(i => document.getElementById(i)!.matches(':popover-open'), id)

test.describe('popover', () => {
  test('WebGL2 is available in this environment', async ({ page }) => {
    await page.goto('/popover.html')
    expect(await isReady(page)).toBe(true)
  })

  test('popovertarget opens at once and closes after the animation', async ({ page }) => {
    await page.goto('/popover.html')
    await isReady(page)
    await page.locator('#t1').click()
    expect(await open(page, 'p1')).toBe(true) // native, synchronous
    await expect(page.locator('#p1 canvas')).toHaveCount(1) // the effect is running
    await expect(page.locator('#p1 canvas')).toHaveCount(0, { timeout: 3000 })
    expect(await open(page, 'p1')).toBe(true)

    await page.locator('#t1').click()
    expect(await open(page, 'p1')).toBe(true) // still open while the closing animation runs
    await expect.poll(() => open(page, 'p1'), { timeout: 3000 }).toBe(false)
    await expect(page.locator('canvas')).toHaveCount(0)
  })

  test('script API: showPopover, hidePopover and togglePopover keep their signatures', async ({ page }) => {
    await page.goto('/popover.html')
    await isReady(page)
    const r = await page.evaluate(async () => {
      const p = document.getElementById('p2')!
      const wait = (ms: number) => new Promise(res => setTimeout(res, ms))
      const out: unknown[] = []
      p.showPopover()
      out.push(p.matches(':popover-open'))
      await wait(900)
      out.push(p.togglePopover()) // heading to closed: returns false
      out.push(p.matches(':popover-open')) // still open while animating
      await wait(900)
      out.push(p.matches(':popover-open'))
      out.push(p.togglePopover(true)) // forced open
      await wait(900)
      out.push(p.togglePopover({ force: false }))
      await wait(900)
      out.push(p.matches(':popover-open'))
      return out
    })
    expect(r).toEqual([true, false, true, false, true, false, false])
  })

  test('Esc closes an auto popover natively and leaves nothing behind', async ({ page }) => {
    await page.goto('/popover.html')
    await isReady(page)
    await page.locator('#t1').click()
    await page.waitForTimeout(100)
    await page.keyboard.press('Escape')
    await expect.poll(() => open(page, 'p1')).toBe(false)
    await expect(page.locator('canvas')).toHaveCount(0)
    await page.locator('#t1').click() // reopens normally afterwards
    expect(await open(page, 'p1')).toBe(true)
    await page.waitForTimeout(1000)
    expect(await open(page, 'p1')).toBe(true)
  })

  test('light dismiss (click outside) closes an auto popover', async ({ page }) => {
    await page.goto('/popover.html')
    await isReady(page)
    await page.locator('#t1').click()
    await page.waitForTimeout(1000)
    await page.locator('h1').click()
    await expect.poll(() => open(page, 'p1')).toBe(false)
    await expect(page.locator('canvas')).toHaveCount(0)
  })

  test('manual popover: close button with popovertargetaction="hide"', async ({ page }) => {
    await page.goto('/popover.html')
    await isReady(page)
    await page.locator('#t2').click()
    await page.waitForTimeout(1000)
    await page.locator('h1').click() // no light dismiss
    expect(await open(page, 'p2')).toBe(true)
    await page.locator('#close2').click()
    await expect.poll(() => open(page, 'p2'), { timeout: 3000 }).toBe(false)
  })

  test('a reversal halfway through ends in the last requested state', async ({ page }) => {
    await page.goto('/popover.html')
    await isReady(page)
    await page.locator('#t2').click()
    await page.waitForTimeout(150)
    await page.locator('#t2').click() // reverses to closing
    await page.waitForTimeout(100)
    await page.locator('#t2').click() // and open again
    await page.waitForTimeout(1500)
    expect(await open(page, 'p2')).toBe(true)
    await expect(page.locator('canvas')).toHaveCount(0)
  })

  test('without WebGL2: pure native behavior', async ({ page }) => {
    await disableWebGL2(page)
    await page.goto('/popover.html')
    expect(await isReady(page)).toBe(false)
    await page.locator('#t1').click()
    expect(await open(page, 'p1')).toBe(true)
    await page.keyboard.press('Escape')
    expect(await open(page, 'p1')).toBe(false)
    await page.locator('#t2').click()
    await page.locator('#close2').click()
    expect(await open(page, 'p2')).toBe(false) // closes at once, no animation
  })

  for (let i = 1; i <= 3; i++) {
    test(`stress test, run ${i}`, async ({ page }) => {
      await page.goto('/popover.html')
      await isReady(page)
      const r = await runStress(page)
      expect(r.problems, `${r.snapshot}\n${r.tail}`).toEqual([])
    })
  }
})

test.describe('popover: command invokers and hint', () => {
  test('commandfor="…" command="toggle-popover" is animated both ways', async ({ page }) => {
    await page.goto('/popover.html')
    await isReady(page)
    test.skip(!(await page.evaluate(() => 'commandForElement' in HTMLButtonElement.prototype)), 'no command invokers in this browser')
    await page.locator('#c2').click()
    expect(await open(page, 'p2')).toBe(true)
    await expect(page.locator('#p2 canvas')).toHaveCount(1)
    await expect(page.locator('#p2 canvas')).toHaveCount(0, { timeout: 3000 })
    await page.locator('#c2').click()
    expect(await open(page, 'p2')).toBe(true) // still open while the closing animation runs
    await expect(page.locator('#p2 canvas')).toHaveCount(1)
    await expect.poll(() => open(page, 'p2'), { timeout: 3000 }).toBe(false)
  })

  test('popover="hint" is animated and does not close an open auto popover', async ({ page }) => {
    await page.goto('/popover.html')
    await isReady(page)
    test.skip(!(await page.evaluate(() => { const d = document.createElement('div'); d.popover = 'hint' as never; return d.popover === 'hint' })), 'no popover="hint" in this browser')
    await page.locator('#t1').click()
    await page.waitForTimeout(800)
    await page.evaluate(() => document.getElementById('p3')!.showPopover())
    await expect(page.locator('#p3 canvas')).toHaveCount(1)
    await page.waitForTimeout(800)
    expect(await open(page, 'p3')).toBe(true)
    expect(await open(page, 'p1')).toBe(true)
  })

  test('without WebGL2, command invokers are native', async ({ page }) => {
    await disableWebGL2(page)
    await page.goto('/popover.html')
    test.skip(!(await page.evaluate(() => 'commandForElement' in HTMLButtonElement.prototype)), 'no command invokers in this browser')
    await page.locator('#c2').click()
    expect(await open(page, 'p2')).toBe(true)
    await page.locator('#c2').click()
    expect(await open(page, 'p2')).toBe(false)
  })
})

test.describe("popover: layout 'behind'", () => {
  test('the effect paints the surface behind the content; the surface is transparent only while animating', async ({ page }) => {
    await page.goto('/popover.html')
    await isReady(page)
    await expect(page.locator('#p1')).toHaveAttribute('data-fx-behind', '')
    await page.locator('#t1').click()
    const canvas = page.locator('#p1 canvas')
    await expect(canvas).toHaveCount(1)
    expect(await canvas.evaluate(c => getComputedStyle(c).zIndex)).toBe('-1')
    expect(await page.locator('#p1').evaluate(p => getComputedStyle(p).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
    await expect(canvas).toHaveCount(0, { timeout: 4000 })
    expect(await page.locator('#p1').evaluate(p => getComputedStyle(p).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
  })
})
