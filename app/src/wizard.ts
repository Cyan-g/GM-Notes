// The character creation wizard's draft and what it turns into: a player character with classes, species and
// background, ability scores (standard array, point buy or typed, plus the species', the background's or a custom
// bonus), proficiencies, feats, hit points, equipment, spells, looks and story. Class rules come from classRules.ts
// for the SRD classes; any other class is filled in by hand. Nothing is stored until the draft is made.
import { reactive, shallowRef } from 'vue'
import type {
  Abilities, AbilityBonus, CharacterSheet, ClassLine, Copper, Entry, Feature, Id, InventoryLine, SpeciesState, Spellbook,
} from './model/types'
import { bonusApplied, bonusOpen, type BonusChoice } from './abilityBonus'
import { ABILITY_KEYS, dieSize, mod, spellLevel, type Ability } from './model/dnd'
import { EPIC_BOON_LEVEL, basicsOf, hitDieOf, rulesOf, subclassLevelOf, type Kit, type KitLine } from './classRules'
import { ruleSlots } from './slots'
import { blankSheet, emptyBook, own } from './sheetData'
import { choiceOpen, classSpellsFrom, isClassOrigin, isPlayable, raceChain, speciesGrants, speciesTraits } from './species'
import { PROFS_TRAIT } from './model/traits'
import { entries, get } from './store'
import { rule } from './rules'
import { changed, createEntry } from './edit'
import { itemNamed } from './lookup'
import { norm } from './model/text'
import { upgradeEntries } from './migrations'


export type ScoreMethod = 'array' | 'pointbuy' | 'typed'
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8]
/** Point buy: what each score costs, out of 27 points. */
export const POINT_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 }
export const POINTS = 27

/** A feat taken at a level (an Ability Score Improvement is a feat too), with its ability bonus's picks. */
export interface FeatPick { level: number; feat?: Id; choice: BonusChoice }

export interface Draft {
  cls: string
  level: number
  subclass?: Id
  /** A class without rules (homebrew): its hit die, saves, armor and weapons, and how many skills it picks. */
  die?: string
  ownSaves: Ability[]
  ownArmor: string[]
  ownWeapons: string[]
  ownSkillCount: number
  race?: Id
  /** The size picked, when the species offers more than one. */
  size?: string
  background?: Id
  method: ScoreMethod
  /** The base scores; for the standard array, unassigned scores are undefined. */
  base: Partial<Abilities>
  bonusFrom: 'species' | 'background' | 'custom'
  bonusChoice: BonusChoice
  custom: Partial<Abilities>
  skills: string[]
  /** Tools (Tool item ids or names) the class lets the player choose. */
  tools: string[]
  languages: string[]
  /** The species' and background's choices (species.ts). */
  species: SpeciesState
  feats: FeatPick[]
  /** Hit points for levels 2 and up: typed rolls; missing ones take the average. */
  hpRolls: (number | undefined)[]
  classKit: number
  bgKit: 'items' | 'money'
  cantrips: Id[]
  spells: Id[]
  /** A wizard's further spellbook spells (not prepared). */
  book: Id[]
  name: string
  player: string
  looks: Record<'gender' | 'age' | 'hair' | 'eyes' | 'skin' | 'clothing', string>
  story: string
}

export const newDraft = (): Draft => ({
  cls: '', level: 1, ownSaves: [], ownArmor: [], ownWeapons: [], ownSkillCount: 2,
  method: 'array', base: {}, bonusFrom: rule('abilityIncrease') === 'species' ? 'species' : 'background', bonusChoice: { picks: [] }, custom: {},
  skills: [], tools: [], languages: ['Common'], species: {}, feats: [], hpRolls: [], classKit: 0, bgKit: 'items',
  cantrips: [], spells: [], book: [], name: '', player: '',
  looks: { gender: '', age: '', hair: '', eyes: '', skin: '', clothing: '' }, story: '',
})

/** The draft in progress (kept while the app is open, so leaving the wizard and coming back keeps it). */
export const wizard = reactive({ d: newDraft(), step: 'class' })
export function resetWizard() { wizard.d = newDraft(); wizard.step = 'class' }

