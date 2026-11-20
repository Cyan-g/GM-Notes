// What a character's species gives them: the traits of their race and of the races it's a subrace of (a Hill Dwarf
// has the Dwarf's traits and its own). A trait can carry effects like gear (darkvision, resistances, advantage on
// saves, max HP per level…), grant proficiencies and languages, give spells, have uses that come back on a rest,
// and ask the player to choose (skills, a language, or one of several options such as an elven lineage). Traits count
// from their level on. The sheet's totals (gear.ts) add the effects; the picks and spent uses live on the sheet.
// A character's background counts the same way: its skills and tool are a "Proficiencies" trait (several tools: the
// player picks one), then its own features. Any granted skill, tool, language, weapon or armor can be swapped by the
// player for another of the same kind (an overlap with the class's skills, a DM's ruling).
// A character's classes and subclasses count the same way too: their Features, each from a level in that class, with
// uses that can grow by level (Rage), scaling values (Sneak Attack), and picks (Fighting Style, Expertise, Metamagic).
import type { Abilities, CharacterSheet, Entry, GearEffect, Id, SpeciesState, Trait, TraitChoice, TraitGrant, TraitOption, TraitSpell } from './model/types'
import { classesOf, totalLevel } from './model/classes'
import { entries, get, listOptions, state } from './store'
import { SKILLS, mod, score, sheetOf } from './sheet'

// ---- whose sheet is this? (the totals only get a sheet; sheet.ts registers each sheet it hands out) ----
const OWNER = new WeakMap<object, Entry>()
/** Remember which character a sheet object belongs to. */
export function own<T extends object>(s: T, pc: Entry): T { OWNER.set(s, pc); return s }
/** The character a sheet belongs to, if known. */
export const ownerOf = (s: object | undefined) => (s ? OWNER.get(s) : undefined)

/** A trait's key on a character: the race it comes from and its id. */
export const traitKey = (race: Entry, t: Trait) => `${race.id}.${t.id}`
const ownTraits = (e: Entry | undefined): Trait[] =>
  Array.isArray(e?.fields.speciesTraits) ? e!.fields.speciesTraits!.filter(t => t && typeof t === 'object') : []
/** The id of a background's proficiencies trait (its skills and tool). */
export const PROFS_TRAIT = 'proficiencies'
/** A race's traits; a background's, after one made from its skills and tool. */
export function traitsOf(e: Entry | undefined): Trait[] {
  if (e?.type !== 'background') return ownTraits(e)
  const skills = (e.fields.skillProfs ?? []).filter(Boolean), tools = (e.fields.toolProfs ?? []).filter(Boolean)
  const t: Trait = { id: PROFS_TRAIT, name: 'Proficiencies' }
  const grants: TraitGrant[] = [...skills.map(id => ({ kind: 'skill' as const, id })), ...(tools.length === 1 ? [{ kind: 'tool' as const, id: tools[0] }] : [])]
  if (grants.length) t.grants = grants
  if (tools.length > 1) t.choice = { kind: 'tool', count: 1, among: tools }
  return grants.length || t.choice ? [t, ...ownTraits(e)] : ownTraits(e)
}

/** The character's race and the races it's a subrace of, the main race first. */
export function lineage(pc: Entry | undefined): Entry[] {
  const out: Entry[] = []
  let r = get(pc?.fields.race as Id | undefined)
  while (r && r.type === 'race' && !out.includes(r)) { out.unshift(r); r = get(r.fields.parent as Id | undefined) }
  return out
}

/** The character's background, if it has one. */
export const backgroundOf = (pc: Entry | undefined) => { const b = get(pc?.fields.background as Id | undefined); return b?.type === 'background' ? b : undefined }
/** The Class entry describing a class of the Classes list, if the world has one. */
export const classEntry = (cls: string | undefined) => (cls ? entries.value.find(e => e.type === 'class' && e.fields.class === cls) : undefined)
/**
 * Where a character's traits come from, each with the level that counts for it: the races of its lineage and its
 * background (the character's level), then each class and its subclass (the level in that class).
 */
