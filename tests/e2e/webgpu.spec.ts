import { test, expect } from './fixtures'
import { disableWebGL2, isReady } from './helpers'
import type { Page } from '@playwright/test'

const backend = (page: Page) => page.evaluate(() => (window as any).__webglUi.backend() as Promise<string>)

const near = (a: number[], b: number[], tol = 14) => a.every((v, i) => Math.abs(v - b[i]!) <= tol)

test.describe('WebGPU (WGSL) backend', () => {
  test('uses WebGPU where an adapter exists, WebGL2 otherwise', async ({ page, browserName }) => {
    await page.goto('/webgpu.html')
    const b = await backend(page)
    if (browserName === 'chromium') expect(b).toBe('webgpu') // launched with a SwiftShader adapter
    else expect(['webgpu', 'webgl2']).toContain(b)
  })

  // Pixels are read back from the GPU (offscreen render): headless browsers may not present WebGPU canvases.
  const offscreen = (page: Page, name: string, progress: number, color: number[], alpha = 1) =>
    page.evaluate(a => (window as any).__webglUi.renderOffscreen(...a), [name, progress, color, alpha] as const) as Promise<number[] | null>

  test('the WGSL ink draws what it promises: full cover at 0, nothing at 1 (premultiplied)', async ({ page }) => {
    await page.goto('/webgpu.html')
    const covered = await offscreen(page, 'ink', 0, [1, 0, 0])
    test.skip(covered === null, 'no WebGPU adapter in this browser')
    expect(near(covered!.slice(0, 3), [255, 0, 0], 12) && covered![3]! > 245, `covered ${covered}`).toBe(true)
    const revealed = await offscreen(page, 'ink', 1, [1, 0, 0])
    expect(revealed![3], `revealed ${revealed}`).toBeLessThan(4)
  })

  test('the WGSL veil ends on color × alpha (premultiplied output)', async ({ page }) => {
    await page.goto('/webgpu.html')
    const end = await offscreen(page, 'veil', 1, [1, 1, 1], 0.5)
    test.skip(end === null, 'no WebGPU adapter in this browser')
    expect(near(end!, [128, 128, 128, 128], 6), `end ${end}`).toBe(true) // white at 50%, premultiplied
    const start = await offscreen(page, 'veil', 0, [1, 1, 1], 0.5)
    expect(start![3], `start ${start}`).toBeLessThan(4)
  })

  test('details, popover and dialog animate and clean up', async ({ page }) => {
    await page.goto('/webgpu.html')
    await isReady(page)
    await page.locator('#g1 summary').click()
    await expect(page.locator('#g1')).toHaveJSProperty('open', true)
    await expect(page.locator('#g1 canvas')).toHaveCount(1)
    await expect(page.locator('canvas')).toHaveCount(0, { timeout: 4000 })
    await page.locator('#tp').click()
    await expect(page.locator('#gp canvas')).toHaveCount(1)
    await expect(page.locator('canvas')).toHaveCount(0, { timeout: 4000 })
    await page.keyboard.press('Escape')
    await page.locator('#open').click()
    await expect(page.locator('#gd')).toHaveJSProperty('open', true)
    await expect(page.locator('canvas')).toHaveCount(0, { timeout: 6000 })
  })

  test('without WebGPU: the GLSL fallback animates on WebGL2', async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined }) })
    await page.goto('/webgpu.html')
    expect(await backend(page)).toBe('webgl2')
    await page.locator('#g1 summary').click()
    await expect(page.locator('#g1 canvas')).toHaveCount(1)
    await expect(page.locator('canvas')).toHaveCount(0, { timeout: 4000 })
  })

  test('without WebGPU and WebGL2: native', async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined }) })
    await disableWebGL2(page)
    await page.goto('/webgpu.html')
    expect(await backend(page)).toBe('none')
    await page.locator('#g1 summary').click()
    await expect(page.locator('#g1')).toHaveJSProperty('open', true)
    await expect(page.locator('canvas')).toHaveCount(0)
  })
})
