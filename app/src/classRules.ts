// What the twelve classes of the SRD 5.2.1 (CC BY 4.0) give a new character, for the character creation wizard:
// saving throws, the skills to pick from, armor, weapon and tool proficiencies, cantrips and prepared spells by level,
// the levels with a feat (Ability Score Improvement, or an Epic Boon at 19), and starting equipment or gold instead.
// The hit die, spell slots and casting ability are in model/classes.ts, slots.ts and sheet.ts. A class that isn't
// here (homebrew, or one the SRD doesn't have) is filled in by hand in the wizard.
import type { Abilities, ClassBasics, Copper } from './model/types'
import { state } from './store'
import { CLASS_DIE } from './model/classes'

type Ability = keyof Abilities
/** A thing a class's or background's equipment holds, by name (matched to the world's items when it has them). */
export interface KitLine { name: string; amount?: number }
/** One equipment option: items and coins. */
export interface Kit { items: KitLine[]; money: Copper }

export interface ClassRules {
  saves: Ability[]
  /** Pick `count` skills from `from` (empty: any skill). */
  skills: { count: number; from: string[] }
  armor: string[]
  weapons: string[]
  /** Tools by name; `toolChoice` asks the player for that many tools (or instruments) of their own. */
  tools: string[]
  toolChoice?: { count: number; what: string }
  /** Cantrips known and spells prepared, by class level (index 0 is level 1); none for non-casters. */
  cantrips?: number[]
  prepared?: number[]
  /** A wizard's spellbook holds this many spells at level 1, and two more each level. */
  spellbook?: number
  /** Levels that give a feat (an Ability Score Improvement or another); the last is an Epic Boon. */
  featLevels: number[]
  /** Starting equipment: the options (A, B…); the last is gold only. */
  equipment: Kit[]
}

/** The class level its subclass is chosen at. */
export const SUBCLASS_LEVEL = 3
/** The level an Epic Boon is chosen at. */
export const EPIC_BOON_LEVEL = 19

const by = (steps: [number, number][]) => Array.from({ length: 20 }, (_, i) => steps.filter(([at]) => i + 1 >= at).at(-1)![1])
const list = (s: string) => s.split(' ').map(Number)
const gp = (n: number) => n * 100
const kit = (money: number, ...items: (string | [string, number])[]): Kit =>
  ({ items: items.map(x => (typeof x === 'string' ? { name: x } : { name: x[0], amount: x[1] })), money: gp(money) })
const FEATS = [4, 8, 12, 16, 19]
const FULL_PREP = list('4 5 6 7 9 10 11 12 14 15 16 16 17 17 18 18 19 20 21 22')
const HALF_PREP = list('2 3 4 5 6 6 7 7 9 9 10 10 11 11 12 12 14 14 15 15')
const ALL_ARMOR = ['Light', 'Medium', 'Heavy', 'Shield']