export function origins(pc: Entry | undefined): { from: Entry; level: number }[] {
  if (!pc) return []
  const total = totalLevel(pc)
  const out = [...lineage(pc), ...(backgroundOf(pc) ? [backgroundOf(pc)!] : [])].map(from => ({ from, level: total }))
  for (const l of classesOf(pc)) {
    const level = Number(l.level) || 0, c = classEntry(l.class), sub = get(l.subclass)
    if (c) out.push({ from: c, level })
    if (sub?.type === 'subclass') out.push({ from: sub, level })
  }
  return out
}
/** Whether an origin is a class or subclass (its traits are class features). */
export const isClassOrigin = (e: Entry) => e.type === 'class' || e.type === 'subclass'

const pb = (level: number) => 2 + Math.floor((Math.max(1, level) - 1) / 4)
export const stateOf = (s: CharacterSheet | undefined): SpeciesState => s?.species ?? {}

export interface ActiveTrait {
  key: string
  trait: Trait
  /** The race, background, class or subclass it comes from. */
  race: Entry
  /** The level that counts for it: the character's, or the level in its class. */
  level: number
  /** Whether the character has reached the trait's level. */
  active: boolean
  /** The chosen option of an option choice (the first, when several are chosen). */
  option?: TraitOption
  /** Every chosen option. */
  options: TraitOption[]
  /** The picks of a choice. */
  picks: string[]
}
/** Every trait of the character's species and background, in order (main race first, background last), with what's chosen and whether it counts yet. */
export function speciesTraits(pc: Entry | undefined, s?: CharacterSheet): ActiveTrait[] {
  if (!pc) return []
  const st = stateOf(s ?? (pc.fields.sheet as CharacterSheet | undefined))
  return origins(pc).flatMap(({ from: race, level }) => traitsOf(race).map(trait => {
    const key = traitKey(race, trait)
    const picks = st.picks?.[key] ?? []
    const options = trait.choice?.kind === 'option'
      ? picks.map(id => trait.choice!.options?.find(o => o.id === id)).filter((o): o is TraitOption => !!o) : []
    return { key, trait, race, level, active: (trait.level ?? 1) <= level, option: options[0], options, picks }
  }))
}
const active = (pc: Entry | undefined, s?: CharacterSheet) => speciesTraits(pc, s).filter(a => a.active)

/** The effects that count, each with what it comes from (the trait, or the chosen option). */
export function speciesEffects(pc: Entry | undefined, s?: CharacterSheet): { name: string; effects: GearEffect[] }[] {
  return active(pc, s).flatMap(a => [
    { name: a.trait.name, effects: a.trait.effects ?? [] },
    ...a.options.map(o => ({ name: o.name, effects: o.effects ?? [] })),
  ]).filter(x => x.effects.length)
}

/** A language's option id for a name ("Common" → its id in the language list), else the name itself. */
function languageId(name: string): string {
  const n = name.trim().toLowerCase()
  return listOptions('language').find(o => o.id.toLowerCase() === n || o.label.toLowerCase() === n)?.id ?? name.trim()
}

/** A granted proficiency's key on a character, for swapping it: the trait's key, the option's id if from one, its place. */
export const grantKey = (a: ActiveTrait, i: number, option?: TraitOption) => `${a.key}${option ? '.' + option.id : ''}.g${i}`
/**
 * The grants of a trait (and its chosen option) as the character has them: each with its key and, when the player
 * swapped it, the id taken instead.
 */
export function traitGrants(a: ActiveTrait, s?: CharacterSheet): (TraitGrant & { key: string; was?: string; option?: string })[] {
  const swaps = stateOf(s).swaps ?? {}
  const of = (list: TraitGrant[] | undefined, option?: TraitOption) => (list ?? []).map((g, i) => {
    const key = grantKey(a, i, option), id = swaps[key], o = option ? { option: option.name } : {}
    return id && id !== g.id ? { ...g, id, key, was: g.id, ...o } : { ...g, key, ...o }
  })
  return [...of(a.trait.grants), ...a.options.flatMap(o => of(o.grants, o))]
}
/** Swap a granted proficiency for another of its kind (its own id, or '', takes the swap back). */
export function setSwap(s: CharacterSheet, key: string, id: string, original: string) {
  const st = edit(s), all = { ...(st.swaps ?? {}) }
  if (id && id !== original) all[key] = id; else delete all[key]
  st.swaps = all
  if (!Object.keys(all).length) delete st.swaps
}

