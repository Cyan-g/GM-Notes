// What a spell rolls and does (its `rolls`, `conditions` and `active` fields): a roll in words at the caster's level
// and the slot it's cast with ("2d10 fire", "2d4 + 3 healing"), how it grows, and the spells a character has switched
// on, whose "while active" effects their sheet counts (effects.ts) until a long rest.
import type { CharacterSheet, Entry, GearEffect, Id, SpellArea, SpellRoll } from './model/types'
import { get } from './store'
import { ORD, signed, spellLevel } from './model/dnd'

/** A spell's rolls. */
export const rollsOf = (e: Entry | undefined): SpellRoll[] => (Array.isArray(e?.fields.rolls) ? e!.fields.rolls! : [])
/** A spell's effects while it's active. */
export const activeEffectsOf = (e: Entry | undefined): GearEffect[] => (Array.isArray(e?.fields.active) ? e!.fields.active! : [])
/** A spell's area of effect in words: "20-foot-radius Sphere", "15-foot Cone", "60-foot-long, 5-foot-wide Line". */
export function areaText(a: SpellArea | undefined): string {
  if (!a?.size) return ''
  const n = a.size
  switch (a.shape) {
    case 'sphere': return `${n}-foot-radius Sphere`
    case 'cylinder': return `${n}-foot-radius, ${a.height ?? n}-foot-high Cylinder`
    case 'line': return `${n}-foot-long, ${a.width ?? 5}-foot-wide Line`
    case 'emanation': return `${n}-foot Emanation`
    case 'cone': return `${n}-foot Cone`
    default: return `${n}-foot Cube`
  }
}
/** A spell's saving throw in three letters: "DEX save"; '' for a spell without one. */
export const saveText = (e: Entry) => (e.fields.savingThrow ? `${String(e.fields.savingThrow).slice(0, 3).toUpperCase()} save` : '')
/** "DEX save", "Attack", or the spell's type ("Utility", "Healing"). */
export function attackOrSave(e: Entry): string {
  const t = String(e.fields.spellType ?? '')
  if (t === 'Saving throw') return saveText(e) || 'Save'
  return t
}
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
/**
 * A roll in words: its dice at the character's level (a cantrip's) and slot level (cast higher), the spellcasting
 * modifier if it adds one (its value when known), and what it is: "2d10 fire", "2d4 + 3 healing", "1d6 temp HP".
 */
export function rollText(e: Entry, r: SpellRoll, o: RollOptions = {}): string {
  let dice = r.dice
  if (r.cantrip && o.level) dice = times(dice, cantripTier(o.level))
  const lvl = spellLevel(e), above = o.slot && o.slot > lvl ? o.slot - lvl : 0
  if (r.slot && above && !r.beams) dice = plus(dice, r.slot, above)
  // what features add to its damage (Agonizing Blast, Elemental Affinity), on top of the spellcasting modifier
  const add = (r.mod && o.mod != null ? o.mod : 0) + (o.add?.(r) ?? 0)
  const m = r.mod && o.mod == null ? ' + mod' : add ? ` ${signed(add, '−', ' ')}` : ''
  const what = r.kind === 'healing' ? ' healing' : r.kind === 'tempHp' ? ' temp HP' : r.type ? ` ${r.type.toLowerCase()}` : ' damage'
  // made several times (Eldritch Blast, Magic Missile): how many at the character's level (a cantrip) or the slot level
  if (r.beams) {
    const n = beamCount(e, r, o)
    if (n == null) return `${dice}${m}${what} per ${r.beams}`
    return n > 1 ? `${n} ${r.beams}s: ${dice}${m}${what} each` : `1 ${r.beams}: ${dice}${m}${what}`
  }
  return `${dice}${m}${what}`
}
/** How many times a roll is made: a cantrip's by character level (unknown without one), a leveled spell's at the slot
 * level (its own when not cast higher). */
export function beamCount(e: Entry, r: SpellRoll, o: RollOptions = {}): number | undefined {
  const lvl = spellLevel(e)
  if (!lvl) return o.level ? cantripTier(o.level) : undefined
  const above = o.slot && o.slot > lvl ? o.slot - lvl : 0
  return (r.count ?? 1) + (r.perSlot ?? 1) * above
}
/** A roll's numbers: the character's level (cantrips), the slot level, the spellcasting modifier, and what features
 * add to a roll (`add`). */
export interface RollOptions { level?: number; slot?: number; mod?: number; add?: (r: SpellRoll) => number }
/** How a roll grows, in words: "more dice at levels 5, 11 and 17", "+1d6 per slot level above 1st". */
export function growthText(e: Entry, r: SpellRoll): string {
  if (r.beams && spellLevel(e) > 0) { const k = r.perSlot ?? 1; return `+${k} ${r.beams}${k === 1 ? '' : 's'} per slot level above ${ORD[spellLevel(e)] ?? spellLevel(e)}` }
  if (r.beams) return `more ${r.beams}s at levels 5, 11 and 17`
  if (r.cantrip) return 'more dice at levels 5, 11 and 17'
  if (r.slot) return `+${r.slot} per slot level above ${ORD[spellLevel(e)] ?? spellLevel(e)}`
  return ''
}
/** A spell's rolls in one line ("8d6 fire · half on a save"), at the given level, slot and modifier. */
export function rollsLine(e: Entry | undefined, o: RollOptions = {}): string {
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
