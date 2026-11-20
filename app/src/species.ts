// What a character's species gives them: the traits of their race and of the races it's a subrace of (a Hill Dwarf
// has the Dwarf's traits and its own). A trait can carry effects like gear (darkvision, resistances, advantage on
// saves, max HP per level…), grant proficiencies and languages, give spells, have uses that come back on a rest,
// and ask the player to choose (skills, a language, or one of several options such as an elven lineage). Traits count
// from their level on. The sheet's totals (gear.ts) add the effects; the picks and spent uses live on the sheet.
import type { CharacterSheet, Entry, GearEffect, Id, SpeciesState, Trait, TraitGrant, TraitOption, TraitSpell } from './model/types'
import { totalLevel } from './model/classes'
import { get, listOptions, state } from './store'
import { SKILLS } from './sheet'

// ---- whose sheet is this? (the totals only get a sheet; sheet.ts registers each sheet it hands out) ----
const OWNER = new WeakMap<object, Entry>()
/** Remember which character a sheet object belongs to. */
export function own<T extends object>(s: T, pc: Entry): T { OWNER.set(s, pc); return s }
/** The character a sheet belongs to, if known. */
export const ownerOf = (s: object | undefined) => (s ? OWNER.get(s) : undefined)

/** A trait's key on a character: the race it comes from and its id. */
export const traitKey = (race: Entry, t: Trait) => `${race.id}.${t.id}`
export const traitsOf = (race: Entry | undefined): Trait[] =>
  Array.isArray(race?.fields.speciesTraits) ? race!.fields.speciesTraits!.filter(t => t && typeof t === 'object') : []

/** The character's race and the races it's a subrace of, the main race first. */
export function lineage(pc: Entry | undefined): Entry[] {
  const out: Entry[] = []
  let r = get(pc?.fields.race as Id | undefined)
  while (r && r.type === 'race' && !out.includes(r)) { out.unshift(r); r = get(r.fields.parent as Id | undefined) }
  return out
}

const pb = (level: number) => 2 + Math.floor((Math.max(1, level) - 1) / 4)
export const stateOf = (s: CharacterSheet | undefined): SpeciesState => s?.species ?? {}

export interface ActiveTrait {
  key: string
  trait: Trait
  race: Entry
  /** Whether the character has reached the trait's level. */
  active: boolean
  /** The chosen option of an option choice. */
  option?: TraitOption
  /** The picks of a choice. */
  picks: string[]
}
/** Every trait of the character's species, in order (main race first), with what's chosen and whether it counts yet. */
export function speciesTraits(pc: Entry | undefined, s?: CharacterSheet): ActiveTrait[] {
  if (!pc) return []
  const level = totalLevel(pc)
  const st = stateOf(s ?? (pc.fields.sheet as CharacterSheet | undefined))
  return lineage(pc).flatMap(race => traitsOf(race).map(trait => {
    const key = traitKey(race, trait)
    const picks = st.picks?.[key] ?? []
    const option = trait.choice?.kind === 'option' ? trait.choice.options?.find(o => o.id === picks[0]) : undefined
    return { key, trait, race, active: (trait.level ?? 1) <= level, option, picks }
  }))
}
const active = (pc: Entry | undefined, s?: CharacterSheet) => speciesTraits(pc, s).filter(a => a.active)

/** The effects that count, each with what it comes from (the trait, or the chosen option). */
export function speciesEffects(pc: Entry | undefined, s?: CharacterSheet): { name: string; effects: GearEffect[] }[] {
  return active(pc, s).flatMap(a => [
    { name: a.trait.name, effects: a.trait.effects ?? [] },
    ...(a.option ? [{ name: a.option.name, effects: a.option.effects ?? [] }] : []),
  ]).filter(x => x.effects.length)
}

/** A language's option id for a name ("Common" → its id in the language list), else the name itself. */
function languageId(name: string): string {
  const n = name.trim().toLowerCase()
  return listOptions('language').find(o => o.id.toLowerCase() === n || o.label.toLowerCase() === n)?.id ?? name.trim()
}

