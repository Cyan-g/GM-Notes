// What a level's Hit Die adds to the hit point maximum, by the Ruleset: the die's average or a roll (the player's
// choice), always the average, always rolled, or always the maximum; and level 1's (the maximum, or rolled).
// HitDieChoice shows it, the creator's Hit points step and the level-up count it.
import { rule } from './rules'

export type HpMode = 'choice' | 'average' | 'rolled' | 'max'
/** How a level after the first is counted (the Ruleset's "Hit points per level"). */
export const hpMode = (): HpMode => (['choice', 'average', 'rolled', 'max'].includes(rule('hpLevel')) ? rule('hpLevel') : 'choice') as HpMode
/** How level 1 is counted: the die's maximum, or rolled. */
export const hpFirstMode = (): HpMode => (rule('hpFirst') === 'rolled' ? 'rolled' : 'max')
export const dieAverage = (size: number) => size / 2 + 1

/**
 * The die's number a level counts: the maximum, the average, or the roll typed in. `roll`: undefined is "the average"
 * where the player may choose, null "rolled, not typed yet"; null back means a roll is still missing (or isn't one the
 * die can show).
 */
export function dieCounted(mode: HpMode, roll: number | null | undefined, size: number): number | null {
  if (mode === 'max') return size
  if (mode === 'average') return dieAverage(size)
  if (roll === undefined) return mode === 'choice' ? dieAverage(size) : null
  return roll != null && roll >= 1 && roll <= size ? roll : null
}
/** What the level adds with the Constitution modifier (at least 1), or null while its roll is missing. */
export function hpGain(mode: HpMode, roll: number | null | undefined, size: number, con: number): number | null {
  const r = dieCounted(mode, roll, size)
  return r == null ? null : Math.max(1, r + con)
}
