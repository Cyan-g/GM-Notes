// The data check: does the data match what the app expects (schema.ts)? It never changes anything, it only
// reports, so a broken entry, a wrong value or a link to a deleted entry is noticed instead of quietly misbehaving.
// Run on every load (the Data page lists what it found) and on every imported file.
import type { Database, Entry } from './model/types'
import { RELATION_KINDS, TYPES, type FieldDef } from './model/schema'
import { listKeyOf, optionsIn } from './model/lists'

export interface Problem {
  /** The entry it's about, if any. */
  entry?: string
  /** Where: "Ardenvale › Located in", "relation r12". */
  where: string
  message: string
  /** Serious problems break pages or saving; the rest is untidy data. */
  serious?: boolean
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isDate = (v: unknown) => isObj(v) && isNum(v.year) && (v.month == null || isNum(v.month)) && (v.day == null || isNum(v.day))

/** Lists of lines inside a field, and the key in each line that points at an entry. */
const LINES: Partial<Record<FieldDef['kind'], { key: string; needed: boolean }>> = {
  recipe: { key: 'item', needed: true }, stock: { key: 'item', needed: true },
  combatants: { key: 'creature', needed: false }, pins: { key: 'entry', needed: false },
}

/**
 * Check one field value against its definition. `exists` says whether an id is an entry (and of what type),
 * so links can be checked, and `meta` holds the world's dropdown lists; leave them out to check only the shape
 * (an import, whose links and options are worked out when it's added).
 */
export function checkField(f: FieldDef, v: unknown, exists?: (id: string) => Entry | undefined, meta?: Database['meta']): string | undefined {
  const key = listKeyOf(f)
  const choice = (x: string) => (!meta || !key || optionsIn(meta, key).some(o => o.id === x) ? undefined : `"${x}" isn't one of the choices (Archive → Lists)`)
  if (v == null) return undefined
  const link = (id: unknown, what = 'a link') => {
    if (!isStr(id)) return `${what} that isn't an entry id`
    if (!exists) return undefined
    const e = exists(id)
    if (!e) return `links to "${id}", which doesn't exist`
    if (f.to && !f.to.includes(e.type)) return `links to ${e.name}, a ${e.type}, but takes ${f.to.join(' or ')}`
    if (f.pick && !f.pick.is.includes(String((e.fields as Record<string, unknown>)[f.pick.field] ?? ''))) return `links to ${e.name}, which isn't a ${f.pick.is.join(' or ')}`
    return undefined
  }
  switch (f.kind) {
    case 'text': case 'longtext': return isStr(v) ? undefined : 'should be text'
    case 'number': case 'money': case 'weight': return isNum(v) ? undefined : `should be a number, is ${JSON.stringify(v)}`
    case 'bool': return typeof v === 'boolean' ? undefined : 'should be yes or no'
    case 'select': return !isStr(v) ? 'should be one of the choices' : choice(v)
    case 'list':
      if (!Array.isArray(v) || !v.every(isStr)) return 'should be a list of words'
      return v.map(choice).find(Boolean)
    case 'date': return isDate(v) ? undefined : 'should be a date'
    case 'ref': return link(v)
    case 'refs': return !Array.isArray(v) ? 'should be a list of links' : v.map(id => link(id)).find(Boolean)
    case 'recipe': case 'stock': case 'combatants': case 'pins': {
      if (!Array.isArray(v)) return 'should be a list'
      const { key, needed } = LINES[f.kind]!
      for (const line of v) {
        if (!isObj(line)) return 'has a line that is empty or broken'
        if (line[key] == null) { if (needed) return 'has a line without its item'; continue }
        const bad = link(line[key])
        if (bad) return bad
      }
      return undefined
    }
    case 'mapData': return isObj(v) || Array.isArray(v) ? undefined : 'should be map data'
    case 'requires': return isObj(v) ? undefined : 'should be a set of requirements'
    case 'itemSpells': return Array.isArray(v) && v.every(x => isObj(x) && isStr(x.spell) && isStr(x.how)) ? undefined : 'should be a list of spells'
    case 'effects': return Array.isArray(v) && v.every(x => isObj(x) && isStr(x.on)) ? undefined : 'should be a list of effects'
    case 'skills': return Array.isArray(v) && v.every(isStr) ? undefined : 'should be a list of skills'
    case 'equipment': return isObj(v) && (v.items == null || Array.isArray(v.items)) ? undefined : 'should be a set of equipment'
    case 'abilityBonus': return isObj(v) ? undefined : 'should be an ability score bonus'
    case 'regain': return isObj(v) ? undefined : 'should be how charges come back'
    case 'speeds': return isObj(v) ? undefined : 'should be a set of speeds'
    case 'classBasics': return isObj(v) ? undefined : 'should be a set of class basics'
    case 'speciesTraits': return Array.isArray(v) && v.every(x => isObj(x) && isStr(x.id) && isStr(x.name)) ? undefined : 'should be a list of traits'
    case 'classes':
      if (!Array.isArray(v) || !v.every(l => isObj(l) && isStr(l.class) && isNum(l.level))) return 'should be a list of classes with levels'
      return v.map(l => (l.subclass != null ? link(l.subclass) : undefined)).find(Boolean)
    case 'ranks': return Array.isArray(v) && v.every(r => isObj(r) && isStr(r.title)) ? undefined : 'should be a list of ranks with titles'
    case 'statblock': case 'abilities': return isObj(v) ? undefined : 'should be a statblock'
    case 'sheet': {
      if (!isObj(v)) return 'should be a character sheet'
      if (v.inventory != null && !Array.isArray(v.inventory)) return 'has a broken inventory'
      if (v.proficiencies != null && (!isObj(v.proficiencies) || ['armor', 'weapons', 'tools', 'languages'].some(k => (v.proficiencies as Record<string, unknown>)[k] != null && !Array.isArray((v.proficiencies as Record<string, unknown>)[k])))) return 'has broken proficiencies'
      for (const l of (v.inventory as unknown[] | undefined) ?? []) {
        if (!isObj(l) || !isNum(l.qty)) return 'has an inventory line without a quantity'
        if (l.item != null) { const bad = exists && isStr(l.item) && !exists(l.item) ? `carries "${l.item}", which doesn't exist` : !isStr(l.item) ? 'carries something that isn\'t an entry id' : undefined; if (bad) return bad }
      }
      return undefined
    }
  }
}

/** Check one entry: its own parts and every field. */
export function checkEntry(e: Entry, exists?: (id: string) => Entry | undefined, key?: string, meta?: Database['meta']): Problem[] {
  const out: Problem[] = []
  const where = (part: string) => `${e?.name || key || e?.id || '?'} › ${part}`
  if (!isObj(e)) return [{ entry: key, where: key ?? '?', message: 'is not an entry', serious: true }]
  const def = TYPES[e.type]
  if (!def) return [{ entry: e.id, where: e.name ?? e.id, message: `has an unknown type "${e.type}"`, serious: true }]
  if (key != null && e.id !== key) out.push({ entry: key, where: where('id'), message: `is stored as "${key}" but says its id is "${e.id}"`, serious: true })
  if (!isStr(e.name) || !e.name.trim()) out.push({ entry: e.id, where: where('name'), message: 'has no name', serious: true })
  if (!Array.isArray(e.aliases) || !Array.isArray(e.tags)) out.push({ entry: e.id, where: where('aliases and tags'), message: 'should be lists', serious: true })
  if (!isStr(e.body)) out.push({ entry: e.id, where: where('text'), message: 'should be text', serious: true })
  if (!isObj(e.fields)) return [...out, { entry: e.id, where: where('fields'), message: 'are missing', serious: true }]
  if (e.visibility !== 'secret' && e.visibility !== 'known') out.push({ entry: e.id, where: where('visibility'), message: `"${e.visibility}" should be secret or known` })
  for (const [k, v] of Object.entries(e.fields)) {
    const f = def.fields.find(x => x.key === k)
    if (!f) { out.push({ entry: e.id, where: where(k), message: `isn't a field of ${def.plural.toLowerCase()} (left over?)` }); continue }
    const bad = checkField(f, v, exists, meta)
    if (bad) out.push({ entry: e.id, where: where(f.label), message: bad, serious: f.kind === 'sheet' || (!!LINES[f.kind] && !bad.startsWith('links')) })
  }
  return out
}

/** Check the whole database. */
export function checkDatabase(d: Database): Problem[] {
  const out: Problem[] = []
  if (!isObj(d) || !isObj(d.meta) || !isObj(d.entries) || !Array.isArray(d.relations)) return [{ where: 'the data', message: 'is missing its main parts', serious: true }]
  const exists = (id: string) => d.entries[id]
  for (const [key, e] of Object.entries(d.entries)) out.push(...checkEntry(e, exists, key, d.meta))
  const ids = new Set<string>()
  for (const r of d.relations) {
    const where = `relation ${get(d, r.a)} → ${get(d, r.b)}`
    if (!isObj(r) || !isStr(r.id)) { out.push({ where: 'a relation', message: 'is broken', serious: true }); continue }
    if (ids.has(r.id)) out.push({ where, message: `shares its id "${r.id}" with another relation`, serious: true })
    ids.add(r.id)
    if (!RELATION_KINDS[r.kind]) out.push({ where, message: `has an unknown kind "${r.kind}"` })
    for (const end of [r.a, r.b]) if (!d.entries[end]) out.push({ where, message: `points at "${end}", which doesn't exist` })
    if (r.a === r.b) out.push({ where, message: 'connects an entry to itself' })
    for (const dt of [r.from, r.to]) if (dt != null && !isDate(dt)) out.push({ where, message: 'has a broken date' })
  }
  for (const id of d.meta.favourites ?? []) if (!d.entries[id]) out.push({ where: 'favourites', message: `include "${id}", which doesn't exist` })
  if (d.meta.currentCharacter && d.entries[d.meta.currentCharacter]?.type !== 'pc') out.push({ where: 'current character', message: `"${d.meta.currentCharacter}" isn't a player character` })
  return out
}
const get = (d: Database, id: string) => d.entries[id]?.name ?? id