/** Everything granted: proficiencies, languages (the race's own list too) and the player's picks, with where from. */
export function speciesGrants(pc: Entry | undefined, s?: CharacterSheet): (TraitGrant & { from: string })[] {
  if (!pc) return []
  const out: (TraitGrant & { from: string })[] = []
  for (const race of lineage(pc)) {
    for (const l of (race.fields.languages as string[] | undefined) ?? []) if (l.trim()) out.push({ kind: 'language', id: languageId(l), from: race.name })
  }
  for (const a of active(pc, s)) {
    for (const g of a.trait.grants ?? []) out.push({ ...g, from: a.trait.name })
    for (const g of a.option?.grants ?? []) out.push({ ...g, from: a.option!.name })
    const k = a.trait.choice?.kind
    if (k && k !== 'option') for (const id of a.picks) out.push({ kind: k, id, from: a.trait.name })
  }
  return out
}
/** The skills a species makes the character proficient in. */
export const speciesSkills = (pc: Entry | undefined, s?: CharacterSheet) =>
  new Set(speciesGrants(pc, s).filter(g => g.kind === 'skill').map(g => g.id))

/** The species' speed in feet (the subrace's, else the main race's), if one says. */
export function speciesSpeed(pc: Entry | undefined): number | undefined {
  for (const r of [...lineage(pc)].reverse()) { const m = String(r.fields.speed ?? '').match(/(\d+)/); if (m) return Number(m[1]) }
  return undefined
}
export function speciesSize(pc: Entry | undefined): string | undefined {
  for (const r of [...lineage(pc)].reverse()) if (r.fields.size) return String(r.fields.size)
  return undefined
}

// ---- uses ----
/** How many uses a trait has at the character's level; 0 when it has none. */
export function usesMax(pc: Entry, t: Trait): number {
  const u = t.uses
  if (!u) return 0
  return u.count === 'pb' ? pb(totalLevel(pc)) : Math.max(0, Number(u.count) || 0)
}
export const usesLeft = (pc: Entry, s: CharacterSheet | undefined, a: ActiveTrait) =>
  Math.max(0, usesMax(pc, a.trait) - (stateOf(s).used?.[a.key] ?? 0))
function edit(s: CharacterSheet): SpeciesState { return (s.species ??= {}) }
/** Spend one use (n = −1 gives one back). */
export function spendUse(s: CharacterSheet, pc: Entry, a: ActiveTrait, n = 1) {
  const st = edit(s), used = { ...(st.used ?? {}) }
  used[a.key] = Math.max(0, Math.min(usesMax(pc, a.trait), (used[a.key] ?? 0) + n))
  if (!used[a.key]) delete used[a.key]
  st.used = used
}

// ---- choices ----
/** Set the picks of a trait's choice (an empty list clears it). */
export function setPicks(s: CharacterSheet, key: string, picks: string[]) {
  const st = edit(s), all = { ...(st.picks ?? {}) }
  if (picks.length) all[key] = picks; else delete all[key]
  st.picks = all
}
/** Whether a trait's choice still waits for the player. */
export const choiceOpen = (a: ActiveTrait) =>
  !!a.trait.choice && (a.trait.choice.kind === 'option' ? !a.option : a.picks.length < (a.trait.choice.count ?? 1))

