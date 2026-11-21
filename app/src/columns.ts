// Table columns and filters by key, shared by type lists and dashboards.
// A key is a schema field ("level", "value") or a computed value starting with "@".
import type { AbilityBonus, Entry, EntryType, RecipeLine, RelationKind, Statblock, WorldDate } from './model/types'
import { craftingMinutes, craftingTime, recipeCost } from './crafting'
import { SCHEMA, TYPES, byKey, type FieldDef } from './model/schema'
import { dateKey, entries, fieldLabel, fieldOptions, get, relatedIds, state } from './store'
import { classText, totalLevel } from './model/classes'
import { listKeyOf } from './model/lists'
import { sessionNo } from './sessions'
import { abilityBonusText } from './abilityBonus'
import { describeRequirements } from './requirements'
import { statsOf } from './encounter'
import { statusText } from './npc'
import { partyLine } from './sheet'
import { leadersOf } from './org'
import { ORD, crNum, spellLevel } from './model/dnd'
import { carriersOf, shopsSelling } from './items'
import { attackOrSave } from './spells'

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

const current = (e: Entry, kind: RelationKind, mine: boolean) => relatedIds(e.id, kind, mine ? 'out' : 'in', { current: true })

const usedIn = (e: Entry) => entries.value.filter(n => ((n.fields.recipe) ?? []).some(l => l.item === e.id)).length
const nameOf = (id?: string) => get(id)?.name ?? '~'
/** Who carries an item and where it's sold (characters first). */
const whereItem = (e: Entry) => [...carriersOf(e).map(x => x.p.id), ...shopsSelling(e).map(x => x.s.id)]
/** A spell's level as a number, −1 without one (so it sorts last and shows blank). */
const levelOf = (e: Entry) => spellLevel(e, -1)
const prereqText = (e: Entry) => String(e.fields.prerequisite ?? '') || describeRequirements(e)
const speedText = (e: Entry) => {
  const s = e.fields.speeds
  return s ? [s.walk != null && `${s.walk} ft`, ...(['swim', 'fly', 'climb', 'burrow'] as const).filter(k => s[k]).map(k => `${k} ${s[k]}`)].filter(Boolean).join(', ') : ''
}
const concRitual = (e: Entry) => [e.fields.concentration && 'C', e.fields.ritual && 'R'].filter(Boolean).join(' ')