// ---------- the parts ----------

export const rules = (d: Draft) => rulesOf(d.cls)
export const dieOfDraft = (d: Draft) => d.die || (d.cls ? hitDieOf(d.cls) : 'd8')

/** The draft as a character entry that isn't stored, for the species' choices and the spell slots. */
export function draftPc(d: Draft, sheet?: CharacterSheet): Entry {
  const classLevels: ClassLine[] = d.cls ? [{ class: d.cls, level: d.level, ...(d.subclass ? { subclass: d.subclass } : {}), ...(d.die ? { die: d.die } : {}) }] : []
  const pc = {
    id: '__draft', type: 'pc', name: d.name || 'New character', aliases: [], tags: [], body: '', visibility: 'known',
    fields: { classLevels, ...(d.race ? { race: d.race } : {}), ...(d.background ? { background: d.background } : {}), sheet: sheet ?? { ...blankSheet(), species: d.species } },
    created: '', updated: '',
  } as unknown as Entry
  own(pc.fields.sheet as CharacterSheet, pc)
  return pc
}

/** The ability bonus the draft takes: the species' (the subrace's, else its main race's), the background's, or custom. */
export function bonusOf(d: Draft): AbilityBonus | undefined {
  if (d.bonusFrom === 'custom') return undefined
  if (d.bonusFrom === 'background') return get(d.background)?.fields.abilityIncrease
  for (const r of raceChain(d.race, true)) if (r.fields.abilityIncrease) return r.fields.abilityIncrease
  return undefined
}
/** What the chosen bonus adds. */
export const bonusAdds = (d: Draft): Partial<Abilities> => (d.bonusFrom === 'custom' ? d.custom : bonusApplied(bonusOf(d), d.bonusChoice))

/** The levels this character takes a feat at, with whether it's an Epic Boon. */
export function featLevels(d: Draft): { level: number; boon: boolean }[] {
  const at = rules(d)?.featLevels ?? [4, 8, 12, 16, 19]
  return at.filter(l => l <= d.level).map(level => ({ level, boon: level === EPIC_BOON_LEVEL }))
}

/** The scores: base, plus the chosen bonus, plus the feats' increases, each capped (20, or the bonus's own cap). */
export function finalScores(d: Draft): Abilities {
  const out = {} as Abilities
  const add = bonusAdds(d)
  for (const a of ABILITY_KEYS) out[a] = Math.min(20, (d.base[a] ?? 10) + (add[a] ?? 0))
  for (const f of d.feats) {
    const b = get(f.feat)?.fields.abilityIncrease
    if (!b) continue
    const plus = bonusApplied(b, f.choice), cap = b.max ?? 20
    for (const a of ABILITY_KEYS) if (plus[a]) out[a] = Math.max(out[a], Math.min(cap, out[a] + plus[a]!))
  }
  return out
}

export const pointsSpent = (d: Draft) => ABILITY_KEYS.reduce((n, a) => n + (POINT_COST[d.base[a] ?? 8] ?? 0), 0)

/** Hit points: the die's maximum at level 1, then each level's roll (or the average), all with the CON modifier. */
export function hpOf(d: Draft): number {
  const die = dieSize(dieOfDraft(d)) || 8, con = mod(finalScores(d).con)
  let hp = die + con
  for (let l = 2; l <= d.level; l++) hp += Math.max(1, (d.hpRolls[l - 2] ?? die / 2 + 1) + con)
  return Math.max(1, hp)
}