// ---- spells ----
const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']
export const HOW_SPECIES: Record<TraitSpell['how'], string> = { atWill: 'at will', short: '1/short rest', long: '1/long rest', prepared: 'always prepared' }
export interface SpeciesSpell { key: string; spell: TraitSpell; from: string; ready: boolean; status: string; level: number }
/** The spells the species gives at the character's level, with whether a once-per-rest one can be cast now. */
export function speciesSpells(pc: Entry | undefined, s?: CharacterSheet): SpeciesSpell[] {
  if (!pc) return []
  const level = totalLevel(pc), used = stateOf(s ?? (pc.fields.sheet as CharacterSheet | undefined)).spellsUsed ?? []
  const out: SpeciesSpell[] = []
  for (const a of active(pc, s)) {
    const lists: [string, TraitSpell[] | undefined, string][] = [[a.key, a.trait.spells, a.trait.name]]
    if (a.option) lists.push([`${a.key}.${a.option.id}`, a.option.spells, a.option.name])
    for (const [base, list, from] of lists) {
      (list ?? []).forEach((x, k) => {
        if (!get(x.spell) || (x.from ?? 1) > level) return
        const key = `${base}.s${k}`
        const perRest = x.how === 'short' || x.how === 'long'
        const ready = !perRest || !used.includes(key)
        out.push({ key, spell: x, from, ready, status: HOW_SPECIES[x.how] + (ready ? '' : ' · used'), level: x.from ?? 1 })
      })
    }
  }
  return out
}
/** Cast a once-per-rest species spell, or give it back. */
export function useSpeciesSpell(s: CharacterSheet, key: string, back = false) {
  const st = edit(s), l = new Set(st.spellsUsed ?? [])
  if (back) l.delete(key); else l.add(key)
  st.spellsUsed = [...l]
  if (!st.spellsUsed.length) delete st.spellsUsed
}
/** The always-prepared spells, for the Spellbook's prepared list. */
export const speciesPrepared = (pc: Entry | undefined) => speciesSpells(pc).filter(x => x.spell.how === 'prepared').map(x => x.spell.spell)

/** A rest: a short rest gives back the short-rest uses and spells, a long rest everything. */
export function restSpecies(s: CharacterSheet, pc: Entry, kind: 'short' | 'long') {
  const st = s.species
  if (!st) return
  if (kind === 'long') { delete st.used; delete st.spellsUsed; return }
  const traits = speciesTraits(pc, s)
  if (st.used) for (const key of Object.keys(st.used)) if (traits.find(a => a.key === key)?.trait.uses?.recharge === 'short') delete st.used[key]
  const short = new Set(speciesSpells(pc, s).filter(x => x.spell.how === 'short').map(x => x.key))
  if (st.spellsUsed) st.spellsUsed = st.spellsUsed.filter(k => !short.has(k))
}

/** A trait in a few words, for chips: its uses ("PB/long rest") and spells' timing. */
export const usesLabel = (t: Trait) => (t.uses ? `${t.uses.count === 'pb' ? 'PB' : t.uses.count}/${t.uses.recharge} rest` : '')
export const spellLabel = (x: TraitSpell) => `${get(x.spell)?.name ?? '?'} (${HOW_SPECIES[x.how]}${(x.from ?? 1) > 1 ? `, from ${ORD[x.from!] ?? x.from + 'th'} level` : ''})`
/** A new id for a trait or an option. */
export const newTraitId = () => Math.random().toString(36).slice(2, 8)

// ---- what a grant or a choice can be ----
/** The candidates for a grant or a choice of a kind: id and label. */
export function grantOptions(kind: TraitGrant['kind']): { id: string; label: string }[] {
  switch (kind) {
    case 'skill': return SKILLS.map(x => ({ id: x.name, label: x.name }))
    case 'armor': return listOptions('item.armorType').filter(o => o.id !== 'Clothing')
    case 'weapon': return [...listOptions('item.weaponCategory'), ...listOptions('item.baseWeapon')]
    case 'language': return listOptions('language')
    case 'tool': return Object.values(state.db?.entries ?? {}).filter(e => e.type === 'item' && e.fields.kind === 'Tool')
      .map(e => ({ id: e.id, label: e.name })).sort((a, b) => a.label.localeCompare(b.label))
  }
}
/** How a granted thing reads: its option label or item name, else the id as written. */
export const grantLabel = (g: Pick<TraitGrant, 'kind' | 'id'>) => grantOptions(g.kind).find(o => o.id === g.id)?.label ?? g.id
export const GRANT_KINDS: { id: TraitGrant['kind']; label: string; plural: string }[] = [
  { id: 'skill', label: 'Skill', plural: 'skills' }, { id: 'language', label: 'Language', plural: 'languages' },
  { id: 'tool', label: 'Tool', plural: 'tools' }, { id: 'weapon', label: 'Weapon', plural: 'weapons' }, { id: 'armor', label: 'Armor', plural: 'armor' },
]
