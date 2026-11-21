// Changing the database: every change goes through here so it gets timestamped and saved.
import type { Entry, EntryType, Id, Relation, RelationKind } from './model/types'
import { db, get, playerMode, state, touch } from './store'
import { slug } from './model/text'
import { byKey } from './model/schema'

export function newId(name: string): Id {
  const base = slug(name)
  let id = base, i = 2
  while (db().entries[id]) id = `${base}-${i++}`
  return id
}

/** Mark an entry as changed (call after editing its fields, name or body). */
export function changed(e: Entry) {
  e.updated = new Date().toISOString()
  touch()
}

/** A value that counts as not filled in: undefined, null, '', an empty list, false or NaN. Fields never store one. */
export const isEmpty = (v: unknown) => v == null || v === '' || v === false || (typeof v === 'number' && Number.isNaN(v)) || (Array.isArray(v) && !v.length)
/** Set a field of an entry, or remove it when the value is empty (isEmpty), and mark the entry as changed. */
export function setField(e: Entry, key: string, v: unknown) {
  const f = byKey(e.fields)
  if (isEmpty(v)) delete f[key]
  else f[key] = v
  changed(e)
}
/** Turn a yes/no field on or off (off is no field at all). */
export const toggleField = (e: Entry, key: string) => setField(e, key, !byKey(e.fields)[key])

export function createEntry(type: EntryType, name: string, fields: Record<string, unknown> = {}): Entry {
  const now = new Date().toISOString()
  // The DM's new entries start DM only, until marked Known to players. A player's own entries never go anywhere,
  // and characters are never shared, so for those "DM only" means nothing: they start known.
  const known = playerMode.value || type === 'pc'
  const e: Entry = {
    id: newId(name), type, name: name.trim(), aliases: [], tags: [], fields, body: '',
    visibility: known ? 'known' : 'secret', created: now, updated: now,
  }
  db().entries[e.id] = e
  touch()
  return db().entries[e.id]
}

/** Remove an entry and every relation that involves it. Links to it in other texts stay and show as missing. */
export function deleteEntry(id: Id) {
  const d = db()
  delete d.entries[id]
  if (d.meta.favourites) d.meta.favourites = d.meta.favourites.filter(f => f !== id)
  d.relations = d.relations.filter(r => r.a !== id && r.b !== id)
  touch()
}

// ---- favourites ----
export const isFavourite = (id: Id) => !!state.db?.meta.favourites?.includes(id)
export function toggleFavourite(id: Id) {
  const m = db().meta
  const list = m.favourites ?? []
  m.favourites = list.includes(id) ? list.filter(f => f !== id) : [...list, id]
  touch()
}

let seq = 0
export function addRelation(a: Id, b: Id, kind: RelationKind): Relation {
  const d = db()
  let id: string
  do id = `r${Date.now().toString(36)}${(seq++).toString(36)}`
  while (d.relations.some(r => r.id === id))
  const r: Relation = { id, a, b, kind, visibility: 'secret' }
  d.relations.push(r)
  touch()
  return d.relations[d.relations.length - 1]
}

export function removeRelation(id: string) {
  const d = db()
  d.relations = d.relations.filter(r => r.id !== id)
  touch()
}

export function relationChanged(r: Relation) {
  for (const id of [r.a, r.b]) { const e = get(id); if (e) e.updated = new Date().toISOString() }
  touch()
}

/** Store a pasted or dropped picture in data/images and return its Markdown path. */
export async function saveImage(file: File | Blob, hint = 'image'): Promise<string> {
  const s = state.storage!
  const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg')
  const base = ('name' in file && file.name ? file.name.replace(/\.[^.]+$/, '') : hint).replace(/[^\w\- ]+/g, '').trim() || 'image'
  const existing = new Set(await s.list('images'))
  let name = `${base}.${ext}`, i = 2
  while (existing.has(name)) name = `${base} ${i++}.${ext}`
  await s.writeBlob(`images/${name}`, file)
  return `images/${name}`
}