/** The spells the class can pick: cantrips, and spells up to the highest level its slots reach. */
export function spellChoices(d: Draft): { cantrips: Entry[]; spells: Entry[]; maxLevel: number } {
  const slots = d.cls ? ruleSlots(draftPc(d)) : undefined
  const maxLevel = Math.max(slots?.slots.reduce((m, n, i) => (n ? i + 1 : m), 0) ?? 0, slots?.pact?.level ?? 0)
  // the class's list, and any more its features open up (Magical Secrets)
  const pc = draftPc(d)
  const lists = new Set([d.cls, ...speciesTraits(pc).filter(a => a.active && isClassOrigin(a.race) && a.race.fields.class === d.cls).flatMap(a => a.trait.spellLists ?? [])])
  // and the spells its subclass puts on its list (the Dusk Prince's expanded spells) or into its spellbook (the Hemomancer's)
  const extra = new Set([...classSpellsFrom(pc, 'list', d.cls), ...classSpellsFrom(pc, 'book', d.cls)].map(x => x.spell))
  const ofClass = entries.value.filter(e => e.type === 'spell' && ((e.fields.classes ?? []).some(c => lists.has(c)) || extra.has(e.id)))
    .sort((a, b) => a.name.localeCompare(b.name))
  const lvl = (e: Entry) => spellLevel(e)
  return { cantrips: ofClass.filter(e => lvl(e) === 0), spells: ofClass.filter(e => lvl(e) >= 1 && lvl(e) <= maxLevel), maxLevel }
}
/** How many cantrips and prepared spells (and spellbook spells) the class has at its level; undefined: no limit known. */
export function spellCounts(d: Draft): { cantrips?: number; prepared?: number; book?: number } {
  const r = rules(d)
  if (!r) return {}
  const i = d.level - 1
  return { cantrips: r.cantrips?.[i] ?? 0, prepared: r.prepared?.[i] ?? 0, book: r.spellbook ? r.spellbook + 2 * (d.level - 1) : undefined }
}
export const casts = (d: Draft) => {
  const r = rules(d)
  return r ? !!(r.cantrips || r.prepared) : spellChoices(d).spells.length + spellChoices(d).cantrips.length > 0
}

// ---------- equipment ----------

// The SRD's weapons, armor and gear (the seed's items), for kit lines the world has no item for: a world started from
// an older seed, or a player's world that only has what the DM shares. Loaded once, when the wizard needs them.
const srdGear = shallowRef<Map<string, Entry> | null>(null)
let gearLoading: Promise<void> | null = null
export function loadSrdGear(): Promise<void> {
  gearLoading ??= import('./seed/world.json').then(m => {
    const seed = m.default as unknown as { dataVersion: number; entries: Entry[] }
    const items = upgradeEntries(seed.entries.filter(e => e.type === 'item').map(e => JSON.parse(JSON.stringify(e)) as Entry), seed.dataVersion).entries
    srdGear.value = new Map(items.map(e => [norm(e.name), e]))
  })
  return gearLoading
}
/** The SRD item a kit line names ("Arrows" finds "Arrow"), if the app has one. */
export const srdItemNamed = (name: string) => srdGear.value?.get(norm(name)) ?? srdGear.value?.get(norm(name).replace(/s$/, ''))
/** A kit line for a pick the player makes ("Musical Instrument (one you chose)"), when the pick wasn't made. */
const UNCHOSEN = /one you chose|of your choice|chosen above/i
/**
 * Where a kit line's item comes from: the world's item, the SRD's (added to the world when the character is made), a
 * new item with just its name, or nowhere (a pick the player didn't make).
 */
export function kitLineSource(l: KitLine): 'world' | 'srd' | 'new' | 'none' {
  if (l.item ?? itemNamed(l.name)) return 'world'
  if (UNCHOSEN.test(l.name)) return 'none'
  return srdItemNamed(l.name) ? 'srd' : 'new'
}
/** Kit lines the world has no item for get one: the SRD's, else a plain item with the line's name. */
function addKitItems(d: Draft) {
  for (const l of kitsOf(d).items) {
    const from = kitLineSource(l)
    if (from === 'world' || from === 'none') continue
    const srd = from === 'srd' ? srdItemNamed(l.name)! : undefined
    const e = createEntry('item', srd?.name ?? l.name, srd ? JSON.parse(JSON.stringify(srd.fields)) : { kind: 'Adventuring Gear' })
    if (srd?.body) { e.body = srd.body; changed(e) }
  }
}

