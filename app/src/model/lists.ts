// The dropdown lists: every choice field in the schema gets its options from a list the DM can manage
// (Archive → Lists). Entries store an option's id, the list gives its label, so renaming an option is one change
// and every entry using it follows. The schema's `options` are a list's starting options; their ids are their
// original names, so data from before the lists needs no conversion. Options the app relies on (`fixed` in the
// schema) can be renamed but not removed.
import { SCHEMA, type FieldDef } from './schema'
import type { Database, EntryType } from './types'

export interface ListOption {
  id: string
  label: string
  /** What the option means (a weapon property's rule, for example); shown on hover and in item cards. */
  note?: string
}
export interface ListDef {
  key: string
  /** "Item · Kind", or the shared list's own name. */
  label: string
  defaults: readonly string[]
  fixed: readonly string[]
  /** The fields that pick from it. */
  fields: { type: EntryType; def: FieldDef }[]
  /** Character sheet proficiencies that pick from it. */
  sheet?: 'armor' | 'weapons' | 'languages'
  /** What a fixed option does, for the Lists page. */
  why?: string
}

/** Lists shared by several fields, or used outside the entry fields: their names and starting options. */
const SHARED: Record<string, { label: string; options?: readonly string[]; sheet?: ListDef['sheet'] }> = {
  class: { label: 'Classes' },
  weaponProperty: { label: 'Weapon properties' },
  weaponMastery: { label: 'Weapon masteries' },
  ingredientProperty: { label: 'Ingredient properties' },
  ability: { label: 'Abilities' },
  size: { label: 'Sizes' },
  language: {
    label: 'Languages', sheet: 'languages',
    options: ['Common', 'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc', 'Abyssal', 'Celestial', 'Draconic', 'Deep Speech', 'Infernal', 'Primordial', 'Sylvan', 'Undercommon', "Thieves' Cant", 'Druidic'],
  },
}
const SHEET: Record<string, ListDef['sheet']> = { 'item.armorType': 'armor', 'item.weaponCategory': 'weapons', 'item.baseWeapon': 'weapons' }
const WHY = 'used by the app (filters, the character sheet, which fields an entry shows)'

/** Every field that picks from a list: select fields, and list fields with options. */
const pickers = SCHEMA.flatMap(t => t.fields.filter((f: FieldDef) => (f.kind === 'select' || f.kind === 'list') && f.options).map((f: FieldDef) => ({ type: t.type as EntryType, def: f })))
const keyOf = new Map<FieldDef, string>(pickers.map(p => [p.def, p.def.list ?? `${p.type}.${p.def.key}`]))

export const LISTS: ListDef[] = (() => {
  const out = new Map<string, ListDef>()
  for (const p of pickers) {
    const key = keyOf.get(p.def)!
    const shared = SHARED[key]
    const l = out.get(key) ?? { key, label: shared?.label ?? `${SCHEMA.find(t => t.type === p.type)!.label} · ${p.def.label}`, defaults: shared?.options ?? p.def.options ?? [], fixed: [], fields: [], sheet: shared?.sheet ?? SHEET[key], why: WHY }
    l.fields.push(p)
    l.fixed = [...new Set([...l.fixed, ...(p.def.fixed ?? [])])]
    out.set(key, l)
  }
  for (const [key, s] of Object.entries(SHARED)) if (!out.has(key)) out.set(key, { key, label: s.label, defaults: s.options ?? [], fixed: [], fields: [], sheet: s.sheet })
  return [...out.values()].sort((a, b) => a.label.localeCompare(b.label))
})()
export const LIST_BY_KEY = new Map(LISTS.map(l => [l.key, l]))

/** The list a field picks from, if it does. */
export const listKeyOf = (f: FieldDef | undefined) => (f ? keyOf.get(f) : undefined)

/** Descriptions the starting options come with. */
const DEFAULT_NOTES: Record<string, Record<string, string>> = {
  weaponProperty: {
    Ammunition: 'Needs ammunition to make a ranged attack; each attack uses a piece. Drawing it is part of the attack.',
    Finesse: 'Use Strength or Dexterity for the attack and damage rolls.',
    Heavy: 'Small creatures have disadvantage on attack rolls with it.',
    Light: 'Small and easy to handle: good for fighting with two weapons.',
    Loading: 'Fire only one piece of ammunition per action, bonus action or reaction, whatever the number of attacks.',
    Reach: 'Adds 5 feet to your reach when you attack with it, and for opportunity attacks.',
    Special: 'Has unusual rules, described with the weapon.',
    Thrown: 'Can be thrown for a ranged attack, using the same ability as for melee attacks.',
    'Two-Handed': 'Needs two hands to attack with.',
    Versatile: 'Can be used with one or two hands; the damage in brackets is for two hands.',
  },
  weaponMastery: {
    Cleave: 'On a melee hit, make another attack roll against a second creature within 5 feet of the first and within reach (once per turn); its damage adds no ability modifier unless negative.',
    Graze: 'On a miss, the target still takes damage equal to the ability modifier used for the attack, of the weapon’s type.',
    Nick: 'The extra attack of the Light property can be part of the Attack action instead of a bonus action (once per turn).',
    Push: 'On a hit, push the creature (Large or smaller) up to 10 feet straight away from you.',
    Sap: 'On a hit, the creature has disadvantage on its next attack roll before the start of your next turn.',
    Slow: 'On a hit that deals damage, the creature’s speed drops by 10 feet until the start of your next turn (not cumulative).',
    Topple: 'On a hit, the creature makes a Constitution save (DC 8 + your ability modifier and proficiency bonus) or has the Prone condition.',
    Vex: 'On a hit that deals damage, you have advantage on your next attack roll against that creature before the end of your next turn.',
  },
}
/** A list's options in a world: the stored ones, or the starting ones; fixed options are always there. */
export function optionsIn(meta: Database['meta'] | undefined, key: string): ListOption[] {
  const def = LIST_BY_KEY.get(key)
  const stored = meta?.lists?.[key]
  const notes = DEFAULT_NOTES[key] ?? {}
  const list = stored ?? (def?.defaults ?? []).map(id => (notes[id] ? { id, label: id, note: notes[id] } : { id, label: id }))
  const missing = (def?.fixed ?? []).filter(id => !list.some(o => o.id === id)).map(id => ({ id, label: id }))
  return missing.length ? [...list, ...missing] : list
}
/** An option's label; an id the list doesn't have shows as itself. */
export function labelIn(meta: Database['meta'] | undefined, key: string | undefined, id: unknown): string {
  if (id == null) return ''
  if (!key) return String(id)
  return optionsIn(meta, key).find(o => o.id === id)?.label ?? String(id)
}

/** An option's description, if it has one. */
export function noteIn(meta: Database['meta'] | undefined, key: string | undefined, id: unknown): string | undefined {
  return key ? optionsIn(meta, key).find(o => o.id === id)?.note : undefined
}
