// The 5e rules' small facts, in one place: the six abilities and their names, the skills, modifiers and the
// proficiency bonus, signed numbers, spell level ordinals, dice, challenge ratings and the conditions.
// Pure: nothing here reads the database, so any module can use it.
import type { Ability, Entry } from './types'

export type { Ability }

// ---- abilities and skills ----
export const ABILITY_KEYS: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']
/** Each ability's full name ("Strength"). */
export const ABILITY_NAME: Record<Ability, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }
/** Each ability's short name, as written in running text ("Str"). */
export const ABILITY_SHORT: Record<Ability, string> = { str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha' }
/** Each ability's short name in capitals, as on a sheet ("STR"). */
export const ABILITY_UPPER: Record<Ability, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' }
/** The abilities in order with their names, for lists and pickers. */
export const ABILITIES: { key: Ability; label: string; short: string }[] = ABILITY_KEYS.map(key => ({ key, label: ABILITY_NAME[key], short: ABILITY_UPPER[key] }))
export const SKILLS: { name: string; ability: Ability }[] = [
  { name: 'Acrobatics', ability: 'dex' }, { name: 'Animal Handling', ability: 'wis' }, { name: 'Arcana', ability: 'int' },
  { name: 'Athletics', ability: 'str' }, { name: 'Deception', ability: 'cha' }, { name: 'History', ability: 'int' },
  { name: 'Insight', ability: 'wis' }, { name: 'Intimidation', ability: 'cha' }, { name: 'Investigation', ability: 'int' },
  { name: 'Medicine', ability: 'wis' }, { name: 'Nature', ability: 'int' }, { name: 'Perception', ability: 'wis' },
  { name: 'Performance', ability: 'cha' }, { name: 'Persuasion', ability: 'cha' }, { name: 'Religion', ability: 'int' },
  { name: 'Sleight of Hand', ability: 'dex' }, { name: 'Stealth', ability: 'dex' }, { name: 'Survival', ability: 'wis' },
]

// ---- numbers ----
/** An ability score's modifier (no score counts as 0). */
export const mod = (score?: number) => (score == null ? 0 : Math.floor((score - 10) / 2))
/** The proficiency bonus at a character level (+2 at levels 1 to 4, up to +6 at 17). */
export const profBonus = (level: number) => 2 + Math.floor((Math.max(1, level) - 1) / 4)
/**
 * A number with its sign: "+2", "−1". The minus is the typographic one unless `minus` says otherwise ('-' where
 * the text is read back as a number); `gap` goes between the sign and the number ("+ 2").
 */
export const signed = (n: number, minus = '−', gap = '') => `${n >= 0 ? '+' : minus}${gap}${Math.abs(n)}`

// ---- spell levels ----
/** Spell levels as ordinals, by level ("3rd" at 3); "" at 0. */
export const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']
/** Any number as an ordinal: "1st", "2nd", "3rd", "4th", "12th". */
export const ord = (n: number | string) => ({ '1': '1st', '2': '2nd', '3': '3rd' } as Record<string, string>)[String(n)] ?? `${n}th`
/** A spell's level as a number: a cantrip is 0; `none` when it has no level. */
export const spellLevel = (e: Entry, none = 0) => (e.fields.level === 'Cantrip' ? 0 : Number(e.fields.level) || none)

// ---- dice ----
/** A die's size ("d8" → 8); 0 when it names none. */
export const dieSize = (die: string) => Number(die.replace(/\D/g, '')) || 0
/** The average of dice ("3d6" → 10, "2d6 + 3" → 10). */
export function diceAverage(dice: string): number {
  return dice.replace(/\s/g, '').split('+').reduce((n, part) => {
    const m = part.match(/^(\d*)d(\d+)$/i)
    return n + (m ? Math.floor((Number(m[1] || 1) * (Number(m[2]) + 1)) / 2) : Number(part) || 0)
  }, 0)
}

// ---- challenge rating ----
/** A challenge rating as a number ("1/4" → 0.25), for sorting. */
export const crNum = (cr: string) => { const [a, b] = cr.split('/').map(Number); return b ? a / b : a }
/** Proficiency bonus by challenge rating. */
export function crProf(cr?: string): number {
  const n = !cr ? 0 : cr.includes('/') ? 0 : Number(cr) || 0
  return 2 + Math.floor(Math.max(0, n - 1) / 4)
}

// ---- conditions ----
/** The conditions of the rules, in order. */
export const CONDITIONS = ['Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious']
/** What a character sheet and the combat tracker can mark: the conditions, and Concentrating. */
export const TRACKER_CONDITIONS = [...CONDITIONS, 'Concentrating']
/** The CON save DC to keep concentrating after taking damage: 10 or half the damage, at most `cap` (2024: 30). */
export const concentrationDc = (dmg: number, cap = Infinity) => Math.min(cap, Math.max(10, Math.floor(dmg / 2)))