const COMPUTED: Record<string, Omit<Col, 'key'>> = {
  '@type': { label: 'Type', value: e => TYPES[e.type].label, sort: e => TYPES[e.type].label, kind: 'text' },
  '@aliases': { label: 'Also known as', value: e => e.aliases.join(', '), sort: e => e.aliases.join(', ').toLowerCase() || '~', kind: 'text' },
  '@lives-in': { label: 'Lives in', value: e => current(e, 'lives-in', true), sort: e => nameOf(current(e, 'lives-in', true)[0]), kind: 'ids' },
  '@member': { label: 'Member of', value: e => current(e, 'member', true), sort: e => nameOf(current(e, 'member', true)[0]), kind: 'ids' },
  // an item: the characters carrying it, then the shops selling it
  '@where': { label: 'Where', value: e => (e.type === 'item' ? whereItem(e) : []), sort: e => (e.type === 'item' ? -whereItem(e).length : 0), kind: 'ids' },
  // a place: how many places are right inside it, and how many live there now
  '@subplaces': { label: 'Places inside', value: e => (e.type === 'place' ? entries.value.filter(p => p.type === 'place' && p.fields.parent === e.id).length || '' : ''), sort: e => -entries.value.filter(p => p.type === 'place' && p.fields.parent === e.id).length, kind: 'text' },
  '@residents': { label: 'Residents', value: e => current(e, 'lives-in', false).length || '', sort: e => -current(e, 'lives-in', false).length, kind: 'text' },
  // an organization's leaders (members whose role leads) and the gods it worships
  '@leader': { label: 'Led by', value: e => (e.type === 'organization' ? leadersOf(e) : []), sort: e => nameOf(e.type === 'organization' ? leadersOf(e)[0] : undefined), kind: 'ids' },
  '@worships': { label: 'Worships', value: e => current(e, 'worships', true), sort: e => nameOf(current(e, 'worships', true)[0]), kind: 'ids' },
  '@members': { label: 'Members', value: e => current(e, 'member', false).length, sort: e => -current(e, 'member', false).length, kind: 'text' },
  '@classes': { label: 'Classes', value: e => classText(e, state.db?.meta, id => get(id)?.name), sort: e => classText(e, state.db?.meta).toLowerCase() || '~', kind: 'text' },
  '@level': { label: 'Level', value: e => (e.type === 'pc' ? totalLevel(e) : ''), sort: e => (e.type === 'pc' ? -totalLevel(e) : 0), kind: 'text' },
  '@cr': { label: 'CR', value: e => statsOf(e)?.cr, sort: e => { const cr = statsOf(e)?.cr; return cr ? crNum(cr) : 999 }, kind: 'text' },
  '@recipeCost': { label: 'Ingredients', value: e => recipeCost(e), sort: e => recipeCost(e) ?? -1, kind: 'money' },
  '@margin': {
    label: 'Profit', kind: 'money',
    value: e => { const c = recipeCost(e), v = e.fields.value; return c != null && v != null ? v - c : undefined },
    sort: e => { const c = recipeCost(e), v = e.fields.value; return c != null && v != null ? v - c : -1e9 },
  },
  '@craftTime': {
    label: 'Crafting time', kind: 'text',
    value: e => ((e.fields.recipe)?.length ? craftingTime(e.fields.value) : ''),
    sort: e => craftingMinutes(e.fields.value) ?? 1e9,
  },
  '@usedIn': { label: 'Used in', value: e => usedIn(e) || '', sort: e => -usedIn(e), kind: 'text' },
  '@spellLevel': {
    label: 'Level', kind: 'text',
    value: e => { const l = levelOf(e); return l < 0 ? '' : l ? ORD[l] : 'Cantrip' },
    sort: e => (levelOf(e) < 0 ? 99 : levelOf(e)),
  },
  '@attackSave': { label: 'Attack / save', value: attackOrSave, sort: e => attackOrSave(e).toLowerCase() || '~', kind: 'text' },
  '@concRitual': { label: 'C/R', value: concRitual, sort: e => concRitual(e) || '~', kind: 'text' },
  '@sessionNo': { label: 'Number', value: e => (Number.isFinite(sessionNo(e)) ? sessionNo(e) : ''), sort: e => sessionNo(e), kind: 'text' },
  // a feat's prerequisite as written, else what the app checks
  '@prereq': { label: 'Prerequisite', value: e => prereqText(e), sort: e => prereqText(e).toLowerCase() || '~', kind: 'text' },
  // a race's walking speed and its others (swim, fly…)
  '@speed': { label: 'Speed', value: e => speedText(e), sort: e => e.fields.speeds?.walk ?? 1e9, kind: 'text' },
  // a character at a glance (sheet.ts partyLine): what the DM looks up at the table
  '@ac': { label: 'AC', value: e => (e.type === 'pc' ? partyLine(e).ac : ''), sort: e => (e.type === 'pc' ? -partyLine(e).ac : 0), kind: 'text' },
  '@maxHp': { label: 'Max HP', value: e => (e.type === 'pc' ? partyLine(e).maxHp ?? '' : ''), sort: e => (e.type === 'pc' ? -(partyLine(e).maxHp ?? 0) : 0), kind: 'text' },
  '@passives': {
    label: 'Passive Perc. / Ins. / Inv.', kind: 'text',
    value: e => { if (e.type !== 'pc') return ''; const p = partyLine(e); return `${p.perception} / ${p.insight} / ${p.investigation}` },
    sort: e => (e.type === 'pc' ? -partyLine(e).perception : 0),
  },
  '@spellDc': { label: 'Spell DC', value: e => (e.type === 'pc' ? partyLine(e).spellDc ?? '' : ''), sort: e => (e.type === 'pc' ? -(partyLine(e).spellDc ?? 0) : 0), kind: 'text' },
  '@languages': { label: 'Languages', value: e => (e.type === 'pc' ? partyLine(e).languages.join(', ') : ''), sort: e => (e.type === 'pc' ? partyLine(e).languages.length : 0), kind: 'text' },
  // an NPC's status with its date ("Dead since 86 AC"); the living show nothing
  '@status': { label: 'Status', value: e => statusText(e), sort: e => statusText(e).toLowerCase() || '~', kind: 'text' },
  '@updated': { label: 'Last edited', value: e => new Date(e.updated).toLocaleString(), sort: e => -Date.parse(e.updated), kind: 'text' },
}

