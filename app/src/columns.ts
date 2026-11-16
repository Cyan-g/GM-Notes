// Table columns and filters by key, shared by type lists and dashboards.
// A key is a schema field ("level", "value") or a computed value starting with "@".
import type { Entry, EntryType, RecipeLine, Statblock, WorldDate } from './model/types'
import { craftingMinutes, craftingTime } from './crafting'
import { SCHEMA, TYPES, type FieldDef } from './model/schema'
import { dateKey, entries, get, isCurrent, relationsOf } from './store'

export interface Col {
  key: string
  label: string
  /** Shown with the normal field renderer when set. */
  field?: FieldDef
  value: (e: Entry) => unknown
  sort: (e: Entry) => string | number
  /** For computed columns: list of entry ids to show as links, or plain text. */
  kind?: 'ids' | 'text' | 'money' | 'date'
}

const FIELD_BY_KEY = new Map<string, FieldDef>()
for (const t of SCHEMA) for (const f of t.fields) if (!FIELD_BY_KEY.has(f.key)) FIELD_BY_KEY.set(f.key, f)

const current = (e: Entry, kind: string, mine: boolean) =>
  (relationsOf.value.get(e.id) ?? []).filter(r => r.kind === kind && (mine ? r.a === e.id : r.b === e.id) && isCurrent(r)).map(r => (mine ? r.b : r.a))

export const recipeCost = (e: Entry) => {
  const lines = e.fields.recipe as RecipeLine[] | undefined
  if (!lines?.length) return undefined
  return lines.reduce((s, l) => s + ((get(l.item)?.fields.value as number | undefined) ?? 0) * l.amount, 0)
}
const usedIn = (e: Entry) => entries.value.filter(n => ((n.fields.recipe as RecipeLine[] | undefined) ?? []).some(l => l.item === e.id)).length
const crNum = (cr?: string) => { if (!cr) return 999; const [a, b] = cr.split('/').map(Number); return b ? a / b : a }
const nameOf = (id?: string) => get(id)?.name ?? '~'

const COMPUTED: Record<string, Omit<Col, 'key'>> = {
  '@type': { label: 'Type', value: e => TYPES[e.type].label, sort: e => TYPES[e.type].label, kind: 'text' },
  '@aliases': { label: 'Also known as', value: e => e.aliases.join(', '), sort: e => e.aliases.join(', ').toLowerCase() || '~', kind: 'text' },
  '@lives-in': { label: 'Lives in', value: e => current(e, 'lives-in', true), sort: e => nameOf(current(e, 'lives-in', true)[0]), kind: 'ids' },
  '@member': { label: 'Member of', value: e => current(e, 'member', true), sort: e => nameOf(current(e, 'member', true)[0]), kind: 'ids' },
  '@members': { label: 'Members', value: e => current(e, 'member', false).length, sort: e => -current(e, 'member', false).length, kind: 'text' },
  '@cr': { label: 'CR', value: e => (e.fields.statblock as Statblock | undefined)?.cr, sort: e => crNum((e.fields.statblock as Statblock | undefined)?.cr), kind: 'text' },
  '@recipeCost': { label: 'Ingredients', value: e => recipeCost(e), sort: e => recipeCost(e) ?? -1, kind: 'money' },
  '@margin': {
    label: 'Profit', kind: 'money',
    value: e => { const c = recipeCost(e), v = e.fields.value as number | undefined; return c != null && v != null ? v - c : undefined },
    sort: e => { const c = recipeCost(e), v = e.fields.value as number | undefined; return c != null && v != null ? v - c : -1e9 },
  },
  '@craftTime': {
    label: 'Crafting time', kind: 'text',
    value: e => ((e.fields.recipe as unknown[] | undefined)?.length ? craftingTime(e.fields.value) : ''),
    sort: e => craftingMinutes(e.fields.value) ?? 1e9,
  },
  '@usedIn': { label: 'Used in', value: e => usedIn(e) || '', sort: e => -usedIn(e), kind: 'text' },
  '@updated': { label: 'Last edited', value: e => new Date(e.updated).toLocaleString(), sort: e => -Date.parse(e.updated), kind: 'text' },
}

export function column(key: string, type?: EntryType): Col {
  if (key === 'name') return { key, label: 'Name', value: e => e.name, sort: e => e.name.toLowerCase() }
  const c = COMPUTED[key]
  if (c) return { key, ...c }
  const field = (type && TYPES[type].fields.find(f => f.key === key)) || FIELD_BY_KEY.get(key)
  if (!field) return { key, label: key, value: e => e.fields[key], sort: e => String(e.fields[key] ?? '~'), kind: 'text' }
  return {
    key, label: field.label, field,
    value: e => e.fields[key],
    sort: e => {
      const v = e.fields[key]
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) return field.kind === 'money' || field.kind === 'number' ? -1e12 : '~'
      if (field.kind === 'ref') return nameOf(v as string)
      if (field.kind === 'date') return dateKey(v as WorldDate)
      if (field.kind === 'bool') return v ? 0 : 1
      if (key === 'level') return v === 'Cantrip' ? 0 : Number(v)
      if (typeof v === 'number') return v
      if (Array.isArray(v)) return v.join(', ').toLowerCase()
      return String(v).toLowerCase()
    },
  }
}

export interface Facet {
  key: string
  label: string
  values: (rows: Entry[]) => string[]
  match: (e: Entry, v: string) => boolean
}

/** A dropdown filter. List fields (classes) match if they contain the value; relations match by name. */
export function facet(key: string, type?: EntryType): Facet {
  if (key === '@member' || key === '@lives-in') {
    const kind = key === '@member' ? 'member' : 'lives-in'
    return {
      key, label: COMPUTED[key].label,
      values: rows => [...new Set(rows.flatMap(e => current(e, kind, true).map(nameOf)))].sort(),
      match: (e, v) => current(e, kind, true).some(id => nameOf(id) === v),
    }
  }
  if (key === '@type') return { key, label: 'Type', values: rows => [...new Set(rows.map(e => TYPES[e.type].label))].sort(), match: (e, v) => TYPES[e.type].label === v }
  const field = (type && TYPES[type].fields.find(f => f.key === key)) || FIELD_BY_KEY.get(key)
  const label = field?.label ?? key
  const vals = (e: Entry): string[] => {
    const v = e.fields[key]
    if (v == null || v === '') return []
    if (field?.kind === 'bool') return [v ? 'Yes' : 'No']
    if (field?.kind === 'ref') return [nameOf(v as string)]
    if (Array.isArray(v)) return v.map(String)
    return [String(v)]
  }
  const order = field?.options
  return {
    key, label,
    values: rows => {
      const set = [...new Set(rows.flatMap(vals))]
      return order ? set.sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999) || a.localeCompare(b)) : set.sort()
    },
    match: (e, v) => vals(e).includes(v),
  }
}
