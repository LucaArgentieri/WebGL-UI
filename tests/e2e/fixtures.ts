import { test as base, expect } from '@playwright/test'

/**
 * `test` with one addition: when a test fails, the page's console warnings and errors and its uncaught
 * exceptions are printed, so a failure in a browser we cannot run locally (Firefox, WebKit) explains itself.
 */
export const test = base.extend<{ consoleLog: void; webgl2Gate: void }>({
  // Headless Firefox on a GPU-less runner can come without WebGL2. The suite then still runs the tests that
  // need no WebGL (the native fallback); the rest are skipped, visibly, and only for Firefox.
  webgl2Gate: [
    async ({ page, browserName }, use, testInfo) => {
      if (browserName === 'firefox' && !/without WebGL2/.test(testInfo.title)) {
        const ok = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))
        testInfo.skip(!ok, 'WebGL2 is not available in this Firefox environment')
      }
      await use()
    },
    { auto: true }
  ],
  consoleLog: [
    async ({ page }, use, testInfo) => {
      const lines: string[] = []
      page.on('console', m => { if (['warning', 'error'].includes(m.type())) lines.push(`[console.${m.type()}] ${m.text()}`) })
      page.on('pageerror', e => lines.push(`[pageerror] ${e.message}`))
      await use()
      if (testInfo.status !== testInfo.expectedStatus && lines.length) {
        console.log(`\n--- browser console for "${testInfo.title}" ---\n${lines.slice(0, 20).join('\n')}\n---`)
      }
    },
    { auto: true }
  ]
})

export { expect }