export const CLASS_RULES: Record<string, ClassRules> = {
  Barbarian: {
    saves: ['str', 'con'], skills: { count: 2, from: ['Animal Handling', 'Athletics', 'Intimidation', 'Nature', 'Perception', 'Survival'] },
    armor: ['Light', 'Medium', 'Shield'], weapons: ['Simple', 'Martial'], tools: [], featLevels: FEATS,
    equipment: [kit(15, 'Greataxe', ['Handaxe', 4], "Explorer's Pack"), kit(75)],
  },
  Bard: {
    saves: ['dex', 'cha'], skills: { count: 3, from: [] }, armor: ['Light'], weapons: ['Simple'],
    tools: [], toolChoice: { count: 3, what: 'musical instruments' },
    cantrips: by([[1, 2], [4, 3], [10, 4]]), prepared: FULL_PREP, featLevels: FEATS,
    equipment: [kit(19, 'Leather Armor', ['Dagger', 2], 'Musical Instrument (one you chose)', "Entertainer's Pack"), kit(90)],
  },
  Cleric: {
    saves: ['wis', 'cha'], skills: { count: 2, from: ['History', 'Insight', 'Medicine', 'Persuasion', 'Religion'] },
    armor: ['Light', 'Medium', 'Shield'], weapons: ['Simple'], tools: [],
    cantrips: by([[1, 3], [4, 4], [10, 5]]), prepared: FULL_PREP, featLevels: FEATS,
    equipment: [kit(7, 'Chain Shirt', 'Shield', 'Mace', 'Holy Symbol', "Priest's Pack"), kit(110)],
  },
  Druid: {
    saves: ['int', 'wis'], skills: { count: 2, from: ['Arcana', 'Animal Handling', 'Insight', 'Medicine', 'Nature', 'Perception', 'Religion', 'Survival'] },
    armor: ['Light', 'Shield'], weapons: ['Simple'], tools: ['Herbalism Kit'],
    cantrips: by([[1, 2], [4, 3], [10, 4]]), prepared: FULL_PREP, featLevels: FEATS,
    equipment: [kit(9, 'Leather Armor', 'Shield', 'Sickle', 'Druidic Focus (Quarterstaff)', "Explorer's Pack", 'Herbalism Kit'), kit(50)],
  },
  Fighter: {
    saves: ['str', 'con'], skills: { count: 2, from: ['Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Persuasion', 'Perception', 'Survival'] },
    armor: ALL_ARMOR, weapons: ['Simple', 'Martial'], tools: [], featLevels: [4, 6, 8, 12, 14, 16, 19],
    equipment: [
      kit(4, 'Chain Mail', 'Greatsword', 'Flail', ['Javelin', 8], "Dungeoneer's Pack"),
      kit(11, 'Studded Leather Armor', 'Scimitar', 'Shortsword', 'Longbow', ['Arrows', 20], 'Quiver', "Dungeoneer's Pack"),
      kit(155),
    ],
  },
  Monk: {
    saves: ['str', 'dex'], skills: { count: 2, from: ['Acrobatics', 'Athletics', 'History', 'Insight', 'Religion', 'Stealth'] },
    // Simple weapons and Martial weapons with the Light property.
    armor: [], weapons: ['Simple', 'Scimitar', 'Shortsword', 'Hand Crossbow'], tools: [], toolChoice: { count: 1, what: "artisan's tools or musical instrument" },
    featLevels: FEATS,
    equipment: [kit(11, 'Spear', ['Dagger', 5], "Artisan's Tools or Musical Instrument (the one you chose)", "Explorer's Pack"), kit(50)],
  },
  Paladin: {
    saves: ['wis', 'cha'], skills: { count: 2, from: ['Athletics', 'Insight', 'Intimidation', 'Medicine', 'Persuasion', 'Religion'] },
    armor: ALL_ARMOR, weapons: ['Simple', 'Martial'], tools: [], prepared: HALF_PREP, featLevels: FEATS,
    equipment: [kit(9, 'Chain Mail', 'Shield', 'Longsword', ['Javelin', 6], 'Holy Symbol', "Priest's Pack"), kit(150)],
  },
  Ranger: {
    saves: ['str', 'dex'], skills: { count: 3, from: ['Animal Handling', 'Athletics', 'Insight', 'Investigation', 'Nature', 'Perception', 'Stealth', 'Survival'] },
    armor: ['Light', 'Medium', 'Shield'], weapons: ['Simple', 'Martial'], tools: [], prepared: HALF_PREP, featLevels: FEATS,
    equipment: [kit(7, 'Studded Leather Armor', 'Scimitar', 'Shortsword', 'Longbow', ['Arrows', 20], 'Quiver', 'Druidic Focus (sprig of mistletoe)', "Explorer's Pack"), kit(150)],
  },
  Rogue: {
    saves: ['dex', 'int'], skills: { count: 4, from: ['Acrobatics', 'Athletics', 'Deception', 'Insight', 'Intimidation', 'Investigation', 'Perception', 'Persuasion', 'Sleight of Hand', 'Stealth'] },
    // Simple weapons and Martial weapons with the Finesse or Light property.
    armor: ['Light'], weapons: ['Simple', 'Hand Crossbow', 'Rapier', 'Scimitar', 'Shortsword', 'Whip'], tools: ["Thieves' Tools"],
    featLevels: [4, 8, 10, 12, 16, 19],
    equipment: [kit(8, 'Leather Armor', ['Dagger', 2], 'Shortsword', 'Shortbow', ['Arrows', 20], 'Quiver', "Thieves' Tools", "Burglar's Pack"), kit(100)],
  },
  Sorcerer: {
    saves: ['con', 'cha'], skills: { count: 2, from: ['Arcana', 'Deception', 'Insight', 'Intimidation', 'Persuasion', 'Religion'] },
    armor: [], weapons: ['Simple'], tools: [],
    cantrips: by([[1, 4], [4, 5], [10, 6]]), prepared: list('2 4 6 7 9 10 11 12 14 15 16 16 17 17 18 18 19 20 21 22'), featLevels: FEATS,
    equipment: [kit(28, 'Spear', ['Dagger', 2], 'Arcane Focus (crystal)', "Dungeoneer's Pack"), kit(50)],
  },
  Warlock: {
    saves: ['wis', 'cha'], skills: { count: 2, from: ['Arcana', 'Deception', 'History', 'Intimidation', 'Investigation', 'Nature', 'Religion'] },
    armor: ['Light'], weapons: ['Simple'], tools: [],
    cantrips: by([[1, 2], [4, 3], [10, 4]]), prepared: list('2 3 4 5 6 7 8 9 10 10 11 11 12 12 13 13 14 14 15 15'), featLevels: FEATS,
    equipment: [kit(15, 'Leather Armor', 'Sickle', ['Dagger', 2], 'Arcane Focus (orb)', 'Book (occult lore)', "Scholar's Pack"), kit(100)],
  },
  Wizard: {
    saves: ['int', 'wis'], skills: { count: 2, from: ['Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Nature', 'Religion'] },
    armor: [], weapons: ['Simple'], tools: [],
    cantrips: by([[1, 3], [4, 4], [10, 5]]), prepared: list('4 5 6 7 9 10 11 12 14 15 16 16 17 18 19 21 22 23 24 25'), spellbook: 6, featLevels: FEATS,
    equipment: [kit(5, ['Dagger', 2], 'Arcane Focus (Quarterstaff)', 'Robe', 'Spellbook', "Scholar's Pack"), kit(55)],
  },
}

