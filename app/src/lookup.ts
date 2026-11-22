// Finding entries by what they're called: a name written as text (a kit's "Arrows", a deity's realm, a feature line
// "Magic Initiate (Cleric)") to the world's entry of that name; and the feats an entry grants.
import type { Entry, EntryType, Id } from './model/types'
import { byType } from './store'
import { norm } from './model/text'

export interface NamedOptions {
  /** Case, accents and punctuation don't count ("Thieves Tools" finds "Thieves' Tools"); else only case and outer spaces. */
  loose?: boolean
  /** A plural finds the singular too ("Arrows" finds "Arrow"), when nothing has the name as written. */
  plural?: boolean
  /** An alias counts as a name. */
  aliases?: boolean
  /** A name with a note in brackets after it counts ("Magic Initiate (Cleric)" finds Magic Initiate); the longest name wins. */
  qualified?: boolean
}

/** Any entry with exactly this name, else with it as an alias (a [[link]] written by name instead of id). */
export function entryByName(name: string): Entry | undefined {
  const n = name.trim().toLowerCase()
  if (!n) return undefined
  const all = [...byType.value.values()].flat()
  return all.find(e => e.name.trim().toLowerCase() === n) ?? all.find(e => e.aliases.some(a => a.trim().toLowerCase() === n))
}

/** The world's entry of a type with that name, if there is one (see NamedOptions for what else counts). */
export function entryNamed(type: EntryType, name: string | undefined, o: NamedOptions = {}): Entry | undefined {
  const key = (s: string) => (o.loose ? norm(s) : s.trim().toLowerCase())
  const n = key(name ?? '')
  if (!n) return undefined
  const list = byType.value.get(type) ?? []
  const names = (e: Entry) => (o.aliases ? [e.name, ...e.aliases] : [e.name]).map(key)
  if (o.qualified) {
    const fits = list.filter(e => names(e).some(m => n === m || n.startsWith(m + ' (')))
    return fits.sort((a, b) => b.name.length - a.name.length)[0]
  }
  const exact = list.find(e => names(e).includes(n))
  if (exact || !o.plural) return exact
  const single = n.replace(/s$/, '')
  return list.find(e => names(e).includes(single))
}

/** A world item for a name, loosely matched ("Arrows" finds "Arrow"), if there is one. */
export const itemNamed = (name: string) => entryNamed('item', name, { loose: true, plural: true })

/** The feats an entry grants (an organization's fighting styles and the like): those whose source it is, by name. */
export const featsGrantedBy = (id: Id) => (byType.value.get('feat') ?? []).filter(f => f.fields.source === id).sort((a, b) => a.name.localeCompare(b.name))