/** The background's equipment as a kit. */
export function backgroundKit(d: Draft): Kit | undefined {
  const eq = get(d.background)?.fields.equipment
  if (!eq) return undefined
  // a line for "the one chosen above" (Soldier: a gaming set) is the tool the player picked for the background
  const tool = get(d.species.picks?.[`${d.background}.${PROFS_TRAIT}`]?.[0])?.name
  return { items: (eq.items ?? []).map(l => ({ name: (!l.item && tool && /chosen above|of your choice/i.test(l.name ?? '') ? tool : (l.item ? get(l.item)?.name : l.name)) ?? l.name ?? '?', amount: l.amount })), money: eq.money ?? 0 }
}
export const backgroundGold = (d: Draft): Copper | undefined => get(d.background)?.fields.equipment?.instead
/** A class's starting equipment options (its own on the class entry, else the SRD's), each line with its world item. */
export function classKitsOf(cls: string | undefined): Kit[] {
  if (!cls) return []
  return (basicsOf(cls).equipment ?? []).map(k => ({
    money: k.money ?? 0,
    items: (k.items ?? []).map(l => {
      const id = l.item && get(l.item) ? l.item : l.name ? itemNamed(l.name)?.id : undefined
      return { name: (id ? get(id)?.name : l.name) ?? l.name ?? '?', ...(l.amount ? { amount: l.amount } : {}), ...(id ? { item: id } : {}) }
    }),
  }))
}
/** The kits taken: the class's chosen option and the background's items or gold. */
export function kitsOf(d: Draft): { items: KitLine[]; money: Copper } {
  const kit = classKitsOf(d.cls)[d.classKit]
  // "Musical Instrument (one you chose)": the instrument or tool the player picked for the class (a Bard's, a Monk's)
  const chosen = d.tools.map(t => (get(t)?.type === 'item' ? get(t)! : itemNamed(t))).filter((e): e is Entry => !!e)
  let next = 0
  const cls = kit && { ...kit, items: kit.items.map(l => {
    if (l.item || !/one you chose|of your choice|chosen above/i.test(l.name)) return l
    const t = chosen[next++]
    return t ? { ...l, name: t.name, item: t.id } : l
  }) }
  const bg = d.bgKit === 'items' ? backgroundKit(d) : { items: [], money: backgroundGold(d) ?? 0 }
  return { items: [...(cls?.items ?? []), ...(bg?.items ?? [])], money: (cls?.money ?? 0) + (bg?.money ?? 0) }
}

// ---------- languages ----------

/**
 * The languages a player picks freely. The 2024 rules: Common and two more of their choice. A species that lists its
 * own languages (as older rules do: "Common, Elvish") gives those instead, plus the languages of choice it names
 * ("one extra language"). Languages the species, background or class give (Druidic, Thieves' Cant) are known anyway.
 */
export function languageRule(d: Draft): { picks: number; given: { id: string; from: string }[]; speciesLists: boolean } {
  const pc = draftPc(d)
  const lineage = raceChain(d.race)
  const listed = lineage.flatMap(r => (r.fields.languages as string[] | undefined) ?? [])
  // the languages of the player's choice ("one extra language")
  const extra = lineage.reduce((n, r) => n + (Number(r.fields.languageChoices) || 0), 0)
  const speciesLists = listed.length > 0 || extra > 0
  const given = speciesGrants(pc).filter(g => g.kind === 'language').map(g => ({ id: g.id, from: g.from }))
  return { picks: speciesLists ? extra : 2, given, speciesLists }
}
/** The languages picked freely (Common, a given language or more than the rule allows don't count). */
export const pickedLanguages = (d: Draft) => {
  const given = new Set(languageRule(d).given.map(g => g.id))
  return d.languages.filter(l => l !== 'Common' && !given.has(l))
}

// ---------- what's still open ----------