/** The rules of a class by its list id (the standard ones are their own names). */
/** The rules of a class by its list id: the built-in SRD ones with what its class entry changes ("Class basics"),
 * or only the entry's for a class the app doesn't know (homebrew); undefined when neither has any. */
export function rulesOf(cls: string | undefined): ClassRules | undefined {
  if (!cls) return undefined
  const own = ownBasics(cls), base = CLASS_RULES[cls]
  if (!base && !own) return undefined
  const b = base ?? { saves: [], skills: { count: 2, from: [] }, armor: [], weapons: [], tools: [], featLevels: FEATS, equipment: [] }
  if (!own) return b
  return {
    ...b,
    ...(own.saves ? { saves: own.saves } : {}), ...(own.skills ? { skills: own.skills } : {}),
    ...(own.armor ? { armor: own.armor } : {}), ...(own.weapons ? { weapons: own.weapons } : {}), ...(own.tools ? { tools: own.tools } : {}),
    ...(own.cantrips ? { cantrips: own.cantrips } : {}), ...(own.prepared ? { prepared: own.prepared } : {}),
    ...(own.spellbook != null ? { spellbook: own.spellbook || undefined } : {}), ...(own.featLevels ? { featLevels: own.featLevels } : {}),
  }
}

// ---- the class entry's own basics (its Edit page), over the built-in ones ----
/** What a class's entry sets in "Class basics" (fields.basics), if anything. */
export function ownBasics(cls: string): ClassBasics | undefined {
  const e = Object.values(state.db?.entries ?? {}).find(x => x.type === 'class' && x.fields.class === cls)
  const b = e?.fields.basics as ClassBasics | undefined
  return b && Object.keys(b).length ? b : undefined
}
/** How each SRD class casts: its slot table and casting ability. */
const CASTER: Record<string, ClassBasics['caster']> = {
  Bard: 'full', Cleric: 'full', Druid: 'full', Sorcerer: 'full', Wizard: 'full', Paladin: 'half', Ranger: 'half', Artificer: 'artificer', Warlock: 'pact',
}
const CASTING: Record<string, Ability> = {
  Artificer: 'int', Wizard: 'int', Bard: 'cha', Paladin: 'cha', Sorcerer: 'cha', Warlock: 'cha', Cleric: 'wis', Druid: 'wis', Ranger: 'wis',
}
/** The built-in basics of a class (the SRD's), for the editor's placeholders and as the default. */
export function builtInBasics(cls: string): ClassBasics {
  const r = CLASS_RULES[cls]
  return {
    hitDie: CLASS_DIE[cls] ?? 'd8', caster: CASTER[cls] ?? 'none', ...(CASTING[cls] ? { casting: CASTING[cls] } : {}),
    subclassLevel: SUBCLASS_LEVEL, featLevels: r?.featLevels ?? FEATS,
    ...(r ? { saves: r.saves, skills: r.skills, armor: r.armor, weapons: r.weapons, tools: r.tools } : {}),
    ...(r?.cantrips ? { cantrips: r.cantrips } : {}), ...(r?.prepared ? { prepared: r.prepared } : {}), ...(r?.spellbook ? { spellbook: r.spellbook } : {}),
    ...(MULTICLASS[cls] ? { multiclass: MULTICLASS[cls] } : {}),
  }
}
/** A class's basics: the entry's where it sets them, else the built-in ones. */
export function basicsOf(cls: string): ClassBasics {
  return { ...builtInBasics(cls), ...(ownBasics(cls) ?? {}) }
}
export const hitDieOf = (cls: string) => basicsOf(cls).hitDie ?? 'd8'
export const subclassLevelOf = (cls: string | undefined) => (cls ? basicsOf(cls).subclassLevel ?? SUBCLASS_LEVEL : SUBCLASS_LEVEL)
export const multiclassOf = (cls: string): Multiclass | undefined => basicsOf(cls).multiclass
export const casterOf = (cls: string) => basicsOf(cls).caster ?? 'none'
export const castingOf = (cls: string): Ability | undefined => basicsOf(cls).casting

