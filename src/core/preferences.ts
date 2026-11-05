/**
 * User preferences under which effects step aside and elements behave exactly like the native ones:
 * - reduced motion: no animation;
 * - forced colors: the canvas would paint over system colors;
 * - more contrast: soft edges, veils and blur lower contrast;
 * - reduced transparency: every effect is translucent by nature.
 * A query the browser does not know never matches, so unsupported preferences simply do not apply.
 */
export const NATIVE_PREFERENCES = [
  '(prefers-reduced-motion: reduce)',
  '(forced-colors: active)',
  '(prefers-contrast: more)',
  '(prefers-reduced-transparency: reduce)'
] as const

let lists: MediaQueryList[] | null = null

/** True when no preference asks for the native behavior. Checked on every interaction, so changes apply live. */
export function effectsAllowed(): boolean {
  lists ??= NATIVE_PREFERENCES.map(q => matchMedia(q))
  return !lists.some(l => l.matches)
}

/** WCAG 2.2.2: motion that lasts more than five seconds needs a way to pause it. Effects never get there. */
export const MAX_DURATION = 5000
