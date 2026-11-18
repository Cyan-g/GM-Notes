// The dropdown lists: every choice field in the schema gets its options from a list the DM can manage
// (Archive → Lists). Entries store an option's id, the list gives its label, so renaming an option is one change
// and every entry using it follows. The schema's `options` are a list's starting options; their ids are their
// original names, so data from before the lists needs no conversion. Options the app relies on (`fixed` in the
// schema) can be renamed but not removed.
import { SCHEMA, type FieldDef } from './schema'
import type { Database, EntryType } from './types'

export interface ListOption { id: string; label: string }
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

/** A list's options in a world: the stored ones, or the starting ones; fixed options are always there. */
export function optionsIn(meta: Database['meta'] | undefined, key: string): ListOption[] {
  const def = LIST_BY_KEY.get(key)
  const stored = meta?.lists?.[key]
  const list = stored ?? (def?.defaults ?? []).map(id => ({ id, label: id }))
  const missing = (def?.fixed ?? []).filter(id => !list.some(o => o.id === id)).map(id => ({ id, label: id }))
  return missing.length ? [...list, ...missing] : list
}
/** An option's label; an id the list doesn't have shows as itself. */
export function labelIn(meta: Database['meta'] | undefined, key: string | undefined, id: unknown): string {
  if (id == null) return ''
  if (!key) return String(id)
  return optionsIn(meta, key).find(o => o.id === id)?.label ?? String(id)
}