export function column(key: string, type?: EntryType): Col {
  // numbers in names in numeric order: "Session 2" before "Session 10"
  if (key === 'name') return { key, label: 'Name', value: e => e.name, sort: e => e.name.toLowerCase().replace(/\d+/g, d => d.padStart(10, '0')) }
  const c = COMPUTED[key]
  if (c) return { key, ...c }
  const field = (type && TYPES[type].fields.find(f => f.key === key)) || FIELD_BY_KEY.get(key)
  if (!field) return { key, label: key, value: e => byKey(e.fields)[key], sort: e => String(byKey(e.fields)[key] ?? '~'), kind: 'text' }
  return {
    key, label: field.label, field,
    value: e => byKey(e.fields)[key],
    sort: e => {
      const v = byKey(e.fields)[key]
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) return field.kind === 'money' || field.kind === 'number' ? -1e12 : '~'
      if (field.kind === 'ref') return nameOf(v as string)
      if (field.kind === 'date') return dateKey(v as WorldDate)
      if (field.kind === 'bool') return v ? 0 : 1
      if (field.kind === 'abilityBonus') return abilityBonusText(v as AbilityBonus).toLowerCase()
      if (key === 'level') return v === 'Cantrip' ? 0 : Number(v)
      if (typeof v === 'number') return v
      // Choices sort by their label (see model/lists.ts).
      if (listKeyOf(field)) return fieldLabel(field, v).toLowerCase()
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
  // by the status alone (Dead, Missing…), the living as Alive
  if (key === '@status') {
    const st = (e: Entry) => { const s = String(e.fields.status ?? '').trim(); return s ? s[0].toUpperCase() + s.slice(1) : 'Alive' }
    return { key, label: 'Status', values: rows => [...new Set(rows.map(st))].sort((a, b) => (a === 'Alive' ? -1 : b === 'Alive' ? 1 : a.localeCompare(b))), match: (e, v) => st(e) === v }
  }
  if (key === '@attackSave') return { key, label: 'Attack / save', values: rows => [...new Set(rows.map(attackOrSave).filter(Boolean))].sort(), match: (e, v) => attackOrSave(e) === v }
  // feats a character of a level can take: those needing that level or less (or none)
  if (key === '@takeable') return { key, label: 'Takeable at level', values: () => Array.from({ length: 20 }, (_, i) => String(i + 1)), match: (e, v) => !e.fields.level || Number(e.fields.level) <= Number(v) }
  if (key === '@type') return { key, label: 'Type', values: rows => [...new Set(rows.map(e => TYPES[e.type].label))].sort(), match: (e, v) => TYPES[e.type].label === v }
  const field = (type && TYPES[type].fields.find(f => f.key === key)) || FIELD_BY_KEY.get(key)
  const label = field?.label ?? key
  const vals = (e: Entry): string[] => {
    const v = byKey(e.fields)[key]
    // a box never ticked counts as No
    if (field?.kind === 'bool') return [v ? 'Yes' : 'No']
    if (v == null || v === '') return []
    if (field?.kind === 'ref') return [nameOf(v as string)]
    // Choices filter by their label (see model/lists.ts).
    if (listKeyOf(field)) return (Array.isArray(v) ? v : [v]).map(x => fieldLabel(field, x))
    if (Array.isArray(v)) return v.map(String)
    return [String(v)]
  }
  const order = listKeyOf(field) ? fieldOptions(field).map(o => o.label) : undefined
  return {
    key, label,
    values: rows => {
      const set = [...new Set(rows.flatMap(vals))]
      return order ? set.sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999) || a.localeCompare(b)) : set.sort()
    },
    match: (e, v) => vals(e).includes(v),
  }
}