export interface Step { id: string; label: string; open: string[] }
/** Each step with what it still needs (an empty list: done). */
export function steps(d: Draft): Step[] {
  const r = rules(d), pc = draftPc(d)
  const s: Step[] = []
  s.push({ id: 'class', label: 'Class', open: [!d.cls && 'a class', !!d.cls && d.level >= subclassLevelOf(d.cls) && !d.subclass && subclassesOf(d.cls).length ? 'a subclass' : ''].filter(Boolean) as string[] })
  s.push({ id: 'origin', label: 'Species & background', open: [!d.race && 'a species', d.race && subracesOf(d.race).length ? 'a subrace' : '', !d.background && backgrounds().length ? 'a background' : '',
    ...speciesTraits(pc).filter(a => !isClassOrigin(a.race) && a.active && choiceOpen(a)).map(a => (a.trait.name === a.race.name ? a.trait.name : `${a.trait.name} (${a.race.name})`))].filter(Boolean) as string[] })
  const unset = ABILITY_KEYS.filter(a => d.base[a] == null).length
  s.push({ id: 'scores', label: 'Ability scores', open: [
    unset ? `${unset} score${unset === 1 ? '' : 's'}` : '',
    d.method === 'pointbuy' && pointsSpent(d) > POINTS ? 'too many points spent' : '',
    d.bonusFrom !== 'custom' && bonusOpen(bonusOf(d), d.bonusChoice) ? 'the bonus\'s picks' : '',
  ].filter(Boolean) as string[] })
  const skillCount = r ? r.skills.count : d.ownSkillCount
  s.push({ id: 'profs', label: 'Proficiencies', open: [
    d.skills.length < skillCount ? `${skillCount - d.skills.length} skill${skillCount - d.skills.length === 1 ? '' : 's'}` : '',
    r?.toolChoice && d.tools.length < r.toolChoice.count ? `${r.toolChoice.count - d.tools.length} ${r.toolChoice.what}` : '',
    !r && d.cls && d.ownSaves.length < 2 ? 'two saving throws' : '',
    pickedLanguages(d).length < languageRule(d).picks ? `${languageRule(d).picks - pickedLanguages(d).length} language${languageRule(d).picks - pickedLanguages(d).length === 1 ? '' : 's'}` : '',
  ].filter(Boolean) as string[] })
  const classFeatures = speciesTraits(pc).filter(a => isClassOrigin(a.race) && a.active)
  if (classFeatures.length) s.push({ id: 'features', label: 'Class features', open: classFeatures.filter(choiceOpen).map(a => a.trait.name) })
  if (featLevels(d).length) s.push({ id: 'feats', label: 'Feats', open: featLevels(d).flatMap(({ level }) => {
    const f = d.feats.find(x => x.level === level)
    if (!f?.feat) return [`a feat at level ${level}`]
    return bonusOpen(get(f.feat)?.fields.abilityIncrease, f.choice) ? [`the scores of ${get(f.feat)?.name}`] : []
  }) })
  // Level 1 takes the die's maximum: nothing to choose (the summary shows it); later levels may take a typed roll.
  if (d.level > 1) s.push({ id: 'hp', label: 'Hit points', open: [] })
  s.push({ id: 'gear', label: 'Equipment', open: [] })
  if (d.cls && casts(d)) {
    const c = spellCounts(d)
    s.push({ id: 'spells', label: 'Spells', open: [
      c.cantrips != null && d.cantrips.length < c.cantrips ? `${c.cantrips - d.cantrips.length} cantrip${c.cantrips - d.cantrips.length === 1 ? '' : 's'}` : '',
      c.prepared != null && d.spells.length < c.prepared ? `${c.prepared - d.spells.length} spell${c.prepared - d.spells.length === 1 ? '' : 's'}` : '',
      c.book != null && d.spells.length + d.book.length < Math.min(c.book, spellChoices(d).spells.length) ? 'spellbook spells' : '',
    ].filter(Boolean) as string[] })
  }
  s.push({ id: 'details', label: 'Name & story', open: [!d.name.trim() && 'a name'].filter(Boolean) as string[] })
  s.push({ id: 'summary', label: 'Summary', open: [] })
  return s
}

export const subclassesOf = (cls: string) => entries.value.filter(e => e.type === 'subclass' && e.fields.class === cls).sort((a, b) => a.name.localeCompare(b.name))
export const backgrounds = () => entries.value.filter(e => e.type === 'background').sort((a, b) => a.name.localeCompare(b.name))
/** The playable main races (no "Subrace of"), by name. */
export const species = () => entries.value.filter(e => e.type === 'race' && !get(e.fields.parent as Id | undefined) && isPlayable(e)).sort((a, b) => a.name.localeCompare(b.name))
/** A race's playable subraces, by name. */
export const subracesOf = (id: Id | undefined) => (id ? entries.value.filter(e => e.type === 'race' && e.fields.parent === id && isPlayable(e)).sort((a, b) => a.name.localeCompare(b.name)) : [])
/** The main race of a race (itself if it has none). */
export const mainRace = (id: Id | undefined): Entry | undefined => raceChain(id, true).at(-1)

