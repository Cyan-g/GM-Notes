// Items: what they do while in use (their effects, spells and charges, and when they count), what's carried and its
// weight, where an item is (the characters carrying it, the shops selling it) and what a shop asks for it.
import type { CharacterSheet, Entry, GearEffect, InventoryLine, ItemSpell, Regain, StockLine } from './model/types'
import { byType, get } from './store'
import { ord } from './model/dnd'

/** A shop's price for a line of its stock: the line's own, else the item's value times the shop's markup. */
export function shopPrice(shop: Entry, line: StockLine): number | undefined {
  const base = get(line.item)?.fields.value as number | undefined, markup = (shop.fields.markup as number | undefined) ?? 1
  return line.price ?? (base != null ? Math.round(base * markup) : undefined)
}

/** The characters carrying an item (by name): how many, and whether one is equipped or attuned. */
export const carriersOf = (item: Entry) => (byType.value.get('pc') ?? []).map(p => {
  const lines = (p.fields.sheet?.inventory ?? []).filter(l => l.item === item.id && l.qty > 0)
  return { p, qty: lines.reduce((n, l) => n + l.qty, 0), attuned: lines.some(l => l.attuned), equipped: lines.some(l => l.equipped) }
}).filter(x => x.qty)

/** The shops selling an item (by name), each with its price and how many are left. */
export const shopsSelling = (item: Entry) => (byType.value.get('place') ?? []).flatMap(s => {
  const l = ((s.fields.stock as StockLine[] | undefined) ?? []).find(x => x.item === item.id)
  return l ? [{ s, price: shopPrice(s, l), stock: l.stock }] : []
})

// ---- spellcasting focuses ----
/** The kinds of spellcasting focus an item can be (its Focus field); a class uses one of them, or a musical instrument. */
export const FOCUS_TYPES = ['Arcane focus', 'Druidic focus', 'Holy symbol'] as const
export type FocusType = (typeof FOCUS_TYPES)[number] | 'Instrument'
/** The focus types an item is (its Focus field: one or several, a quarterstaff both arcane and druidic), else a
 * musical instrument (a Bard's), else none. Any kind of item can be one, whatever else it is (a shield with an emblem). */
export function focusesOf(item: Entry | undefined): FocusType[] {
  const f = item?.fields.focus, list = Array.isArray(f) ? f : typeof f === 'string' ? [f] : []
  const out = list.filter(x => (FOCUS_TYPES as readonly string[]).includes(x)) as FocusType[]
  return out.length ? out : item?.fields.kind === 'Instrument' ? ['Instrument'] : []
}
/** The focus types an item's Focus field gives, in words for its tags ("Arcane focus, Druidic focus"). */
export const focusText = (item: Entry | undefined) => focusesOf(item).filter(x => x !== 'Instrument').join(', ')
/** A component pouch stands in for materials without a cost, like a focus, for any caster. */
export const isComponentPouch = (item: Entry | undefined) => !!item && /component pouch/i.test(item.name)
/** A spell's materials have a cost (or are used up): no focus or pouch replaces them. */
export const materialCosts = (material: unknown) => typeof material === 'string' && /\d[\d,]*\+?\s*(gp|sp|cp|pp|ep)\b|\bworth\b|\bconsume/i.test(material)
/** The focuses (and pouches) a character carries that suit the focus types given (their classes'). */
export function focusesCarried(s: CharacterSheet, types: FocusType[]): Entry[] {
  const out: Entry[] = []
  for (const l of s.inventory ?? []) {
    const e = get(l.item)
    if (!e || l.qty <= 0 || out.includes(e)) continue
    if (focusesOf(e).some(f => types.includes(f)) || isComponentPouch(e)) out.push(e)
  }
  return out
}

// ---- what an item does, and when ----
/** An item's effects. */
export const effectsOf = (e: Entry | undefined): GearEffect[] => (Array.isArray(e?.fields.effects) ? e!.fields.effects! : [])

/** A weapon or armor: worn or wielded, and equipped even if it needs attunement too. */
export const isWeaponOrArmor = (item: Entry) => ['Weapon', 'Armor'].includes(String(item.fields.kind ?? ''))
/**
 * Whether an item can be equipped or attuned at all: a weapon or armor, an item that needs attunement, or one with
 * effects, spells or charges (a ring, boots, a horn). Anything else (a flask, a pearl) counts while carried.
 */
