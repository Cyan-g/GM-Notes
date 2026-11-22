// Class features that move spell slots around, as helpers the player clicks (the 2024 rules): Arcane Recovery (a
// Wizard gets slots back after a short rest), Magical Cunning (a Warlock gets half the pact slots back) and Font of
// Magic (a Sorcerer turns sorcery points into slots and back). The feature's uses on the sheet count what's spent:
// Font of Magic's uses are the sorcery points.
import type { CharacterSheet, Entry } from './model/types'
import { speciesTraits, spendUse, usesLeft, usesMax, type ActiveTrait } from './species'
import { activeSpellbook, score } from './sheet'
import { classesOf } from './model/classes'
import { editSheet, sheetOf } from './sheetData'
import { slotRows, type SlotRow } from './slots'

/** A feature the character has now, by its name (as the class page writes it), with uses to count. */
export function featureNamed(pc: Entry, s: CharacterSheet | undefined, name: string): ActiveTrait | undefined {
  const n = name.toLowerCase()
  return speciesTraits(pc, s).find(a => a.active && !!a.trait.uses && a.trait.name.trim().toLowerCase() === n)
}
export const classLevel = (pc: Entry, cls: string) => classesOf(pc).filter(l => l.class === cls).reduce((n, l) => n + l.level, 0)
/** Uses of a feature left and in all. */
export function usesOf(pc: Entry, a: ActiveTrait) {
  const s = sheetOf(pc)
  return { left: usesLeft(pc, s, a, score), max: usesMax(pc, a, s, score) }
}

/** The character's slot rows (from their spellbook). */
export const slotsOf = (pc: Entry): SlotRow[] => slotRows(activeSpellbook(pc), pc)

// ---- Arcane Recovery: spent slots worth up to half the Wizard level (rounded up), none of level 6 or higher ----
export const arcaneBudget = (pc: Entry) => Math.ceil(classLevel(pc, 'Wizard') / 2)
/** Get back `picks` (slot level → how many), spending the feature's use. */
export function arcaneRecover(pc: Entry, a: ActiveTrait, picks: Record<number, number>) {
  editSheet(pc, x => {
    const b = x.spellbook ?? activeSpellbook(pc)
    for (const [l, n] of Object.entries(picks)) { const row = b.slots[Number(l) - 1]; if (row && n) row.used = Math.max(0, row.used - n) }
    spendUse(x, pc, a, 1, score)
  })
}

// ---- Magical Cunning: half the pact slots back (rounded up), once per long rest ----
export const cunningBack = (row: SlotRow) => Math.min(row.used, Math.ceil(row.max / 2))
export function magicalCunning(pc: Entry, a: ActiveTrait, row: SlotRow) {
  const n = cunningBack(row)
  editSheet(pc, x => {
    const b = x.spellbook ?? activeSpellbook(pc)
    b.pact = { ...(b.pact ?? {}), used: Math.max(0, row.used - n) }
    spendUse(x, pc, a, 1, score)
  })
  return n
}

// ---- Font of Magic: a slot for sorcery points (2, 3, 5, 6, 7 for levels 1–5), or points for a slot (its level) ----
export const FONT_COST: Record<number, number> = { 1: 2, 2: 3, 3: 5, 4: 6, 5: 7 }
/** Spend points to get a spent slot of this level back. */
export function fontMakeSlot(pc: Entry, a: ActiveTrait, level: number) {
  editSheet(pc, x => {
    const b = x.spellbook ?? activeSpellbook(pc), row = b.slots[level - 1]
    if (!row || row.used < 1) return
    row.used--
    spendUse(x, pc, a, FONT_COST[level], score)
  })
}
/** Spend a slot of this level for as many points (never past the most points there can be). */
export function fontMakePoints(pc: Entry, a: ActiveTrait, row: SlotRow) {
  editSheet(pc, x => {
    const b = x.spellbook ?? activeSpellbook(pc)
    if (row.kind === 'pact') b.pact = { ...(b.pact ?? {}), used: row.used + 1 }
    else b.slots[row.level - 1].used = row.used + 1
    spendUse(x, pc, a, -row.level, score)
  })
}
