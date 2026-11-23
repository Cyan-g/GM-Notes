// Crafting time, by the Ruleset's "Crafting time": by value (the kit notes' rule: brewing takes 1 hour per 50 gp of
// the item's value, counted straight through, and does not count as resting), a day of work per 10 GP (2024), or a
// workweek per 50 GP; and what a recipe's ingredients cost.
import type { Entry } from './model/types'
import { get } from './store'
import { rule } from './rules'

const CP_PER_HOUR = 50 * 100

/** What a recipe's ingredients are worth together, in copper; undefined for an item without a recipe. */
export const recipeCost = (e: Entry) => {
  const lines = e.fields.recipe
  if (!lines?.length) return undefined
  return lines.reduce((s, l) => s + ((get(l.item)?.fields.value) ?? 0) * l.amount, 0)
}

/** Whole days of work (8 hours) or workweeks (5 such days) an item worth `valueCp` takes, by the Ruleset's pace. */
function workUnits(valueCp: number): { n: number; unit: 'day' | 'workweek' } | undefined {
  const pace = rule('craftingPace'), gp = valueCp / 100
  if (pace === '2024') return { n: Math.max(1, Math.ceil(gp / 10)), unit: 'day' }
  if (pace === 'workweek') return { n: Math.max(1, Math.ceil(gp / 50)), unit: 'workweek' }
  return undefined
}

/** Minutes to craft an item worth `valueCp` copper (of work, for the day-based paces); undefined without a value.
 *  By value: at least one minute, anything over an hour rounded to whole hours. */
export function craftingMinutes(valueCp: unknown): number | undefined {
  if (typeof valueCp !== 'number' || !(valueCp > 0)) return undefined
  const w = workUnits(valueCp)
  if (w) return w.n * (w.unit === 'day' ? 8 : 40) * 60
  const min = Math.max(1, Math.round((valueCp / CP_PER_HOUR) * 60))
  return min > 60 ? Math.round(min / 60) * 60 : min
}

/** "45 min", "2 h 30 min", "1 day 2 h" (days of 24 hours, since brewing is just time spent). */
export function formatDuration(min: number | undefined): string {
  if (min == null) return ''
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60
  return [d && `${d} day${d === 1 ? '' : 's'}`, h && `${h} h`, m && `${m} min`].filter(Boolean).join(' ')
}

/** "2 h", "3 days" (of work), "2 workweeks", by the Ruleset's pace. */
export function craftingTime(valueCp: unknown): string {
  if (typeof valueCp === 'number' && valueCp > 0) {
    const w = workUnits(valueCp)
    if (w) return `${w.n} ${w.unit}${w.n === 1 ? '' : 's'}`
  }
  return formatDuration(craftingMinutes(valueCp))
}
/** The pace in words, for the crafting time's hover. */
export const craftingRule = () => ({
  '2024': 'One day of 8 hours of work per 10 GP of the item’s price (the Ruleset).',
  workweek: 'One workweek (5 days of 8 hours) per 50 GP of the item’s price (the Ruleset).',
} as Record<string, string>)[rule('craftingPace')] ?? 'Brewing takes 1 hour per 50 gp of the item’s value and does not count as resting.'
