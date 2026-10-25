import type { Page } from '@playwright/test'

/** Simulates a browser without WebGL2: the library must fall back to the native behavior. */
export async function disableWebGL2(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type === 'webgl2') return null
      return (original as (...a: unknown[]) => unknown).call(this, type, ...args)
    } as typeof original
  })
}

export async function isReady(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as any).__webglUi.ready() as Promise<boolean>)
}

export async function runStress(page: Page): Promise<{ ok: boolean; problems: string[]; snapshot: string; tail: string }> {
  return page.evaluate(() => (window as any).__webglUi.runStress())
}