/** Everything granted: proficiencies, languages (the race's own list too) and the player's picks, with where from. */
export function speciesGrants(pc: Entry | undefined, s?: CharacterSheet): (TraitGrant & { from: string })[] {
  if (!pc) return []
  const out: (TraitGrant & { from: string })[] = []
  for (const race of lineage(pc)) {
    for (const l of (race.fields.languages as string[] | undefined) ?? []) if (l.trim()) out.push({ kind: 'language', id: languageId(l), from: race.name })
  }
  for (const a of active(pc, s)) {
    const from = a.race.type === 'background' ? a.race.name : a.trait.name
    for (const g of traitGrants(a, s)) out.push({ kind: g.kind, id: g.id, from: g.option ?? from })
    const k = a.trait.choice?.kind
    if (k === 'skill' || k === 'language' || k === 'tool') for (const id of a.picks) out.push({ kind: k, id, from })
  }
  return out
}
/** The skills a species makes the character proficient in. */
export const speciesSkills = (pc: Entry | undefined, s?: CharacterSheet) =>
  new Set(speciesGrants(pc, s).filter(g => g.kind === 'skill').map(g => g.id))
/** The skills a feature gives Expertise in (picked in an Expertise choice). */
export const speciesExpertise = (pc: Entry | undefined, s?: CharacterSheet) =>
  new Set(active(pc, s).filter(a => a.trait.choice?.kind === 'expertise').flatMap(a => a.picks))

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
/** A count by level: the last step reached, else the base. */
export const byLevel = (steps: [number, number][] | undefined, level: number, base: number) =>
  steps?.length ? steps.filter(([at]) => level >= at).at(-1)?.[1] ?? 0 : base
/** How many uses a trait has at the level that counts for it; 0 when it has none. */
export function usesMax(pc: Entry, a: ActiveTrait, s?: CharacterSheet): number {
  const u = a.trait.uses
  if (!u) return 0
  let n: number
  if (u.count === 'pb') n = pb(totalLevel(pc))
  else if (u.count === 'level') n = a.level
  else if (typeof u.count === 'string') {
    const sh = s ?? sheetOf(pc)
    n = Math.max(1, sh ? mod(score(sh, u.count as keyof Abilities)) : 1)
  } else n = Math.max(0, Number(u.count) || 0)
  n = byLevel(u.steps, a.level, n)
  return n * (u.times ?? 1)
}
export const usesLeft = (pc: Entry, s: CharacterSheet | undefined, a: ActiveTrait) =>
  Math.max(0, usesMax(pc, a, s) - (stateOf(s).used?.[a.key] ?? 0))