export const isWearable = (item: Entry) => isWeaponOrArmor(item) || !!item.fields.attunement
  || !!(effectsOf(item).length || spellsOf(item).length || item.fields.charges)

/** When an item's effects and features count: what its "Works while" says, else attuned if it needs attunement,
 * equipped if it can be worn or wielded, else carried (a flask, a pearl). */
export function worksWhileOf(item: Entry): 'carried' | 'equipped' | 'attuned' {
  const w = item.fields.worksWhile
  if (w === 'carried' || w === 'equipped' || w === 'attuned') return w
  if (item.fields.attunement) return 'attuned'
  // a ring, an amulet or a cloak works while worn
  if (['Ring', 'Accessory'].includes(String(item.fields.kind ?? ''))) return 'equipped'
  return isWearable(item) ? 'equipped' : 'carried'
}
/** Whether an inventory line's item is in use, by when it works (worksWhileOf): carried while there's any left,
 * attuned once attuned, equipped once worn, wielded or attuned. */
export const inUse = (l: InventoryLine, item: Entry | undefined) => {
  if (!item) return false
  const w = worksWhileOf(item)
  return w === 'carried' ? l.qty > 0 : w === 'attuned' ? !!l.attuned : !!l.equipped || !!l.attuned
}
/** The items in use, with their place in the inventory. */
export function itemsInUse(s: CharacterSheet | undefined): { l: InventoryLine; i: number; item: Entry }[] {
  return (s?.inventory ?? []).map((l, i) => ({ l, i, item: get(l.item)! })).filter(x => inUse(x.l, x.item))
}
/** The items whose effects count now. */
export function activeGear(s: CharacterSheet | undefined): { item: Entry; effects: GearEffect[] }[] {
  return itemsInUse(s).map(x => ({ item: x.item, effects: effectsOf(x.item) })).filter(x => x.effects.length)
}

