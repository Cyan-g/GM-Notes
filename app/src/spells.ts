// What a spell rolls and does (its `rolls`, `conditions` and `active` fields): a roll in words at the caster's level
// and the slot it's cast with ("2d10 fire", "2d4 + 3 healing"), how it grows, and the spells a character has switched
// on, whose "while active" effects their sheet counts (gear.ts) until a long rest.
import type { CharacterSheet, Entry, GearEffect, Id, SpellRoll } from './model/types'
import { get } from './store'

/** A spell's rolls. */
export const rollsOf = (e: Entry | undefined): SpellRoll[] => (Array.isArray(e?.fields.rolls) ? e!.fields.rolls! : [])
/** A spell's effects while it's active. */
export const activeEffectsOf = (e: Entry | undefined): GearEffect[] => (Array.isArray(e?.fields.active) ? e!.fields.active! : [])
/** A spell's level as a number (a cantrip is 0). */
export const spellLevel = (e: Entry) => (e.fields.level === 'Cantrip' ? 0 : Number(e.fields.level) || 0)
/** How many times a cantrip's dice count at a character level: 1, then 2 at 5, 3 at 11, 4 at 17. */
export const cantripTier = (level: number) => (level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1)
const DICE = /^(\d*)d(\d+)(.*)$/
/** "1d10" × 2 = "2d10"; anything else as "2 × (…)". */
function times(dice: string, n: number): string {
  if (n <= 1) return dice
  const m = dice.trim().match(DICE)
  return m && !m[3].trim() ? `${(Number(m[1]) || 1) * n}d${m[2]}` : `${n} × (${dice})`
}
/** "8d6" + 2 × "1d6" = "10d6"; dice of another size are added on: "3d8 + 2d6". */
function plus(dice: string, add: string, n: number): string {
  if (/^\d+$/.test(dice.trim()) && /^\d+$/.test(add.trim())) return String(Number(dice) + Number(add) * n)
  const a = dice.trim().match(DICE), b = add.trim().match(DICE)
  if (a && b && !a[3].trim() && !b[3].trim() && a[2] === b[2]) return `${(Number(a[1]) || 1) + (Number(b[1]) || 1) * n}d${a[2]}`
  return `${dice} + ${times(add, n)}`
}
const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']
/**
 * A roll in words: its dice at the character's level (a cantrip's) and slot level (cast higher), the spellcasting
 * modifier if it adds one (its value when known), and what it is: "2d10 fire", "2d4 + 3 healing", "1d6 temp HP".
 */
export function rollText(e: Entry, r: SpellRoll, o: { level?: number; slot?: number; mod?: number } = {}): string {
  let dice = r.dice
  if (r.cantrip && o.level) dice = times(dice, cantripTier(o.level))
  if (r.slot && o.slot && o.slot > spellLevel(e)) dice = plus(dice, r.slot, o.slot - spellLevel(e))
  const m = r.mod ? (o.mod != null ? ` ${o.mod < 0 ? '−' : '+'} ${Math.abs(o.mod)}` : ' + mod') : ''
  const what = r.kind === 'healing' ? ' healing' : r.kind === 'tempHp' ? ' temp HP' : r.type ? ` ${r.type.toLowerCase()}` : ' damage'
  return `${dice}${m}${what}`
}
/** How a roll grows, in words: "more dice at levels 5, 11 and 17", "+1d6 per slot level above 1st". */
export function growthText(e: Entry, r: SpellRoll): string {
  if (r.cantrip) return 'more dice at levels 5, 11 and 17'
  if (r.slot) return `+${r.slot} per slot level above ${ORD[spellLevel(e)] ?? spellLevel(e)}`
  return ''
}
/** A spell's rolls in one line ("8d6 fire · half on a save"), at the given level, slot and modifier. */
export function rollsLine(e: Entry | undefined, o: { level?: number; slot?: number; mod?: number } = {}): string {
  if (!e) return ''
  return rollsOf(e).map(r => [rollText(e, r, o), r.note].filter(Boolean).join(', ')).join(' · ')
}

// ---- spells switched on ----
/** The spells a character has switched on (that still have "while active" effects). */
export const activeSpells = (s: CharacterSheet | undefined): Entry[] =>
  (s?.activeSpells ?? []).map(id => get(id)).filter((e): e is Entry => e?.type === 'spell' && activeEffectsOf(e).length > 0)
export const isActive = (s: CharacterSheet | undefined, id: Id) => !!s?.activeSpells?.includes(id)
/** Switch a spell on or off. */
export function toggleActive(s: CharacterSheet, id: Id) {
  const l = new Set(s.activeSpells ?? [])
  if (l.has(id)) l.delete(id); else l.add(id)
  s.activeSpells = [...l]
  if (!s.activeSpells.length) delete s.activeSpells
}
