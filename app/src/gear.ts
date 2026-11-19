// What a character's gear does to them: each item can carry effects (AC +1, STR set to 19, resistance to fire…).
// An item's effects count while it's worn or wielded, or, for an item that requires attunement, while attuned.
// The sheet's numbers add them up, and every total can say where it comes from (shown on hover).
import type { Abilities, CharacterSheet, Entry, GearEffect, Id, InventoryLine, ItemSpell } from './model/types'
import { get } from './store'

type Ability = keyof Abilities
/** One contribution to a number: what it comes from and how much. */
export interface Part { label: string; n: number }

/** What an effect can change, for the editor and the item card. */
export const EFFECT_KINDS: { on: GearEffect['on']; label: string; needs?: 'ability' | 'skill' | 'type' | 'text'; canSet?: boolean; noValue?: boolean }[] = [
  { on: 'ac', label: 'Armor class' },
  { on: 'ability', label: 'Ability score', needs: 'ability', canSet: true },
  { on: 'saves', label: 'All saving throws' },
  { on: 'save', label: 'One saving throw', needs: 'ability' },
  { on: 'attack', label: 'Attack rolls' },
  { on: 'damage', label: 'Damage rolls' },
  { on: 'spellAttack', label: 'Spell attack' },
  { on: 'spellDC', label: 'Spell save DC' },
  { on: 'skill', label: 'A skill', needs: 'skill' },
  { on: 'speed', label: 'Speed (ft)' },
  { on: 'initiative', label: 'Initiative' },
  { on: 'maxHp', label: 'Maximum HP' },
  { on: 'resistance', label: 'Resistance', needs: 'type', noValue: true },
  { on: 'feature', label: 'Feature', needs: 'text', noValue: true },
]
const ABILITY_SHORT: Record<string, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' }
const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`)

/** An effect in a few words: "+1 AC", "STR 19", "Resistance: fire", "+2 Stealth". */
export function describeEffect(f: GearEffect): string {
  const v = Number(f.value) || 0
  switch (f.on) {
    case 'ac': return `${signed(v)} AC`
    case 'ability': return f.force ? `${ABILITY_SHORT[f.ability ?? ''] ?? '?'} becomes ${v}` : f.set ? `${ABILITY_SHORT[f.ability ?? ''] ?? '?'} ${v}` : `${signed(v)} ${ABILITY_SHORT[f.ability ?? ''] ?? '?'}`
    case 'saves': return `${signed(v)} to saving throws`
    case 'save': return `${signed(v)} to ${ABILITY_SHORT[f.ability ?? ''] ?? '?'} saves`
    case 'attack': return `${signed(v)} to hit`
    case 'damage': return `${signed(v)} damage`
    case 'spellAttack': return `${signed(v)} spell attack`
    case 'spellDC': return `${signed(v)} spell save DC`
    case 'skill': return `${signed(v)} ${f.skill ?? 'skill'}`
    case 'speed': return `${signed(v)} ft speed`
    case 'initiative': return `${signed(v)} initiative`
    case 'maxHp': return `${signed(v)} max HP`
    case 'resistance': return `Resistance: ${(f.type ?? '').toLowerCase()}`
    case 'feature': return f.text ?? ''
  }
}

/** An item's effects. */
export const effectsOf = (e: Entry | undefined): GearEffect[] => (Array.isArray(e?.fields.effects) ? e!.fields.effects! : [])

/** Whether an inventory line's item is in use: worn or wielded, or attuned when it requires attunement. */
export const inUse = (l: InventoryLine, item: Entry | undefined) => !!item && (item.fields.attunement ? !!l.attuned : !!l.equipped)
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
const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']
/** How a spell is cast from its item, in a few words: "2 charges", "1/long rest", "at will", "prepared"; plus its level. */
export function howCast(x: ItemSpell): string {
  const how = { charges: `${x.cost ?? 1} charge${(x.cost ?? 1) === 1 ? '' : 's'}`, short: '1/short rest', long: '1/long rest', day: '1/day', atWill: 'at will', prepared: 'prepared' }[x.how] ?? x.how
  return x.level ? `${how}, at ${ORD[x.level] ?? x.level + 'th'} level` : how
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
/** A rest gives back the item spells used since: a short rest the short-rest ones, a long rest all of them. */
export function restItems(s: CharacterSheet, kind: 'short' | 'long') {
  for (const l of s.inventory) {
    if (!l.used?.length) continue
    const item = get(l.item)
    l.used = l.used.filter(k => { const how = spellsOf(item)[k]?.how; return kind === 'short' ? how !== 'short' : false })
    if (!l.used.length) delete l.used
  }
}

export interface GearTotals {
  /** An ability score raised to a value (the highest, if several), forced to one (the lowest), and what's added. */
  setAbility: Partial<Record<Ability, Part>>
  forceAbility: Partial<Record<Ability, Part>>
  addAbility: Partial<Record<Ability, Part[]>>
  save: Partial<Record<Ability, Part[]>>
  saves: Part[]
  skill: Record<string, Part[]>
  ac: Part[]
  speed: Part[]
  initiative: Part[]
  maxHp: Part[]
  spellAttack: Part[]
  spellDC: Part[]
  /** Attack and damage bonuses for every attack, and for one weapon's own attacks. */
  attackAll: Part[]
  damageAll: Part[]
  attackOf: Record<Id, Part[]>
  damageOf: Record<Id, Part[]>
  resistances: { type: string; from: string }[]
  features: { text: string; from: string }[]
}

/** Everything the active gear adds up to. A weapon's attack and damage bonuses count for that weapon only. */
export function gearTotals(s: CharacterSheet | undefined): GearTotals {
  const t: GearTotals = {
    setAbility: {}, forceAbility: {}, addAbility: {}, save: {}, saves: [], skill: {}, ac: [], speed: [], initiative: [], maxHp: [], spellAttack: [], spellDC: [],
    attackAll: [], damageAll: [], attackOf: {}, damageOf: {}, resistances: [], features: [],
  }
  for (const { item, effects } of activeGear(s)) {
    const isWeapon = item.fields.kind === 'Weapon'
    for (const f of effects) {
      const n = Number(f.value) || 0
      const p = { label: item.name, n }
      switch (f.on) {
        case 'ac': t.ac.push(p); break
        case 'ability':
          if (!f.ability) break
          if (f.force) { if (!t.forceAbility[f.ability] || n < t.forceAbility[f.ability]!.n) t.forceAbility[f.ability] = p }
          else if (f.set) { if (!t.setAbility[f.ability] || n > t.setAbility[f.ability]!.n) t.setAbility[f.ability] = p }
          else (t.addAbility[f.ability] ??= []).push(p)
          break
        case 'saves': t.saves.push(p); break
        case 'save': if (f.ability) (t.save[f.ability] ??= []).push(p); break
        case 'skill': if (f.skill) (t.skill[f.skill] ??= []).push(p); break
        case 'attack': if (isWeapon) (t.attackOf[item.id] ??= []).push(p); else t.attackAll.push(p); break
        case 'damage': if (isWeapon) (t.damageOf[item.id] ??= []).push(p); else t.damageAll.push(p); break
        case 'spellAttack': t.spellAttack.push(p); break
        case 'spellDC': t.spellDC.push(p); break
        case 'speed': t.speed.push(p); break
        case 'initiative': t.initiative.push(p); break
        case 'maxHp': t.maxHp.push(p); break
        case 'resistance': if (f.type) t.resistances.push({ type: f.type, from: item.name }); break
        case 'feature': if (f.text?.trim()) t.features.push({ text: f.text.trim(), from: item.name }); break
      }
    }
  }
  return t
}

export const sum = (parts: Part[] | undefined) => (parts ?? []).reduce((n, p) => n + p.n, 0)
/** "16 base · +1 Ring of Protection" for a tooltip; nothing when no gear changes it. */
export const breakdown = (base: string, parts: Part[] | undefined) =>
  parts?.length ? [base, ...parts.map(p => `${signed(p.n)} ${p.label}`)].join(' · ') : undefined

/** An ability score with gear: forced to a value (a curse), or else raised to one if that's higher; then anything added. */
export function scoreWith(s: CharacterSheet, a: Ability, t: GearTotals): number {
  const base = s.abilities[a] ?? 10
  const force = t.forceAbility[a], set = t.setAbility[a]
  return (force ? force.n : Math.max(base, set?.n ?? 0)) + sum(t.addAbility[a])
}
/** Where a changed ability score comes from, for its tooltip. */
export function scoreBreakdown(s: CharacterSheet, a: Ability, t: GearTotals): string | undefined {
  const set = t.setAbility[a], force = t.forceAbility[a], add = t.addAbility[a]
  if (!set && !force && !add?.length) return undefined
  const base = s.abilities[a] ?? 10
  const start = force ? `${force.n} from ${force.label} (own score ${base})`
    : set && set.n > base ? `${set.n} from ${set.label} (own score ${base})` : `${base} own score`
  return breakdown(start, add) ?? start
}