// ---------- making it ----------

/** The finished sheet. */
function draftSheet(d: Draft): CharacterSheet {
  const r = rules(d), s = blankSheet()
  s.abilities = finalScores(d)
  s.saves = r ? [...r.saves] : [...d.ownSaves]
  s.skills = Object.fromEntries(d.skills.map(k => [k, 1 as const]))
  s.maxHp = hpOf(d)
  s.hp = s.maxHp
  if (d.size) s.size = d.size
  // Tools by name become the world's Tool items where it has them, else a line of their own.
  const toolIds: Id[] = [], other: string[] = []
  for (const t of [...(r?.tools ?? []), ...d.tools]) {
    const id = get(t)?.type === 'item' ? t : itemNamed(t)?.id
    if (id) toolIds.push(id); else other.push(t)
  }
  s.proficiencies = { armor: r ? [...r.armor] : [...d.ownArmor], weapons: r ? [...r.weapons] : [...d.ownWeapons], tools: toolIds, languages: [...d.languages], ...(other.length ? { other: other.join(', ') } : {}) }
  // The world's items (makeCharacter adds the ones it lacks first); a pick that wasn't made is left out.
  const kits = kitsOf(d)
  const inventory: InventoryLine[] = []
  for (const l of kits.items) {
    const id = l.item ?? itemNamed(l.name)?.id, qty = l.amount ?? 1
    if (!id) continue
    const same = inventory.find(x => x.item === id)
    if (same) same.qty += qty
    else inventory.push({ item: id, qty })
  }
  s.inventory = inventory
  if (kits.money) s.money = kits.money
  // The Origin feat and the feats taken at their levels.
  const feats: Feature[] = []
  const origin = get(d.background)?.fields.originFeat
  const featLine = (id: Id | undefined, note?: string) => {
    const f = get(id)
    // An Ability Score Improvement is all in the scores; nothing to list.
    if (f && /^ability score improvement$/i.test(f.name.trim())) return
    if (f) feats.push({ name: note ? `${f.name} (${note})` : f.name, text: String(f.fields.summary ?? '').trim() })
  }
  featLine(origin, get(d.background)?.fields.originFeatNote)
  for (const f of [...d.feats].sort((a, b) => a.level - b.level)) if (featLevels(d).some(x => x.level === f.level)) featLine(f.feat)
  s.features = feats
  if (Object.keys(d.species).length) s.species = JSON.parse(JSON.stringify(d.species))
  if (casts(d) || d.cantrips.length || d.spells.length) {
    const book: Spellbook = {
      ...emptyBook(),
      known: [...new Set([...d.cantrips, ...d.spells, ...d.book])], prepared: [...d.spells], always: [...d.cantrips],
    }
    const c = spellCounts(d)
    if (c.prepared) book.preparedMax = c.prepared
    s.spellbook = book
  }
  return s
}

/** Make the character, adding the kit's items the world doesn't have yet; returns it. */
export async function makeCharacter(d: Draft): Promise<Entry> {
  await loadSrdGear()
  addKitItems(d)
  const looks = Object.fromEntries(Object.entries(d.looks).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]))
  const fields: Record<string, unknown> = {
    ...(d.player.trim() ? { player: d.player.trim() } : {}),
    classLevels: d.cls ? draftPc(d).fields.classLevels : undefined,
    ...(d.race ? { race: d.race } : {}),
    ...(d.background ? { background: d.background } : {}),
    ...looks,
    sheet: draftSheet(d),
  }
  if (!fields.classLevels) { delete fields.classLevels; fields.level = d.level }
  const e = createEntry('pc', d.name.trim() || 'New character', fields)
  if (d.story.trim()) { e.body = d.story.trim(); changed(e) }
  return e
}
