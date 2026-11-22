// A character's sheet as stored on their PC entry (fields.sheet): read with its defaults filled in, or completed for
// changing; which character a sheet object belongs to; and the small changes made to it from many places (the
// proficiency lists, the inventory). The numbers worked out from a sheet are in sheet.ts.
import type { CharacterSheet, Entry, Id, Proficiencies, Spellbook } from './model/types'
import { state } from './store'
import { changed } from './edit'

// ---- whose sheet is this? (the totals only get a sheet; each sheet handed out here is registered) ----
const OWNER = new WeakMap<object, Entry>()
/** Remember which character a sheet object belongs to. */
export function own<T extends object>(s: T, pc: Entry): T { OWNER.set(s, pc); return s }
/** The character a sheet belongs to, if known. */
export const ownerOf = (s: object | undefined) => (s ? OWNER.get(s) : undefined)

// ---- the sheet ----
/** A sheet with nothing filled in: every score 10, no proficiencies, nothing carried. */
export const blankSheet = (): CharacterSheet => ({
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  saves: [], skills: {}, inventory: [], features: [],
})
/** A PC's sheet for reading, with anything never filled in at its default. */
export const sheetOf = (pc: Entry): CharacterSheet | undefined =>
  pc.fields.sheet ? own({ ...blankSheet(), ...(pc.fields.sheet) }, pc) : undefined
/** A PC's sheet for reading, blank if never filled in: still theirs, so their species and classes count on it. */
export const sheetOrBlank = (pc: Entry): CharacterSheet => sheetOf(pc) ?? own(blankSheet(), pc)
/** What's done to a sheet before any change (sheet.ts: note the CON max HP was made with). */
let beforeEdit: ((s: CharacterSheet) => void) | undefined
export const onSheetEdit = (fn: (s: CharacterSheet) => void) => { beforeEdit = fn }
/** A PC's stored sheet for changing: created, or completed, as needed. */
export function sheetToEdit(pc: Entry): CharacterSheet {
  const s = (pc.fields.sheet ??= {} as CharacterSheet) as Partial<CharacterSheet>
  const blank = blankSheet() as unknown as Record<string, unknown>
  for (const k of ['abilities', 'saves', 'skills', 'inventory', 'features']) if ((s as Record<string, unknown>)[k] == null) (s as Record<string, unknown>)[k] = blank[k]
  const out = own(s as CharacterSheet, pc)
  beforeEdit?.(out)
  return out
}

// ---- proficiencies ----
export const blankProfs = (): Proficiencies => ({ armor: [], weapons: [], tools: [], languages: [] })
/** A sheet's stored proficiencies for changing. */
export function profsToEdit(s: CharacterSheet): Proficiencies {
  const p = (s.proficiencies ??= blankProfs())
  for (const k of ['armor', 'weapons', 'tools', 'languages'] as const) p[k] ??= []
  return p
}

/** A spellbook with nothing in it: no slots at any of the nine levels, no spells. */
export const emptyBook = (): Spellbook => ({ slots: Array.from({ length: 9 }, () => ({ max: 0, used: 0 })), known: [], prepared: [], always: [] })

// ---- changing it ----
/** Change a PC's sheet and mark the PC as changed (nothing happens in a tab that doesn't save). */
export function editSheet(pc: Entry, fn: (s: CharacterSheet) => void) {
  if (state.readOnly) return
  fn(sheetToEdit(pc))
  changed(pc)
}

/**
 * Put n of an item in a sheet's inventory: onto a line of that item that isn't equipped (an equipped one stays as
 * it is), else as a new line. A negative n takes some off that line instead, and never adds one.
 */
export function stackItem(s: CharacterSheet, id: Id, n: number) {
  const l = s.inventory.find(x => x.item === id && !x.equipped)
  if (l) l.qty = (l.qty || 0) + n
  else if (n > 0) s.inventory.push({ item: id, qty: n })
}
/** Give a character n of an item (one by default), stacked as stackItem says. */
export const addToInventory = (pc: Entry, id: Id, n = 1) => editSheet(pc, s => stackItem(s, id, n))
