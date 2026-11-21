// Crafting time, by the rule in the kit notes: brewing takes 1 hour per 50 gp of the item's value
// (and does not count as resting); and what a recipe's ingredients cost.
import type { Entry } from './model/types'
import { get } from './store'

const CP_PER_HOUR = 50 * 100

/** What a recipe's ingredients are worth together, in copper; undefined for an item without a recipe. */
export const recipeCost = (e: Entry) => {
  const lines = e.fields.recipe
  if (!lines?.length) return undefined
  return lines.reduce((s, l) => s + ((get(l.item)?.fields.value) ?? 0) * l.amount, 0)
}

/** Minutes to craft an item worth `valueCp` copper; undefined without a value.
 *  At least one minute; anything over an hour is rounded to whole hours. */
export function craftingMinutes(valueCp: unknown): number | undefined {
  if (typeof valueCp !== 'number' || !(valueCp > 0)) return undefined
  const min = Math.max(1, Math.round((valueCp / CP_PER_HOUR) * 60))
  return min > 60 ? Math.round(min / 60) * 60 : min
}

/** "45 min", "2 h 30 min", "1 day 2 h" (days of 24 hours, since brewing is just time spent). */
export function formatDuration(min: number | undefined): string {
  if (min == null) return ''
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60
  return [d && `${d} day${d === 1 ? '' : 's'}`, h && `${h} h`, m && `${m} min`].filter(Boolean).join(' ')
}

export const craftingTime = (valueCp: unknown) => formatDuration(craftingMinutes(valueCp))
export const CRAFTING_RULE = 'Brewing takes 1 hour per 50 gp of the item’s value and does not count as resting.'
