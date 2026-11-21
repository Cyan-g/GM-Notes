// What a character's species gives them: the traits of their race and of the races it's a subrace of (a Hill Dwarf
// has the Dwarf's traits and its own). A trait can carry effects like gear (darkvision, resistances, advantage on
// saves, max HP per level…), grant proficiencies and languages, give spells, have uses that come back on a rest,
// and ask the player to choose (skills, a language, or one of several options such as an elven lineage). Traits count
// from their level on. The sheet's totals (effects.ts) add the effects; the picks and spent uses live on the sheet.
// A character's background counts the same way: its skills and tool are a "Proficiencies" trait (several tools: the
// player picks one), then its own features. Any granted skill, tool, language, weapon or armor can be swapped by the
// player for another of the same kind (an overlap with the class's skills, a DM's ruling).
// A character's classes and subclasses count the same way too: their Features, each from a level in that class, with
// uses that can grow by level (Rage), scaling values (Sneak Attack), and picks (Fighting Style, Expertise, Metamagic).
import type { CharacterSheet, Entry, GearEffect, Id, SpeciesState, Speeds, Trait, TraitChoice, TraitGrant, TraitOption, TraitSpell } from './model/types'
import { classesOf, totalLevel, withoutClass } from './model/classes'
import { classEntry, classLabel } from './classRules'
import { byType, entries, get, listOptions, state } from './store'
import { sheetOf } from './sheetData'
import { SKILLS, mod, ord, profBonus, type Ability } from './model/dnd'
import { inUse, isWearable } from './items'
import { entryNamed } from './lookup'
import { traitsOf } from './model/traits'

/** A trait's key on a character: the race it comes from and its id. */
export const traitKey = (race: Entry, t: Trait) => `${race.id}.${t.id}`

/**
 * A race and the races it's a subrace of, nearest first: from the entry `id` up its "Subrace of", until an entry
 * that's missing or already passed (a loop in the data). Only races count, unless `anyType` (a "Subrace of" that
 * isn't a race, which the data check reports, is then followed too).
 */
export function raceChain(id: Id | undefined, anyType = false): Entry[] {
  const out: Entry[] = []
  for (let r = get(id); r && (anyType || r.type === 'race') && !out.includes(r); r = get(r.fields.parent as Id | undefined)) out.push(r)
  return out
}
/** Whether a character may be of this race: neither it nor a race it's a subrace of is marked not playable. */
export const isPlayable = (race: Entry) => !raceChain(race.id).some(r => r.fields.notPlayable)
/** The character's race and the races it's a subrace of, the main race first. */
export const lineage = (pc: Entry | undefined): Entry[] => raceChain(pc?.fields.race as Id | undefined).reverse()

