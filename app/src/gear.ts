// A character's gear on the sheet: equipping into gear slots (the Ruleset's "Gear slots"; the slots themselves are in
// gearSlots.ts), swapping what's there, holding a versatile weapon in two hands, and the treasury — what the character
// keeps elsewhere, not carried, weighed or worn. Attunement stays as it is: an item that needs it only works attuned,
// and putting it in a slot attunes it too while there's an attunement slot free.
import type { CharacterSheet, InventoryLine } from './model/types'
import { get } from './store'
import { rule, ruleNumber } from './rules'
import { setInUse as rawSetInUse } from './sheetData'
import { isTwoHanded, isVersatile, pickSlot, placeGear, slotsFor, takes, type GearSlot, type PlaceLine } from './gearSlots'

/** Whether the Ruleset limits gear by slot. */
export const slotsOn = () => rule('gearSlots') === 'on'
/** Whether gear in slots weighs nothing and takes no inventory slots (the Ruleset's "Worn gear weight"). */
export const wornFree = () => slotsOn() && rule('wornWeight') === 'free'

const fieldsOf = (l: InventoryLine) => get(l.item)?.fields
/** The slots a line's item fits (none: other gear). */
export const fitsOf = (l: InventoryLine | undefined): GearSlot[] => (l ? slotsFor(fieldsOf(l)) : [])
const placeLine = (l: InventoryLine): PlaceLine | undefined => {
  if (!l.equipped) return undefined
  const f = fieldsOf(l)
  return { slot: l.slot, twoHands: l.twoHands, fits: slotsFor(f), twoHanded: isTwoHanded(f) }
}
/** Where the character's equipped lines sit (by their index in the inventory). */
export const gearPlacement = (s: CharacterSheet | undefined) => placeGear((s?.inventory ?? []).map(placeLine))
/** Equipped lines that find no free slot (worn but not counted), while gear slots are on. */
export const overflowOf = (s: CharacterSheet | undefined): Set<number> => (slotsOn() && s ? new Set(gearPlacement(s).overflow) : new Set())

/** Attune a line that needs it, while there's an attunement slot free; why not, otherwise. */
function attuneIfNeeded(s: CharacterSheet, l: InventoryLine): string {
  const e = get(l.item)
  if (!e?.fields.attunement || l.attuned) return ''
  const used = s.inventory.filter(x => x.attuned).length, max = ruleNumber('attunementSlots')
  if (used >= max) return `${e.name} is equipped but not attuned: all ${max} attunement slots are taken.`
  l.attuned = true
  return ''
}

/**
 * Equip inventory line `i`: into `target` if it fits there, else the first free slot it fits (while gear slots are
 * on). Whatever is in the way swaps to where the line came from (another slot) or goes back to the pack. An item that
 * needs attunement is attuned too (`attune`). Gives why something didn't happen ("all 3 attunement slots are taken").
 */
export function equipInto(s: CharacterSheet, i: number, target?: GearSlot, attune = true): string {
  const line = s.inventory[i]
  if (!line) return ''
  const pl: PlaceLine = { twoHands: line.twoHands, fits: fitsOf(line), twoHanded: isTwoHanded(fieldsOf(line)) }
  if (!slotsOn() || !pl.fits.length) {
    const j = rawSetInUse(s, i, 'equipped', true)
    return attune ? attuneIfNeeded(s, s.inventory[j]) : ''
  }
  const place = gearPlacement(s)
  const from = line.equipped ? place.slotOf.get(i) : undefined
  // a versatile weapon held in two hands lets go of one when it moves to the off hand
  if (target === 'off' && pl.twoHands) pl.twoHands = false
  const slot = pickSlot(pl, place.at, target, line.equipped ? i : undefined)!
  const need = takes(pl, slot)
  const occupants = [...new Set(need.map(x => place.at[x]).filter((x): x is number => x != null && x !== i))].map(k => s.inventory[k])
  let me = line
  if (!line.equipped) me = s.inventory[rawSetInUse(s, i, 'equipped', true)]
  me.slot = need.length > 1 ? 'main' : slot
  if (!pl.twoHands || me.slot !== 'main') delete me.twoHands
  for (const o of occupants) {
    // a swap: the one in the way goes where this line was, if it fits there and the line left it free
    const oPl: PlaceLine = { twoHands: o.twoHands, fits: fitsOf(o), twoHanded: isTwoHanded(fieldsOf(o)) }
    if (from && occupants.length === 1 && oPl.fits.includes(from) && takes(oPl, from).every(x => !need.includes(x))) { o.slot = from; continue }
    delete o.slot; delete o.twoHands
    rawSetInUse(s, s.inventory.indexOf(o), 'equipped', false)
  }
  return attune ? attuneIfNeeded(s, me) : ''
}