/**
 * Multiclassing (SRD 5.2.1): the scores a class asks for (13 or more in each, or in one of them with `any`), from the new
 * class and every class the character already has, and the proficiencies a new class brings (fewer than at level 1).
 */
export interface Multiclass {
  primary: Ability[]
  any?: boolean
  armor: string[]
  weapons: string[]
  tools: string[]
  /** Skills to pick: from the class's list (empty: any). */
  skills?: number
  /** Musical instruments to pick. */
  instruments?: number
}
export const MULTICLASS: Record<string, Multiclass> = {
  Barbarian: { primary: ['str'], armor: ['Shield'], weapons: ['Martial'], tools: [] },
  Bard: { primary: ['cha'], armor: ['Light'], weapons: [], tools: [], skills: 1, instruments: 1 },
  Cleric: { primary: ['wis'], armor: ['Light', 'Medium', 'Shield'], weapons: [], tools: [] },
  Druid: { primary: ['wis'], armor: ['Light', 'Shield'], weapons: [], tools: [] },
  Fighter: { primary: ['str', 'dex'], any: true, armor: ['Light', 'Medium', 'Shield'], weapons: ['Martial'], tools: [] },
  Monk: { primary: ['dex', 'wis'], armor: [], weapons: [], tools: [] },
  Paladin: { primary: ['str', 'cha'], armor: ['Light', 'Medium', 'Shield'], weapons: ['Martial'], tools: [] },
  Ranger: { primary: ['dex', 'wis'], armor: ['Light', 'Medium', 'Shield'], weapons: ['Martial'], tools: [], skills: 1 },
  Rogue: { primary: ['dex'], armor: ['Light'], weapons: [], tools: ["Thieves' Tools"], skills: 1 },
  Sorcerer: { primary: ['cha'], armor: [], weapons: [], tools: [] },
  Warlock: { primary: ['cha'], armor: ['Light'], weapons: [], tools: [] },
  Wizard: { primary: ['int'], armor: [], weapons: [], tools: [] },
}