/** The character's background, if it has one. */
export const backgroundOf = (pc: Entry | undefined) => { const b = get(pc?.fields.background as Id | undefined); return b?.type === 'background' ? b : undefined }
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
  /** The ability picked for its spells (its castWith), if any yet. */
  cast?: Ability
}
/** Every trait of the character's species and background, in order (main race first, background last), with what's chosen and whether it counts yet. */
export function speciesTraits(pc: Entry | undefined, s?: CharacterSheet): ActiveTrait[] {
  if (!pc) return []
  const sheet = s ?? (pc.fields.sheet as CharacterSheet | undefined), st = stateOf(sheet)
  const lin = lineage(pc), subrace = lin.length > 1 ? lin.at(-1)! : undefined, bg = backgroundOf(pc)
  // a subrace's trait can take the place of its main race's (Wood Elf's speed): that one is left out
  const replaced = new Set(lin.flatMap(r => traitsOf(r).map(t => t.replaces).filter((x): x is string => !!x)))
  const build = ({ from: race, level }: { from: Entry; level: number }) => traitsOf(race).filter(t => !(lin.includes(race) && replaced.has(t.id))).flatMap(trait => {
    const key = traitKey(race, trait)
    // a lineage the subrace stands for (a High Elf has the High Elf lineage) is picked unless the player picked another
    const auto = subrace && race !== subrace && lin.includes(race) && trait.choice?.kind === 'option' ? subraceOption(trait.choice, subrace.name, race.name)
      : race.type === 'feat' && trait.choice?.kind === 'option' && sheet?.originFeat === undefined && bg?.fields.originFeat === race.id && bg.fields.originFeatNote
        ? trait.choice.options?.find(o => o.name.toLowerCase() === String(bg.fields.originFeatNote).trim().toLowerCase()) : undefined
    const picks = st.picks?.[key]?.length ? st.picks[key] : auto ? [auto.id] : []
    const options = trait.choice?.kind === 'option'
      ? picks.map(id => trait.choice!.options?.find(o => o.id === id)).filter((o): o is TraitOption => !!o) : []
    const cw = trait.castWith, cast = cw ? st.abilities?.[cw.sameAs ? `${race.id}.${cw.sameAs}` : key] : undefined
    const a: ActiveTrait = { key, trait, race, level, active: (trait.level ?? 1) <= level, option: options[0], options, picks, ...(cast ? { cast } : {}) }
    // the choices a picked option brings, each as a trait of its own (picked and listed like any other)
    const sub = options.flatMap(o => (o.choices ?? []).filter(c => c.kind !== 'option').map((choice, n): ActiveTrait => {
      const k = `${key}.${o.id}.c${n}`
      return {
        key: k, race, level, active: a.active, options: [], picks: st.picks?.[k] ?? [], ...(cast ? { cast } : {}),
        trait: { id: `${trait.id}.${o.id}.c${n}`, name: choice.label ? `${o.name}: ${choice.label}` : o.name, level: trait.level, choice, sub: true } as Trait,
      }
    }))
    return [a, ...sub]
  })
  const base = origins(pc).flatMap(build)
  // the feats the character has: the background's Origin feat, those on the sheet, and those picked (a Fighting Style)
  const total = totalLevel(pc)
  return [...base, ...featsOf(pc, sheet, base).flatMap(f => build({ from: f, level: total })), ...itemsWithFeatures(sheet).flatMap(i => build({ from: i, level: total }))]
}
/** The feats a character has: the background's Origin feat, those on the sheet and those picked in a choice. */
export function featsOfCharacter(pc: Entry): Entry[] {
  const s = pc.fields.sheet as CharacterSheet | undefined
  return featsOf(pc, s, origins(pc).flatMap(o => traitsOf(o.from).map(trait => ({ key: traitKey(o.from, trait), trait, race: o.from, level: o.level, active: (trait.level ?? 1) <= o.level, options: [], picks: stateOf(s).picks?.[traitKey(o.from, trait)] ?? [] } as ActiveTrait))))
}
/** The items whose features count, each once: those in use, and those carried that can't be equipped or attuned. */
function itemsWithFeatures(s: CharacterSheet | undefined): Entry[] {
  const out = new Map<string, Entry>()
  for (const l of s?.inventory ?? []) {
    const item = get(l.item)
    if (item?.type === 'item' && traitsOf(item).length && (inUse(l, item) || !isWearable(item))) out.set(item.id, item)
  }
  return [...out.values()]
}
/** The feat entry a feature line on the sheet is ("Magic Initiate (Cleric)" is Magic Initiate), if any. */
export const featOfFeature = (f: { name: string }): Entry | undefined => entryNamed('feat', f.name, { qualified: true })
/** The character's Origin feat: the one the sheet names (or none), else the background's. */
export function originFeatOf(pc: Entry | undefined, s?: CharacterSheet): Entry | undefined {
  const own = (s ?? (pc?.fields.sheet as CharacterSheet | undefined))?.originFeat
  if (own === null) return undefined
  const f = get(own ?? backgroundOf(pc)?.fields.originFeat)
  return f?.type === 'feat' ? f : undefined
}
/** The character's feats, each once: the Origin feat, the sheet's feature lines that are feats, and picked feats. */
function featsOf(pc: Entry, s: CharacterSheet | undefined, traits: ActiveTrait[]): Entry[] {
  const ids = [
    originFeatOf(pc, s)?.id,
    ...(s?.features ?? []).map(f => featOfFeature(f)?.id),
    ...traits.filter(a => a.active && a.trait.choice?.kind === 'feat').flatMap(a => a.picks),
  ]
  return [...new Set(ids)].map(id => get(id)).filter((e): e is Entry => e?.type === 'feat')
}
/**
 * The option of a choice a subrace stands for, if exactly one: "High Elf" is the High Elf lineage, "Black Dragonborn"
 * (of Dragonborn) the "Black dragon (Acid)" ancestry.
 */