// ---- spells from items, and their charges ----
/** An item's spells. */
export const spellsOf = (e: Entry | undefined): ItemSpell[] => (Array.isArray(e?.fields.spells) ? e!.fields.spells! : [])
/** An item's charges left on one inventory line (full while never spent); undefined for an item without charges. */
export const chargesLeft = (l: InventoryLine, item: Entry | undefined) => {
  const max = Number(item?.fields.charges) || 0
  return max ? Math.max(0, Math.min(max, l.charges ?? max)) : undefined
}
/** How a spell is cast from its item, in a few words: "2 charges", "1/long rest", "at will", "prepared"; plus its level. */
export function howCast(x: ItemSpell): string {
  const how = { charges: `${x.cost ?? 1} charge${(x.cost ?? 1) === 1 ? '' : 's'}`, short: '1/short rest', long: '1/long rest', day: '1/day', atWill: 'at will', prepared: 'prepared' }[x.how] ?? x.how
  return x.level ? `${how}, at ${ord(x.level)} level` : how
}
/** One spell the character can cast from an item in use, with whether it can be cast now. */
export interface GrantedSpell { i: number; k: number; item: Entry; line: InventoryLine; spell: ItemSpell; ready: boolean; status: string }
export function grantedSpells(s: CharacterSheet | undefined): GrantedSpell[] {
  const out: GrantedSpell[] = []
  for (const { l, i, item } of itemsInUse(s)) {
    spellsOf(item).forEach((x, k) => {
      if (!get(x.spell)) return
      const left = chargesLeft(l, item)
      let ready = true, status = howCast(x)
      if (x.how === 'charges') { ready = (left ?? 0) >= (x.cost ?? 1); status += ` · ${left ?? 0} left` }
      else if (['short', 'long', 'day'].includes(x.how)) { ready = !(l.used ?? []).includes(k); if (!ready) status += ' · used' }
      out.push({ i, k, item, line: l, spell: x, ready, status })
    })
  }
  return out
}
/** Cast a spell from an item: spend its charges, or mark its use until the next rest. */
export function castFromItem(s: CharacterSheet, g: { i: number; k: number }) {
  const l = s.inventory[g.i], item = get(l?.item), x = spellsOf(item)[g.k]
  if (!l || !x) return
  if (x.how === 'charges') l.charges = Math.max(0, (chargesLeft(l, item) ?? 0) - (x.cost ?? 1))
  else if (['short', 'long', 'day'].includes(x.how)) l.used = [...new Set([...(l.used ?? []), g.k])]
}
/** Give a per-rest use back by hand. */
export function unuse(s: CharacterSheet, g: { i: number; k: number }) {
  const l = s.inventory[g.i]
  if (!l) return
  l.used = (l.used ?? []).filter(k => k !== g.k)
  if (!l.used.length) delete l.used
}
/** Set an item's charges left (clamped; full clears it). */
export function setCharges(s: CharacterSheet, i: number, n: number) {
  const l = s.inventory[i], max = Number(get(l?.item)?.fields.charges) || 0
  if (!l || !max) return
  const v = Math.max(0, Math.min(max, Math.round(n)))
  if (v === max) delete l.charges; else l.charges = v
}
/** What Dex adds to body armor's AC, by its armor type: all of it (light), up to 2 (medium), nothing (heavy). */
export function dexCap(item: Entry): number | null | undefined {
  const t = item.fields.armorType
  return t === 'Light' ? null : t === 'Medium' ? 2 : t === 'Heavy' ? undefined : null
}
/** Whether an armor item is a shield (its AC is what it adds). */
export const isShield = (item: Entry) => item.fields.kind === 'Armor' && item.fields.armorType === 'Shield'
/** An armor item's AC in words: "14 + Dex (max 2)", "16", "+2" (a shield); empty without one. */
export function armorClassText(item: Entry): string {
  const n = item.fields.armorClass
  if (typeof n !== 'number') return ''
  if (isShield(item)) return `+${n}`
  const cap = dexCap(item)
  return cap === undefined ? String(n) : `${n} + Dex${cap != null ? ` (max ${cap})` : ''}`
}
/** A written "Regains" read as an amount and a time ("1d6 + 1 at dawn"), when it reads as one. */
export function parseRegain(text: string): Regain | undefined {
  const m = text.trim().match(/^(?:regains?\s+)?(all|\d+(?:d\d+)?(?:\s*[+-]\s*\d+)?)\s*(?:charges?\s*)?(?:daily\s+)?(at dawn|at sunrise|each morning|every morning|daily|on a long rest|after a long rest|on a short rest|after a short rest)?$/i)
  if (!m) return undefined
  const w = (m[2] ?? '').toLowerCase()
  return { amount: m[1].replace(/\s+/g, ''), when: w.includes('long') ? 'long' : w.includes('short') ? 'short' : 'dawn' }
}
/** How an item's charges come back, in words: "1d6 + 1 at dawn" (its Regains), else as written. */
export function regainText(item: Entry | undefined): string {
  const r = item?.fields.regain
  if (r?.amount) return `${r.amount}${r.when ? ' ' + ({ dawn: 'at dawn', long: 'on a long rest', short: 'on a short rest', never: '(never)' } as const)[r.when] : ''}`
  return String(item?.fields.recharge ?? '')
}
/** Charges a rest gives back whose dice the player rolls: which line, the item, the dice. */
export interface RegainRoll { i: number; name: string; dice: string }
/**
 * A rest: once-per-rest item spells come back, and charges that come back on it ("at dawn" counts as a long rest).
 * A number or "all" is given back here; dice are returned for the player to roll and type in.
 */
export function restItems(s: CharacterSheet, kind: 'short' | 'long'): RegainRoll[] {
  const rolls: RegainRoll[] = []
  s.inventory.forEach((l, i) => {
    const item = get(l.item)
    if (l.used?.length) {
      l.used = l.used.filter(k => { const how = spellsOf(item)[k]?.how; return kind === 'short' ? how !== 'short' : false })
      if (!l.used.length) delete l.used
    }
    const r = item?.fields.regain, max = Number(item?.fields.charges) || 0
    if (!r?.amount || !max || l.charges == null || l.charges >= max) return
    const now = r.when === 'short' ? true : r.when === 'long' || r.when === 'dawn' ? kind === 'long' : false
    if (!now) return
    const a = r.amount.trim().toLowerCase()
    if (a === 'all') delete l.charges
    else if (/^\d+$/.test(a)) { l.charges = Math.min(max, l.charges + Number(a)); if (l.charges >= max) delete l.charges }
    else rolls.push({ i, name: item!.name, dice: r.amount.trim() })
  })
  return rolls
}

// ---- what's carried ----
/** Total weight carried, in lb. */
export const weightOf = (s: CharacterSheet) => s.inventory.reduce((n, l) => n + (Number(get(l.item)?.fields.weight) || 0) * (l.qty || 0), 0)