/** A scaling value at the trait's level ("+2", "3d6"), if it has one. */
export const scaleAt = (a: ActiveTrait) => a.trait.scale?.steps.filter(([at]) => a.level >= at).at(-1)?.[1]
function edit(s: CharacterSheet): SpeciesState { return (s.species ??= {}) }
/** Spend one use (n = −1 gives one back). */
export function spendUse(s: CharacterSheet, pc: Entry, a: ActiveTrait, n = 1) {
  const st = edit(s), used = { ...(st.used ?? {}) }
  used[a.key] = Math.max(0, Math.min(usesMax(pc, a, s), (used[a.key] ?? 0) + n))
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
/** How many a choice takes at the trait's level. */
export const choiceCount = (a: ActiveTrait) => (a.trait.choice ? byLevel(a.trait.choice.steps, a.level, a.trait.choice.count ?? 1) : 0)
/** Whether a trait's choice still waits for the player. */
export const choiceOpen = (a: ActiveTrait) =>
  !!a.trait.choice && (a.trait.choice.kind === 'option' ? a.options.length : a.picks.length) < choiceCount(a)

// ---- spells ----
const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']
export const HOW_SPECIES: Record<TraitSpell['how'], string> = { atWill: 'at will', short: '1/short rest', long: '1/long rest', prepared: 'always prepared' }
export interface SpeciesSpell { key: string; spell: TraitSpell; from: string; ready: boolean; status: string; level: number }
/** The spells the species gives at the character's level, with whether a once-per-rest one can be cast now. */
export function speciesSpells(pc: Entry | undefined, s?: CharacterSheet): SpeciesSpell[] {
  if (!pc) return []
  const used = stateOf(s ?? (pc.fields.sheet as CharacterSheet | undefined)).spellsUsed ?? []
  const out: SpeciesSpell[] = []
  for (const a of active(pc, s)) {
    const lists: [string, TraitSpell[] | undefined, string][] = [[a.key, a.trait.spells, a.trait.name]]
    for (const o of a.options) lists.push([`${a.key}.${o.id}`, o.spells, o.name])
    for (const [base, list, from] of lists) {
      (list ?? []).forEach((x, k) => {
        if (!get(x.spell) || (x.from ?? 1) > a.level) return
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
  if (st.used) for (const key of Object.keys(st.used)) {
    const u = traits.find(a => a.key === key)?.trait.uses
    if (u?.recharge === 'short') delete st.used[key]
    // A long-rest use that gives some back on a short rest (Rage, Channel Divinity: one).
    else if (u?.shortBack) { st.used[key] = Math.max(0, st.used[key] - u.shortBack); if (!st.used[key]) delete st.used[key] }
  }
  const short = new Set(speciesSpells(pc, s).filter(x => x.spell.how === 'short').map(x => x.key))
  if (st.spellsUsed) st.spellsUsed = st.spellsUsed.filter(k => !short.has(k))
}

/** A trait in a few words, for chips: its uses ("PB/long rest") and spells' timing. */
export function usesLabel(t: Trait): string {
  const u = t.uses
  if (!u) return ''
  const n = u.steps?.length ? u.steps.map(x => x[1]).join('–') : u.count === 'pb' ? 'PB' : u.count === 'level' ? 'level' : typeof u.count === 'string' ? `${u.count.toUpperCase()} mod` : String(u.count)
  return `${u.times ? `${u.times} × ` : ''}${n}/${u.recharge} rest${u.shortBack ? ` (${u.shortBack} back on a short)` : ''}`
}
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
/** What a choice can take: its `among` list, else everything of its kind (skills for Expertise, Fighting Style feats…). */
export function choiceCandidates(c: TraitChoice): { id: string; label: string }[] {
  let all: { id: string; label: string }[]
  if (c.kind === 'option') return (c.options ?? []).map(o => ({ id: o.id, label: o.name }))
  if (c.kind === 'expertise') all = grantOptions('skill')
  else if (c.kind === 'mastery') all = listOptions('item.baseWeapon')
  else if (c.kind === 'feat') all = Object.values(state.db?.entries ?? {}).filter(e => e.type === 'feat' && (!c.category || e.fields.category === c.category))
    .map(e => ({ id: e.id, label: e.name })).sort((a, b) => a.label.localeCompare(b.label))
  else all = grantOptions(c.kind)
  return c.among?.length ? c.among.map(id => all.find(o => o.id === id) ?? { id, label: id }) : all
}
export const CHOICE_WORDS: Record<TraitChoice['kind'], [string, string]> = {
  skill: ['skill', 'skills'], language: ['language', 'languages'], tool: ['tool', 'tools'], option: ['option', 'options'],
  expertise: ['skill for Expertise', 'skills for Expertise'], feat: ['feat', 'feats'], mastery: ['weapon to master', 'weapons to master'],
}
/** How a granted thing reads: its option label or item name, else the id as written. */
export const grantLabel = (g: Pick<TraitGrant, 'kind' | 'id'>) => grantOptions(g.kind).find(o => o.id === g.id)?.label ?? g.id
export const GRANT_KINDS: { id: TraitGrant['kind']; label: string; plural: string }[] = [
  { id: 'skill', label: 'Skill', plural: 'skills' }, { id: 'language', label: 'Language', plural: 'languages' },
  { id: 'tool', label: 'Tool', plural: 'tools' }, { id: 'weapon', label: 'Weapon', plural: 'weapons' }, { id: 'armor', label: 'Armor', plural: 'armor' },
]