export function subraceOption(c: TraitChoice, subrace: string, parent: string): TraitOption | undefined {
  const full = subrace.toLowerCase(), names = [full, full.replace(parent.toLowerCase(), '').trim()].filter(Boolean)
  const own = (c.options ?? []).filter(o => names.some(n => o.name.toLowerCase() === n || o.name.toLowerCase().startsWith(n + ' ')))
  return own.length === 1 ? own[0] : undefined
}
/** A subrace's main races, nearest first (High Elf: Elf), for its "replaces" choice and the "From Elf" sections. */
export function parentRaces(e: Entry): Entry[] {
  const up = raceChain(e.fields.parent as Id | undefined), self = up.findIndex(r => r.id === e.id)
  // a loop back to the race itself ends the list there
  return self < 0 ? up : up.slice(0, self)
}
/** The subrace a member of a race belongs to (its name), or nothing for a member of the race itself. */
export const subraceNameIn = (race: Entry, n: Entry) => (n.fields.race === race.id ? '' : get(n.fields.race)?.name ?? '')
/** Everyone (NPCs and characters) of a race or of one of its subraces at any depth, by subrace, then by name. */
export function raceMembers(race: Entry): Entry[] {
  const ids = new Set<string>([race.id])
  for (let grew = true; grew;) { grew = false; for (const r of byType.value.get('race') ?? []) if (!ids.has(r.id) && !!r.fields.parent && ids.has(r.fields.parent)) { ids.add(r.id); grew = true } }
  return entries.value.filter(n => (n.type === 'npc' || n.type === 'pc') && !!n.fields.race && ids.has(n.fields.race))
    .sort((a, b) => subraceNameIn(race, a).localeCompare(subraceNameIn(race, b)) || a.name.localeCompare(b.name))
}
/** When a class or subclass feature comes: "Warlock Lv 14"; other sources have no level. */
export function levelTag(a: ActiveTrait): string {
  return a.race.type === 'class' || a.race.type === 'subclass' ? `${classLabel(a.race)} Lv ${a.trait.level ?? 1}` : sourceTag(a)
}
/**
 * A trait's source, short, as a tag: the class with the level the feature comes at ("Warlock · Lv 2"), a subclass
 * without its class's name, with the class's level ("The Dusk Prince · Warlock Lv 6"), the race or background, or
 * "feat" for a feat's own feature.
 */
export function sourceTag(a: ActiveTrait): string {
  const lv = a.trait.level ?? 1
  // class features count the class's level; a subclass's count its class's level too ("The Dusk Prince · Warlock Lv 6")
  if (a.race.type === 'class') return `${a.race.name} · Lv ${lv}`
  if (a.race.type === 'subclass') return `${withoutClass(a.race.name, String(a.race.fields.class ?? '')) ?? a.race.name} · ${classLabel(a.race)} Lv ${lv}`
  if (a.race.type === 'feat' && a.trait.name === a.race.name) return 'feat'
  return a.race.name
}
/** An effect that takes its number or dice from the feature's scaling value, with that value filled in. */
export function withScale(f: GearEffect, a: ActiveTrait): GearEffect {
  if (!f.fromScale) return f
  const v = scaleAt(a)
  if (v == null) return { ...f, value: 0, dice: undefined }
  return /d\d/.test(v) ? { ...f, dice: v.replace(/^\+/, '') } : { ...f, value: Number(v.replace(/[^\d-]/g, '')) || 0 }
}
/** Whether a switchable feature (Rage) is on. */
export const isOn = (a: ActiveTrait, s?: CharacterSheet) => !!stateOf(s).on?.includes(a.key)
/** Switch a feature on or off. */
export function toggleOn(s: CharacterSheet, key: string) {
  const st = edit(s), l = new Set(st.on ?? [])
  if (l.has(key)) l.delete(key); else l.add(key)
  st.on = [...l]
  if (!st.on.length) delete st.on
}
const active = (pc: Entry | undefined, s?: CharacterSheet) => speciesTraits(pc, s).filter(a => a.active)

