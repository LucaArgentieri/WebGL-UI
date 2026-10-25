export const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export const stamp = () => String(Math.round(performance.now()) % 100000).padStart(5, '0')

/** Debug trace: operations of the stress test and internal decisions of the elements. */
export function createTrace() {
  const lines: string[] = []
  return { lines, push: (message: string) => { lines.push(`${stamp()} ${message}`) } }
}

export interface StressConfig<T extends HTMLElement> {
  elements: T[]
  /** Each op returns the expected "open" state of the element after it ran. */
  ops: Record<string, (el: T, expected: boolean) => boolean>
  /** Op names; repeat a name to weight it. A function picks the names per element (mixed element types). */
  opNames: string[] | ((el: T) => string[])
  total?: number
  /** Bring every element to a still, closed state. */
  prepare(): Promise<void>
  isOpen(el: T): boolean
  /** Per-element invariants checked after everything settled. */
  check(el: T, index: number, expected: boolean): string[]
  globalCheck?(): string[]
  /** Internal state dump, captured before cleanup. */
  describe?(): string
  finish?(): Promise<void>
  trace: string[]
}

export interface StressResult {
  ok: boolean
  problems: string[]
  snapshot: string
  tail: string
}

/**
 * Random, fast operations (including several in the same tick) on several elements,
 * then a check of the invariants: final state equals the last operation, no leftover inline styles,
 * no canvas in the DOM.
 */
export async function runStress<T extends HTMLElement>(cfg: StressConfig<T>): Promise<StressResult> {
  const total = cfg.total ?? 80
  await cfg.prepare()
  const expected = cfg.elements.map(el => cfg.isOpen(el))
  cfg.trace.length = 0

  let last = 0
  let done = 0
  while (done < total) {
    // 70% on the same element, the rest random; sometimes several operations in the same instant
    const idx = Math.random() < 0.7 ? last : Math.floor(Math.random() * cfg.elements.length)
    last = idx
    const burst = Math.random() < 0.2 ? 1 + Math.floor(Math.random() * 3) : 1
    for (let b = 0; b < burst && done < total; b++) {
      const el = cfg.elements[idx]!
      const names = typeof cfg.opNames === 'function' ? cfg.opNames(el) : cfg.opNames
      const name = names[Math.floor(Math.random() * names.length)]!
      cfg.trace.push(`${stamp()} >>> ${el.id} ${name}`)
      expected[idx] = cfg.ops[name]!(el, expected[idx]!)
      done++
    }
    await sleep(Math.random() < 0.3 ? 0 : Math.random() * 140)
  }
  await sleep(2000) // longer than any animation

  const problems: string[] = []
  cfg.elements.forEach((el, i) => problems.push(...cfg.check(el, i, expected[i]!)))
  if (cfg.globalCheck) problems.push(...cfg.globalCheck())

  const snapshot = cfg.describe ? cfg.describe() : ''
  const tail = cfg.trace.slice(-18).join('\n')
  if (cfg.finish) await cfg.finish()
  return { ok: problems.length === 0, problems, snapshot, tail }
}

export function formatResult(r: StressResult, total: number): string {
  return r.ok
    ? `Passed: ${total} operations, correct final state, nothing left behind.`
    : `Anomalies: ${r.problems.join('; ')}.\nState: ${r.snapshot}\nLast events:\n${r.tail}`
}
