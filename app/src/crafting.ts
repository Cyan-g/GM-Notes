// Crafting time, by the rule in the kit notes: brewing takes 1 hour per 50 gp of the item's value
// (and does not count as resting).
const CP_PER_HOUR = 50 * 100

/** Minutes to craft an item worth `valueCp` copper; undefined without a value. At least one minute. */
export function craftingMinutes(valueCp: unknown): number | undefined {
  if (typeof valueCp !== 'number' || !(valueCp > 0)) return undefined
  return Math.max(1, Math.round((valueCp / CP_PER_HOUR) * 60))
}

/** "45 min", "2 h 30 min", "1 day 2 h" (days of 24 hours, since brewing is just time spent). */
export function formatDuration(min: number | undefined): string {
  if (min == null) return ''
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60
  return [d && `${d} day${d === 1 ? '' : 's'}`, h && `${h} h`, m && `${m} min`].filter(Boolean).join(' ')
}

export const craftingTime = (valueCp: unknown) => formatDuration(craftingMinutes(valueCp))
export const CRAFTING_RULE = 'Brewing takes 1 hour per 50 gp of the item’s value and does not count as resting.'
