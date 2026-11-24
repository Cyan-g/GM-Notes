// Gear slots (the Ruleset's "Gear slots"): what a character can wear and wield at once, by slot — two hands, body
// armor, head, cloak, hands, feet. Which slots an item fits comes from its own fields (a weapon or a shield: either
// hand, a shield the off hand first; other armor: its Slot, else its armor type); anything else (rings, amulets, accessories) is "other gear", unlimited. An equipped
// line may say its slot; one that doesn't (equipped before the rule, or by a button) is placed in the first free slot
// it fits. A Two-Handed weapon, or a Versatile one held in two hands, fills both hands.
// No vue or store here: tests import it directly.

export type GearSlot = 'main' | 'off' | 'body' | 'head' | 'cloak' | 'hands' | 'feet'
export const GEAR_SLOTS: { id: GearSlot; label: string }[] = [
  { id: 'main', label: 'Main hand' }, { id: 'off', label: 'Off hand' }, { id: 'body', label: 'Body' }, { id: 'head', label: 'Head' },
  { id: 'cloak', label: 'Cloak' }, { id: 'hands', label: 'Hands' }, { id: 'feet', label: 'Feet' },
]
export const slotLabel = (id: GearSlot) => GEAR_SLOTS.find(x => x.id === id)?.label ?? id

/** The item fields slots are read from. */
export interface SlotFields { kind?: unknown; slot?: unknown; armorType?: unknown; properties?: unknown }
const ARMOR_SLOT: Record<string, GearSlot> = { Chest: 'body', Head: 'head', Cloak: 'cloak', Gloves: 'hands', Boots: 'feet' }
const props = (f: SlotFields) => (Array.isArray(f.properties) ? f.properties.map(p => String(p).toLowerCase()) : [])

/** The slots an item fits, best first (a weapon: the main hand, then the off hand); none for other gear. */
export function slotsFor(f: SlotFields | undefined): GearSlot[] {
  if (!f) return []
  if (f.kind === 'Weapon') return ['main', 'off']
  if (f.kind !== 'Armor') return []
  // a shield is held: in either hand, the off hand first
  if (f.armorType === 'Shield' || f.slot === 'Shield') return ['off', 'main']
  const s = ARMOR_SLOT[String(f.slot ?? '')]
  if (s) return [s]
  return ['Light', 'Medium', 'Heavy'].includes(String(f.armorType ?? '')) ? ['body'] : []
}
export const isTwoHanded = (f: SlotFields | undefined) => !!f && f.kind === 'Weapon' && props(f).includes('two-handed')
export const isVersatile = (f: SlotFields | undefined) => !!f && f.kind === 'Weapon' && props(f).includes('versatile')

/** An equipped line as placing sees it. */
export interface PlaceLine { slot?: GearSlot; twoHands?: boolean; fits: GearSlot[]; twoHanded: boolean }
/** Whether a line fills both hands: a Two-Handed weapon, or a Versatile one held in two hands. */
export const bothHands = (l: Pick<PlaceLine, 'twoHanded' | 'twoHands'>) => l.twoHanded || !!l.twoHands
/** The slots a line takes when it's in `slot`. */
export const takes = (l: Pick<PlaceLine, 'twoHanded' | 'twoHands'>, slot: GearSlot): GearSlot[] =>
  (slot === 'main' || slot === 'off') && bothHands(l) ? ['main', 'off'] : [slot]

/**
 * Where each equipped line sits: lines that say their slot first (if it fits and is free), then the others in the
 * first free slot they fit. `at` gives each slot's line (a two-handed weapon is in both hands); `overflow` the lines
 * that fit a slot but find none free (worn but not counted: "2 weapons, 1 free hand"); `other` the lines that fit no
 * slot (rings, amulets), which aren't limited.
 */
export function placeGear(lines: (PlaceLine | undefined)[]): { at: Partial<Record<GearSlot, number>>; slotOf: Map<number, GearSlot>; overflow: number[]; other: number[] } {
  const at: Partial<Record<GearSlot, number>> = {}, slotOf = new Map<number, GearSlot>(), overflow: number[] = [], other: number[] = []
  const free = (l: PlaceLine, s: GearSlot) => takes(l, s).every(x => at[x] == null)
  const put = (i: number, l: PlaceLine, s: GearSlot) => {
    // a weapon in both hands sits in the main hand
    const where = takes(l, s).length > 1 ? 'main' : s
    for (const x of takes(l, s)) at[x] = i
    slotOf.set(i, where)
  }
  const waiting: number[] = []
  lines.forEach((l, i) => {
    if (!l) return
    if (!l.fits.length) { other.push(i); return }
    if (l.slot && l.fits.includes(l.slot) && free(l, l.slot)) put(i, l, l.slot)
    else waiting.push(i)
  })
  for (const i of waiting) {
    const l = lines[i]!, s = l.fits.find(x => free(l, x))
    if (s) put(i, l, s); else overflow.push(i)
  }
  return { at, slotOf, overflow, other }
}

/**
 * Where a line should go: `target` if it fits, else the first free slot it fits, else its first slot (its occupant
 * makes way). Undefined for a line that fits no slot.
 */
export function pickSlot(l: PlaceLine, at: Partial<Record<GearSlot, number>>, target?: GearSlot, self?: number): GearSlot | undefined {
  if (!l.fits.length) return undefined
  if (target && l.fits.includes(target)) return target
  const free = (s: GearSlot) => takes(l, s).every(x => at[x] == null || at[x] === self)
  return l.fits.find(free) ?? l.fits[0]
}
