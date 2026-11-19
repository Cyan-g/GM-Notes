// What a character's gear does to them: each item can carry effects (AC +1, STR set to 19, resistance to fire…).
// An item's effects count while it's worn or wielded, or, for an item that requires attunement, while attuned.
// The sheet's numbers add them up, and every total can say where it comes from (shown on hover).
import type { Abilities, CharacterSheet, Entry, GearEffect, Id } from './model/types'
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
    case 'ability': return f.set ? `${ABILITY_SHORT[f.ability ?? ''] ?? '?'} ${v}` : `${signed(v)} ${ABILITY_SHORT[f.ability ?? ''] ?? '?'}`
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

/** The items whose effects count now: worn or wielded, or attuned when they require attunement. */
export function activeGear(s: CharacterSheet | undefined): { item: Entry; effects: GearEffect[] }[] {
  const out: { item: Entry; effects: GearEffect[] }[] = []
  for (const l of s?.inventory ?? []) {
    const item = get(l.item)
    const effects = effectsOf(item)
    if (!item || !effects.length) continue
    if (item.fields.attunement ? l.attuned : l.equipped) out.push({ item, effects })
  }
  return out
}

export interface GearTotals {
  /** An ability score set to a value (the highest, if several), and what's added. */
  setAbility: Partial<Record<Ability, Part>>
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
    setAbility: {}, addAbility: {}, save: {}, saves: [], skill: {}, ac: [], speed: [], initiative: [], maxHp: [], spellAttack: [], spellDC: [],
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
          if (f.set) { if (!t.setAbility[f.ability] || n > t.setAbility[f.ability]!.n) t.setAbility[f.ability] = p }
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

/** An ability score with gear: set to a value if that's higher, then anything added. */
export function scoreWith(s: CharacterSheet, a: Ability, t: GearTotals): number {
  const base = s.abilities[a] ?? 10
  const set = t.setAbility[a]
  return Math.max(base, set?.n ?? 0) + sum(t.addAbility[a])
}
/** Where a changed ability score comes from, for its tooltip. */
export function scoreBreakdown(s: CharacterSheet, a: Ability, t: GearTotals): string | undefined {
  const set = t.setAbility[a], add = t.addAbility[a]
  if (!set && !add?.length) return undefined
  const base = s.abilities[a] ?? 10
  const start = set && set.n > base ? `${set.n} from ${set.label} (own score ${base})` : `${base} own score`
  return breakdown(start, add) ?? start
}