/** The effects that count, each with what it comes from (the trait, or the chosen option). */
export function speciesEffects(pc: Entry | undefined, s?: CharacterSheet): { name: string; effects: GearEffect[] }[] {
  const on = new Set(stateOf(s ?? (pc?.fields.sheet as CharacterSheet | undefined)).on ?? [])
  return active(pc, s).filter(a => !a.trait.toggle || on.has(a.key)).flatMap(a => [
    { name: a.trait.name, effects: (a.trait.effects ?? []).map(f => withScale(f, a)) },
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
    if (k === 'skillTool') for (const id of a.picks) out.push({ kind: SKILLS.some(x => x.name === id) ? 'skill' : 'tool', id, from })
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
  return speciesSpeeds(pc).walk
}
/** The species' speeds: each one the subrace sets, else the main race's. */
export function speciesSpeeds(pc: Entry | undefined): Speeds {
  const out: Speeds = {}
  for (const r of lineage(pc)) Object.assign(out, Object.fromEntries(Object.entries(r.fields.speeds ?? {}).filter(([, v]) => v != null && v !== '')))
  return out
}
/** The sizes a character of this species may be: the main one first (the subrace's, else the main race's). */
export function speciesSizes(pc: Entry | undefined): string[] {
  for (const r of [...lineage(pc)].reverse()) if (r.fields.size) return [String(r.fields.size), ...((r.fields.otherSizes as string[] | undefined) ?? []).filter(x => x !== r.fields.size)]
  return []
}
/** The character's size: the one the player picked where the species offers a choice, else its main size. */
export function speciesSize(pc: Entry | undefined): string | undefined {
  const all = speciesSizes(pc), picked = pc?.fields.sheet?.size
  return picked && all.includes(picked) ? picked : all[0]
}

// ---- uses ----
/** A count by level: the last step reached, else the base. */
export const byLevel = (steps: [number, number][] | undefined, level: number, base: number) =>
  steps?.length ? steps.filter(([at]) => level >= at).at(-1)?.[1] ?? 0 : base
/** An ability score on a sheet, as the sheet counts it (sheet.ts's `score`, with gear): what a trait's uses count from. */
export type ScoreOf = (s: CharacterSheet, a: Ability) => number
/** How many uses a trait has at the level that counts for it; 0 when it has none. `score` gives the ability scores. */
export function usesMax(pc: Entry, a: ActiveTrait, s: CharacterSheet | undefined, score: ScoreOf): number {
  const u = a.trait.uses
  if (!u) return 0
  let n: number
  if (u.count === 'pb') n = profBonus(totalLevel(pc))
  else if (u.count === 'level') n = a.level
  else if (typeof u.count === 'string') {
    const sh = s ?? sheetOf(pc)
    n = Math.max(1, sh ? mod(score(sh, u.count as Ability)) : 1)
  } else n = Math.max(0, Number(u.count) || 0)
  n = byLevel(u.steps, a.level, n)
  return n * (u.times ?? 1)
}
export const usesLeft = (pc: Entry, s: CharacterSheet | undefined, a: ActiveTrait, score: ScoreOf) =>
  Math.max(0, usesMax(pc, a, s, score) - (stateOf(s).used?.[a.key] ?? 0))
/** A scaling value at the trait's level ("+2", "3d6"), if it has one. */
export const scaleAt = (a: ActiveTrait) => a.trait.scale?.steps.filter(([at]) => a.level >= at).at(-1)?.[1]
function edit(s: CharacterSheet): SpeciesState { return (s.species ??= {}) }
/** Spend n uses (1, or −1 to give one back). */
export function spendUse(s: CharacterSheet, pc: Entry, a: ActiveTrait, n: number, score: ScoreOf) {
  const st = edit(s), used = { ...(st.used ?? {}) }
  used[a.key] = Math.max(0, Math.min(usesMax(pc, a, s, score), (used[a.key] ?? 0) + n))
  if (!used[a.key]) delete used[a.key]
  st.used = used
}

// ---- what's listed in play ----
/** Effects the sheet works into its numbers or marks (a score, a save's advantage, speed…); others are rules to read. */
const COUNTED: GearEffect['on'][] = ['ac', 'ability', 'saves', 'save', 'attack', 'damage', 'spellAttack', 'spellDC', 'skill', 'speed', 'initiative', 'maxHp', 'maxHpLevel', 'skillAdv', 'saveAdv']
/**
 * Whether a trait is listed on the sheet in play: unless set by its `onSheet`, it is when it has uses or a scaling
 * value, asks to pick options, feats or weapons to master (those are what's used), or carries no data at all (its
 * text is the rule). A trait whose data is all counted elsewhere (proficiencies, languages, Expertise, spells, numbers)
 * is left out; one with a sense, resistance, immunity or feature line stays, since those are only read here.
 */
export function shownInPlay(a: ActiveTrait): boolean {
  const t = a.trait
  if (t.onSheet) return t.onSheet === 'show'
  if (t.uses || t.scale) return true
  const k = t.choice?.kind
  if (k === 'option' || k === 'feat' || k === 'mastery') return true
  const effects = [...(t.effects ?? []), ...a.options.flatMap(o => o.effects ?? [])]
  if (effects.some(e => !COUNTED.includes(e.on))) return true
  const data = !!(t.grants?.length || t.spells?.length || t.spellLists?.length || effects.length || k)
  return !data
}
/** Whether a trait asks the player for anything: a choice, or proficiencies they may swap. */
export const hasChoices = (a: ActiveTrait) => !!a.trait.choice || !!a.trait.castWith?.among?.length || swappableSpells(a).length > 0
  || !!(a.trait.grants?.length || a.options.some(o => o.grants?.length))

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
export const choiceOpen = (a: ActiveTrait) => (!!a.trait.castWith?.among?.length && !a.cast)
  || (!!a.trait.choice && (a.trait.choice.kind === 'option' ? a.options.length : a.picks.length) < choiceCount(a))
/** How many picks a trait still waits for: its choice's open picks, and its casting ability if not picked. */
export const picksLeft = (a: ActiveTrait) => (a.trait.castWith?.among?.length && !a.cast ? 1 : 0)
  + (a.trait.choice ? Math.max(0, choiceCount(a) - (a.trait.choice.kind === 'option' ? a.options.length : a.picks.length)) : 0)
/** Pick the ability a trait's spells are cast with ('' takes the pick back). */
export function setCastAbility(s: CharacterSheet, key: string, ability: Ability | '') {
  const st = edit(s), all = { ...(st.abilities ?? {}) }
  if (ability) all[key] = ability; else delete all[key]
  st.abilities = all
  if (!Object.keys(all).length) delete st.abilities
}

// ---- spells ----
export const HOW_SPECIES: Record<TraitSpell['how'], string> = { atWill: 'at will', short: '1/short rest', long: '1/long rest', prepared: 'always prepared', list: 'on the spell list', book: 'in the spellbook' }
export interface SpeciesSpell { key: string; spell: TraitSpell; from: string; ready: boolean; status: string; level: number }
/** The spells the species gives at the character's level, with whether a once-per-rest one can be cast now. */
export function speciesSpells(pc: Entry | undefined, s?: CharacterSheet): SpeciesSpell[] {
  if (!pc) return []
  const used = stateOf(s ?? (pc.fields.sheet as CharacterSheet | undefined)).spellsUsed ?? []
  const out: SpeciesSpell[] = []
  for (const a of active(pc, s)) {
    const lists: [string, TraitSpell[] | undefined, string][] = [[a.key, a.trait.spells, a.trait.name]]
    for (const o of a.options) lists.push([`${a.key}.${o.id}`, o.spells, o.name])
    const c = a.trait.choice, swaps = stateOf(s ?? (pc.fields.sheet as CharacterSheet | undefined)).swaps ?? {}
    if (c?.kind === 'spell' && c.spell) lists.push([`${a.key}.p`, a.picks.map(spell => ({ spell, how: c.spell!.how, ability: c.spell!.ability })), a.trait.name])
    for (const [base, list, from] of lists) {
      (list ?? []).forEach((x, k) => {
        const key = `${base}.s${k}`
        // a swapped spell (the High Elf's cantrip), and the trait's casting ability where the spell names none
        if (x.swap && swaps[key] && get(swaps[key])) x = { ...x, spell: swaps[key] }
        if (!x.ability && a.cast) x = { ...x, ability: a.cast }
        if (!get(x.spell) || (x.from ?? 1) > a.level) return
        const perRest = x.how === 'short' || x.how === 'long'
        const ready = !perRest || !used.includes(key)
        out.push({ key, spell: x, from, ready, status: HOW_SPECIES[x.how] + (ready ? '' : ' · used'), level: x.from ?? 1 })
      })
    }
  }
  return out
}
/**
 * The spells of a trait (and its picked options) the player may swap for another (the High Elf's Prestidigitation):
 * each with its key, the spell given, the one taken instead (if swapped) and what it may be swapped for.
 */
export function swappableSpells(a: ActiveTrait, s?: CharacterSheet): { key: string; given: Id; id: Id; from: string; candidates: Entry[] }[] {
  const swaps = stateOf(s).swaps ?? {}
  const lists: [string, TraitSpell[] | undefined, string][] = [[a.key, a.trait.spells, a.trait.name], ...a.options.map(o => [`${a.key}.${o.id}`, o.spells, o.name] as [string, TraitSpell[] | undefined, string])]
  return lists.flatMap(([base, list, from]) => (list ?? []).flatMap((x, k) => {
    if (!x.swap || (x.from ?? 1) > a.level) return []
    const key = `${base}.s${k}`, level = x.swap.level ?? get(x.spell)?.fields.level
    const candidates = spellsMatching({ classes: x.swap.classes, level: level as string | undefined, how: x.how })
    return [{ key, given: x.spell, id: swaps[key] ?? x.spell, from, candidates }]
  }))
}
/**
 * The spells features put on the spell list of a class (`list`: learnable, the Dusk Prince's expanded spells) or into
 * the spellbook for free (`book`: the Hemomancer's), at the level reached in that class; a class of '' takes any.
 */
export function classSpellsFrom(pc: Entry | undefined, how: 'list' | 'book', cls = '', s?: CharacterSheet): { spell: Id; from: string }[] {
  return speciesTraits(pc, s).filter(a => a.active && (!cls || !isClassOrigin(a.race) || a.race.fields.class === cls))
    .flatMap(a => (a.trait.spells ?? []).filter(x => x.how === how && (x.from ?? 1) <= a.level && get(x.spell)).map(x => ({ spell: x.spell, from: a.trait.name })))
}
/** Cast a once-per-rest species spell, or give it back. */
export function useSpeciesSpell(s: CharacterSheet, key: string, back = false) {
  const st = edit(s), l = new Set(st.spellsUsed ?? [])
  if (back) l.delete(key); else l.add(key)
  st.spellsUsed = [...l]
  if (!st.spellsUsed.length) delete st.spellsUsed
}
/** A rest: a short rest gives back the short-rest uses and spells, a long rest everything. */
export function restSpecies(s: CharacterSheet, pc: Entry, kind: 'short' | 'long') {
  const st = s.species
  if (!st) return
  if (kind === 'long') { delete st.used; delete st.spellsUsed; delete st.on; return }
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
export const spellLabel = (x: TraitSpell) => `${get(x.spell)?.name ?? '?'} (${HOW_SPECIES[x.how]}${(x.from ?? 1) > 1 ? `, from ${ord(x.from!)} level` : ''})`
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
    // tools, and musical instruments (tools a character can be proficient with too: a Bard's, Musician's)
    case 'tool': return Object.values(state.db?.entries ?? {}).filter(e => e.type === 'item' && (e.fields.kind === 'Tool' || e.fields.kind === 'Instrument'))
      .map(e => ({ id: e.id, label: e.name })).sort((a, b) => a.label.localeCompare(b.label))
  }
}
/** What a choice can take: its `among` list, else everything of its kind (skills for Expertise, Fighting Style feats…). */
export function choiceCandidates(c: TraitChoice): { id: string; label: string }[] {
  let all: { id: string; label: string }[]
  if (c.kind === 'option') return (c.options ?? []).map(o => ({ id: o.id, label: o.name }))
  if (c.kind === 'expertise') all = grantOptions('skill')
  else if (c.kind === 'mastery') all = listOptions('item.baseWeapon')
  else if (c.kind === 'skillTool') all = [...grantOptions('skill'), ...grantOptions('tool')]
  else if (c.kind === 'spell') all = spellsMatching(c.spell).map(e => ({ id: e.id, label: e.name }))
  else if (c.kind === 'feat') all = Object.values(state.db?.entries ?? {}).filter(e => e.type === 'feat' && (!c.category || e.fields.category === c.category))
    .map(e => ({ id: e.id, label: e.name })).sort((a, b) => a.label.localeCompare(b.label))
  else all = grantOptions(c.kind)
  return c.among?.length ? c.among.map(id => all.find(o => o.id === id) ?? { id, label: id }) : all
}
/** The world's spells a spell choice can take: of its level, on one of its classes' lists (any, if none), rituals if asked. */
export function spellsMatching(f: TraitChoice['spell']): Entry[] {
  const classes = f?.classes ?? []
  const schools = f?.schools ?? []
  return entries.value.filter(e => e.type === 'spell' && (!f?.level || e.fields.level === f.level)
    && (!classes.length || (e.fields.classes ?? []).some(x => classes.includes(x))) && (!f?.ritual || !!e.fields.ritual)
    && (!schools.length || schools.includes(String(e.fields.school ?? ''))))
    .sort((a, b) => a.name.localeCompare(b.name))
}
/** A spell choice's spells in words: "Wizard cantrip", "level 1 ritual spell", "level 1 Divination or Enchantment spell". */
export function spellChoiceWords(c: TraitChoice, plural: boolean): string {
  const f = c.spell, s = plural ? 's' : ''
  const schools = f?.schools?.length ? `${f.schools.join(' or ')} ` : ''
  const kind = f?.level === 'Cantrip' ? `${schools}cantrip${s}` : `${f?.level ? `level ${f.level} ` : ''}${f?.ritual ? 'ritual ' : ''}${schools}spell${s}`
  return `${f?.classes?.length ? f.classes.join(' or ') + ' ' : ''}${kind}${f?.classes?.length || schools ? '' : ' from any class'}`
}
/** What a choice picks, in words: "skill" / "skills", "Wizard cantrip". */
export const choiceWords = (c: TraitChoice, n: number) => (c.kind === 'spell' ? spellChoiceWords(c, n !== 1) : CHOICE_WORDS[c.kind][n === 1 ? 0 : 1])
export const CHOICE_WORDS: Record<TraitChoice['kind'], [string, string]> = {
  skill: ['skill', 'skills'], language: ['language', 'languages'], tool: ['tool', 'tools'], option: ['option', 'options'],
  expertise: ['skill for Expertise', 'skills for Expertise'], feat: ['feat', 'feats'], mastery: ['weapon to master', 'weapons to master'], spell: ['spell', 'spells'], skillTool: ['skill or tool', 'skills or tools'],
}
/** How a granted thing reads: its option label or item name, else the id as written. */
export const grantLabel = (g: Pick<TraitGrant, 'kind' | 'id'>) => grantOptions(g.kind).find(o => o.id === g.id)?.label ?? g.id
export const GRANT_KINDS: { id: TraitGrant['kind']; label: string; plural: string }[] = [
  { id: 'skill', label: 'Skill', plural: 'skills' }, { id: 'language', label: 'Language', plural: 'languages' },
  { id: 'tool', label: 'Tool', plural: 'tools' }, { id: 'weapon', label: 'Weapon', plural: 'weapons' }, { id: 'armor', label: 'Armor', plural: 'armor' },
]
