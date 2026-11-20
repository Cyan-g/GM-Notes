// What a character's gear does to them: each item can carry effects (AC +1, STR set to 19, resistance to fire…).
// An item's effects count while it's worn or wielded, or, for an item that requires attunement, while attuned.
// The sheet's numbers add them up, and every total can say where it comes from (shown on hover).
import type { Abilities, CharacterSheet, Entry, GearEffect, Id, InventoryLine, ItemSpell } from './model/types'
import { get } from './store'
import { isHeavyStrength, requirementsOf } from './requirements'
import { ownerOf, speciesEffects } from './species'
import { activeEffectsOf, activeSpells } from './spells'
import { totalLevel } from './model/classes'

type Ability = keyof Abilities
/** One contribution to a number: what it comes from and how much. */
export interface Part { label: string; n: number }

/** What an effect needs besides a number, in the editor. */
export type EffectNeed = 'ability' | 'skill' | 'type' | 'text' | 'mode' | 'note' | 'dice' | 'proficient' | 'sense' | 'condition' | 'pb' | 'plusAbility'
/** What an effect can change, for the editor and the item card. */
export const EFFECT_KINDS: { on: GearEffect['on']; label: string; needs?: EffectNeed[]; canSet?: boolean; noValue?: boolean }[] = [
  { on: 'ac', label: 'Armor class' },
  { on: 'ability', label: 'Ability score', needs: ['ability'], canSet: true },
  { on: 'saves', label: 'All saving throws' },
  { on: 'save', label: 'One saving throw', needs: ['ability'] },
  { on: 'saveAdv', label: 'Save: advantage / disadvantage', needs: ['ability', 'mode', 'note'], noValue: true },
  { on: 'attack', label: 'Attack rolls' },
  { on: 'damage', label: 'Damage rolls' },
  { on: 'extraDamage', label: 'Extra damage (typed)', needs: ['dice', 'type', 'proficient'], noValue: true },
  { on: 'spellAttack', label: 'Spell attack' },
  { on: 'spellDC', label: 'Spell save DC' },
  { on: 'skill', label: 'A skill', needs: ['skill', 'plusAbility'] },
  { on: 'skillAdv', label: 'Skill: advantage / disadvantage', needs: ['skill', 'mode'], noValue: true },
  { on: 'speed', label: 'Speed (ft)' },
  { on: 'initiative', label: 'Initiative', needs: ['pb'] },
  { on: 'maxHp', label: 'Maximum HP' },
  { on: 'maxHpLevel', label: 'Max HP per level' },
  { on: 'hitDice', label: 'Hit Dice', needs: ['plusAbility'] },
  { on: 'resistance', label: 'Resistance', needs: ['type'], noValue: true },
  { on: 'damageImmunity', label: 'Damage immunity', needs: ['type'], noValue: true },
  { on: 'immunity', label: 'Condition immunity', needs: ['condition'], noValue: true },
  { on: 'sense', label: 'Sense (ft)', needs: ['sense'] },
  { on: 'feature', label: 'Feature', needs: ['text'], noValue: true },
]
export const SENSES = ['Darkvision', 'Blindsight', 'Tremorsense', 'Truesight']
const MODE: Record<string, string> = { adv: 'Advantage', dis: 'Disadvantage' }
const ABILITY_SHORT: Record<string, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' }
const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`)

/**
 * A list of effects in a few words each, with the same advantage on every saving throw said once ("Advantage on
 * all saves against spells and magical effects" for Magic Resistance's six).
 */
export function describeEffects(list: GearEffect[]): string[] {
  const out: string[] = [], done = new Set<GearEffect>()
  for (const f of list) {
    if (done.has(f)) continue
    if (f.on === 'saveAdv') {
      const same = list.filter(x => x.on === 'saveAdv' && x.mode === f.mode && (x.note ?? '') === (f.note ?? ''))
      if (new Set(same.map(x => x.ability)).size === 6) {
        same.forEach(x => done.add(x))
        out.push(`${MODE[f.mode ?? 'adv']} on all saves${f.note ? ' ' + f.note : ''}`)
        continue
      }
    }
    out.push(describeEffect(f))
  }
  return out
}
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
    case 'skill': return f.ability ? `${v ? signed(v) + ' and ' : '+'}${ABILITY_SHORT[f.ability]} modifier (at least 1) to ${f.skill ?? 'a skill'}` : `${signed(v)} ${f.skill ?? 'skill'}`
    case 'speed': return `${signed(v)} ft speed`
    case 'initiative': return f.pb ? `${v ? signed(v) + ' and ' : '+'}proficiency bonus to initiative` : `${signed(v)} initiative`
    case 'maxHp': return `${signed(v)} max HP`
    case 'maxHpLevel': return `${signed(v)} max HP per level`
    case 'hitDice': return `${[v ? signed(v) : '', f.ability ? `+${ABILITY_SHORT[f.ability]} modifier (at least 1)` : ''].filter(Boolean).join(' ') || '+0'} Hit Dice`
    case 'resistance': return `Resistance: ${(f.type ?? '').toLowerCase()}`
    case 'damageImmunity': return `Immune: ${(f.type ?? '').toLowerCase()} damage`
    case 'skillAdv': return `${MODE[f.mode ?? 'adv']} on ${f.skill ?? 'a skill'}`
    case 'saveAdv': return `${MODE[f.mode ?? 'adv']} on ${ABILITY_SHORT[f.ability ?? ''] ?? '?'} saves${f.note ? ' ' + f.note : ''}`
    case 'extraDamage': return `+${f.dice || '?'} ${(f.type ?? '').toLowerCase()} damage${f.proficient ? ' (if proficient)' : ''}`.replace('  ', ' ')
    case 'sense': return `${f.sense ?? 'Darkvision'} ${v} ft`
    case 'immunity': return `Immune: ${(f.condition ?? '').toLowerCase()}`
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

export interface Extra { dice: string; type?: string; proficient?: boolean; from: string }
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
  /** More Hit Dice: a number, plus an ability's modifier (at least 1) where it says. */
  hitDice: { label: string; n: number; ability?: Ability }[]
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
  /** Advantage or disadvantage on a skill or a save (with when, for a save). */
  skillAdv: Record<string, { mode: 'adv' | 'dis'; from: string }[]>
  saveAdv: Partial<Record<Ability, { mode: 'adv' | 'dis'; note?: string; from: string }[]>>
  /** Typed extra damage, for one weapon's attacks or every attack. */
  extraOf: Record<Id, Extra[]>
  extraAll: Extra[]
  senses: { sense: string; range: number; from: string }[]
  immunities: { condition: string; from: string }[]
  damageImmunities: { type: string; from: string }[]
}

/**
 * Everything the active gear and the character's species traits (species.ts) add up to. A weapon's attack and damage
 * bonuses count for that weapon only.
 */
export function gearTotals(s: CharacterSheet | undefined): GearTotals {
  const t: GearTotals = {
    setAbility: {}, forceAbility: {}, addAbility: {}, save: {}, saves: [], skill: {}, ac: [], speed: [], initiative: [], hitDice: [], maxHp: [], spellAttack: [], spellDC: [],
    attackAll: [], damageAll: [], attackOf: {}, damageOf: {}, resistances: [], features: [],
    skillAdv: {}, saveAdv: {}, extraOf: {}, extraAll: [], senses: [], immunities: [], damageImmunities: [],
  }
  const pc = ownerOf(s)
  const level = pc ? totalLevel(pc) : 1
  const sources = [
    ...activeGear(s).map(({ item, effects }) => ({ item, name: item.name, isWeapon: item.fields.kind === 'Weapon', effects })),
    ...speciesEffects(pc, s).map(x => ({ item: { id: '' } as Entry, name: x.name, isWeapon: false, effects: x.effects })),
    // spells switched on (Bless, Shield of Faith), while they last
    ...activeSpells(s).map(e => ({ item: { id: '' } as Entry, name: e.name, isWeapon: false, effects: activeEffectsOf(e) })),
  ]
  /** Parts that add an ability's modifier too (Sanguine expert), worked out once every ability effect is counted. */
  const plusMod: { part: Part; ability: Ability }[] = []
  for (const { item, name, isWeapon, effects } of sources) {
    for (const f of effects) {
      const n = Number(f.value) || 0
      const p = { label: name, n }
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
        case 'skill': if (f.skill) { (t.skill[f.skill] ??= []).push(p); if (f.ability) plusMod.push({ part: p, ability: f.ability }) } break
        case 'attack': if (isWeapon) (t.attackOf[item.id] ??= []).push(p); else t.attackAll.push(p); break
        case 'damage': if (isWeapon) (t.damageOf[item.id] ??= []).push(p); else t.damageAll.push(p); break
        case 'spellAttack': t.spellAttack.push(p); break
        case 'spellDC': t.spellDC.push(p); break
        case 'speed': t.speed.push(p); break
        case 'initiative': t.initiative.push(f.pb ? { label: name, n: n + 2 + Math.floor((Math.max(1, level) - 1) / 4) } : p); break
        case 'maxHp': t.maxHp.push(p); break
        case 'hitDice': t.hitDice.push({ label: name, n, ...(f.ability ? { ability: f.ability } : {}) }); break
        case 'maxHpLevel': t.maxHp.push({ label: `${name} (${n} × level ${level})`, n: n * level }); break
        case 'resistance': if (f.type) t.resistances.push({ type: f.type, from: name }); break
        case 'damageImmunity': if (f.type) t.damageImmunities.push({ type: f.type, from: name }); break
        case 'feature': if (f.text?.trim()) t.features.push({ text: f.text.trim(), from: name }); break
        case 'skillAdv': if (f.skill) (t.skillAdv[f.skill] ??= []).push({ mode: f.mode ?? 'adv', from: name }); break
        case 'saveAdv': if (f.ability) (t.saveAdv[f.ability] ??= []).push({ mode: f.mode ?? 'adv', note: f.note, from: name }); break
        case 'extraDamage': {
          if (!f.dice?.trim()) break
          const x = { dice: f.dice.trim(), type: f.type, proficient: f.proficient, from: name }
          if (isWeapon) (t.extraOf[item.id] ??= []).push(x); else t.extraAll.push(x)
          break
        }
        case 'sense': {
          // the same sense twice (Darkvision 60 ft, then 120 ft from a lineage): the longer range counts
          const sense = f.sense ?? 'Darkvision', had = t.senses.find(x => x.sense === sense)
          if (!had) t.senses.push({ sense, range: n, from: name })
          else if (n > had.range) Object.assign(had, { range: n, from: name })
          break
        }
        case 'immunity': if (f.condition) t.immunities.push({ condition: f.condition, from: name }); break
      }
    }
  }
  for (const { part, ability } of plusMod) part.n += Math.max(1, Math.floor((scoreWith(s!, ability, t) - 10) / 2))
  // Heavy armor worn without its Strength: −10 ft speed (5e).
  for (const { item } of itemsInUse(s)) {
    for (const x of requirementsOf(item)?.scores ?? []) {
      if (isHeavyStrength(item, x.ability) && scoreWith(s!, 'str', t) < x.min) t.speed.push({ label: `${item.name} (needs STR ${x.min})`, n: -10 })
    }
  }
  return t
}

/** Advantage and disadvantage cancel out: 'adv', 'dis' or nothing, with where each comes from. */
export function advOf(l: { mode: 'adv' | 'dis'; note?: string; from: string }[] | undefined): { mode?: 'adv' | 'dis'; tip?: string } {
  if (!l?.length) return {}
  const adv = l.some(x => x.mode === 'adv'), dis = l.some(x => x.mode === 'dis')
  const tip = l.map(x => `${MODE[x.mode]}${x.note ? ' ' + x.note : ''} · ${x.from}`).join('\n')
  return { mode: adv && dis ? undefined : adv ? 'adv' : 'dis', tip: adv && dis ? tip + '\n(they cancel out)' : tip }
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