/** Take line `i` off (and end its attunement with `attuned`); back on its stack in the pack. Its new index. */
export function unequip(s: CharacterSheet, i: number, attuned = false): number {
  const l = s.inventory[i]
  if (!l) return i
  delete l.slot; delete l.twoHands
  const j = attuned ? rawSetInUse(s, i, 'attuned', false) : i
  return rawSetInUse(s, j, 'equipped', false)
}

/** The sheet's equip and attune toggles (GearToggles, the Equipped card): equipping goes through the slots. */
export function setInUse(s: CharacterSheet, i: number, key: 'equipped' | 'attuned', on: boolean): string {
  if (key === 'equipped' && on) return equipInto(s, i, undefined, false)
  if (key === 'equipped' && !on) { unequip(s, i); return '' }
  rawSetInUse(s, i, key, on)
  return ''
}

/** Whether a line's weapon can be held in two hands (a Versatile weapon in the main hand). */
export const canTwoHand = (s: CharacterSheet, i: number) => slotsOn() && isVersatile(fieldsOf(s.inventory[i])) && gearPlacement(s).slotOf.get(i) === 'main'
/** Hold a versatile weapon in two hands (what's in the off hand goes back to the pack), or in one. */
export function setTwoHands(s: CharacterSheet, i: number, on: boolean) {
  const l = s.inventory[i]
  if (!l) return
  if (!on) { delete l.twoHands; return }
  const off = gearPlacement(s).at.off
  l.twoHands = true; l.slot = 'main'
  if (off != null && off !== i) unequip(s, off)
}

// ---- the treasury ----
/** A line nothing sets apart from another of the same item (no label, note, charges or spells used). */
const plain = (l: InventoryLine) => !!l.item && !l.label && !l.note && l.charges == null && !l.used?.length && !l.equipped && !l.attuned
/** Put `qty` of line `l` onto `list`: onto a stack of the same plain item, else on a line of its own. */
function addTo(list: InventoryLine[], l: InventoryLine, qty: number): InventoryLine {
  const copy: InventoryLine = { ...l, qty }
  delete copy.equipped; delete copy.attuned; delete copy.slot; delete copy.twoHands
  const same = plain(copy) ? list.find(x => x !== l && plain(x) && x.item === copy.item) : undefined
  if (same) { same.qty += qty; return same }
  list.push(copy)
  return copy
}
/** Move `qty` (all, by default) of inventory line `i` into the treasury: taken off and out of attunement. */
export function toTreasury(s: CharacterSheet, i: number, qty?: number) {
  const l = s.inventory[i]
  if (!l) return
  const n = Math.max(1, Math.min(l.qty, qty ?? l.qty))
  addTo(s.treasury ??= [], l, n)
  if (n >= l.qty) s.inventory.splice(i, 1); else l.qty -= n
}
/** Move `qty` (all, by default) of treasury line `j` into the inventory; the inventory index it lands on. */
export function fromTreasury(s: CharacterSheet, j: number, qty?: number): number {
  const l = s.treasury?.[j]
  if (!l) return -1
  const n = Math.max(1, Math.min(l.qty, qty ?? l.qty))
  const to = addTo(s.inventory, l, n)
  if (n >= l.qty) s.treasury!.splice(j, 1); else l.qty -= n
  if (!s.treasury!.length) delete s.treasury
  return s.inventory.indexOf(to)
}
