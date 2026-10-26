import { test as base, expect } from '@playwright/test'

/**
 * `test` with one addition: when a test fails, the page's console warnings and errors and its uncaught
 * exceptions are printed, so a failure in a browser we cannot run locally (Firefox, WebKit) explains itself.
 */
export const test = base.extend<{ consoleLog: void }>({
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
