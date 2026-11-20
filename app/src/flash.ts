// A number that changes while you look at it lights up for a moment: green when it went up, red when it went down
// (the accent when it isn't a number), e.g. AC after equipping a shield, a slot or a charge spent. Used as
// v-flash="value" on the element showing the number; `.neutral` always uses the accent (a level, a count of things).
// Nothing lights up when the element first appears, or right after switching page or character: only real changes.
import { watch, type Directive } from 'vue'
import { route } from './router'
import { state } from './store'

let quietUntil = 0
/** No flashes for a moment (the page or the character changed, so every number is "new"). */
export function quiet(ms = 700) { quietUntil = performance.now() + ms }

/** The first number in a value: 15, "+4", "−2", "30 ft", "2 / 3". */
const numberOf = (v: unknown) => {
  if (typeof v === 'number') return v
  const m = String(v ?? '').match(/[-+−]?\d+(?:\.\d+)?/)
  return m ? Number(m[0].replace('−', '-')) : NaN
}
const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)
const CLASSES = ['flash', 'flash-up', 'flash-down']
const timers = new WeakMap<HTMLElement, number>()

export const vFlash: Directive<HTMLElement, unknown> = {
  updated(el, b) {
    if (same(b.value, b.oldValue) || performance.now() < quietUntil) return
    const was = numberOf(b.oldValue), now = numberOf(b.value)
    const cls = b.modifiers.neutral || isNaN(was) || isNaN(now) || was === now ? 'flash' : now > was ? 'flash-up' : 'flash-down'
    el.classList.remove(...CLASSES)
    void el.offsetWidth // restart the animation when it changes again quickly
    el.classList.add(cls)
    clearTimeout(timers.get(el))
    timers.set(el, window.setTimeout(() => el.classList.remove(cls), 1300))
  },
}

/** Quiet while the page or the current character changes (called once, from App.vue). */
export function startFlash() {
  watch(() => [route.current, state.db?.meta.currentCharacter], () => quiet(), { flush: 'pre' })
}

declare module 'vue' {
  interface GlobalDirectives { vFlash: typeof vFlash }
}
