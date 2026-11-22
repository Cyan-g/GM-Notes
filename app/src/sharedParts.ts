// The parts of a player's character that both the DM and the player change: its vitals (HP, temporary HP, death
// saves, conditions, exhaustion, concentration), its inventory and money, and its relations. Everything else on it
// is the player's (the DM's copy is read-only). Each part carries a stamp, the time and the world of its latest change,
// kept in the sheet (sheet.sync); each relation has its own. Either side marks what changed on its side (a fingerprint
// tells), sends its parts over the live session, and takes the other side's where they're newer (equal times: the
// higher world ID, so both sides decide alike).
//
// The two worlds name things differently: the player's own entries have other IDs at the DM's (PlayerShare.entries),
// what the DM shared has the same ID in both. What travels is in the player's IDs; the DM's side translates. A relation
// to something the player can't see (a DM-only NPC) never travels: it stays with the DM.
import type { CharacterSheet, Entry, Id, Relation, RelationKind } from './model/types'
import { stable } from './transfer'

export interface Stamp { at: string; by: string; hash: string }
export interface RelStamp extends Stamp { gone?: boolean }
export interface SheetSync { vitals?: Stamp; inventory?: Stamp; relations?: Record<string, RelStamp> }
export type PartName = 'vitals' | 'inventory'
/** A relation as it travels: its ends in the player's IDs. */
export interface RelValue { a: Id; b: Id; kind: RelationKind; role?: string; note?: string; from?: Relation['from']; to?: Relation['to'] }
/** What a side sends of one character. */
export interface SharedPayload {
  parts: Partial<Record<PartName, { stamp: Stamp; value: Record<string, unknown> }>>
  relations: Record<string, { stamp: RelStamp; value?: RelValue }>
}

const KEYS: Record<PartName, readonly (keyof CharacterSheet)[]> = {
  vitals: ['hp', 'tempHp', 'deathSaves', 'conditions', 'exhaustion', 'concentrating'],
  inventory: ['inventory', 'money'],
}
export const PARTS = Object.keys(KEYS) as PartName[]

/** The two worlds' IDs: to the player's (what travels) and back; undefined: not something the other side has. */
export interface IdMap { out: (id: Id) => Id | undefined; in: (id: Id) => Id | undefined }
export const SAME: IdMap = { out: id => id, in: id => id }

/** A part's value as it travels (IDs translated; a line whose item the other side lacks keeps its name only). */
function partOut(s: CharacterSheet, part: PartName, m: IdMap): Record<string, unknown> {
  const v: Record<string, unknown> = {}
  for (const k of KEYS[part]) if (s[k] != null) v[k] = JSON.parse(JSON.stringify(s[k]))
  if (part === 'vitals' && typeof v.concentrating === 'string') { const id = m.out(v.concentrating); if (id) v.concentrating = id; else delete v.concentrating }
  if (part === 'inventory' && Array.isArray(v.inventory)) v.inventory = (v.inventory as { item?: Id }[]).map(l => (l.item ? { ...l, item: m.out(l.item) ?? l.item } : l))
  return v
}
/** Put a part that arrived into a sheet (IDs translated back). */
function partIn(s: CharacterSheet, part: PartName, v: Record<string, unknown>, m: IdMap) {
  const x = s as unknown as Record<string, unknown>
  for (const k of KEYS[part]) delete x[k]
  for (const [k, val] of Object.entries(v)) if ((KEYS[part] as readonly string[]).includes(k)) x[k] = JSON.parse(JSON.stringify(val))
  if (part === 'vitals' && typeof x.concentrating === 'string') { const id = m.in(x.concentrating); if (id) x.concentrating = id; else delete x.concentrating }
  if (part === 'inventory' && Array.isArray(x.inventory)) x.inventory = (x.inventory as { item?: Id }[]).map(l => (l.item ? { ...l, item: m.in(l.item) ?? l.item } : l))
}

/** Put one sheet's shared parts (HP and conditions, inventory and money) into another, as they are. */
export function copyParts(from: CharacterSheet, to: CharacterSheet) {
  const f = from as unknown as Record<string, unknown>, t = to as unknown as Record<string, unknown>
  for (const p of PARTS) for (const k of KEYS[p]) { if (f[k] == null) delete t[k]; else t[k] = JSON.parse(JSON.stringify(f[k])) }
}

/** A short fingerprint of a value, to tell whether it changed. */
function hash(v: unknown): string {
  const s = stable(v)
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(36) + s.length.toString(36)
}
/** Whether stamp `a` is newer than `b`. */
export const newer = (a: Stamp, b: Stamp | undefined) => !b || a.at > b.at || (a.at === b.at && a.by > b.by)

const relKey = (r: { a: Id; b: Id; kind: string }) => `${r.a}|${r.b}|${r.kind}`
function relOut(r: Relation, m: IdMap): RelValue | undefined {
  const a = m.out(r.a), b = m.out(r.b)
  if (!a || !b) return undefined
  const v: RelValue = { a, b, kind: r.kind }
  for (const k of ['role', 'note', 'from', 'to'] as const) if (r[k] != null && r[k] !== '') (v as unknown as Record<string, unknown>)[k] = r[k]
  return v
}

/** The world a character's shared relations are in. */
export interface RelationScope {
  relations: Relation[]
  /** The player's entries here (the character and their own things): a shared relation touches one of them. */
  own: Set<Id>
  /** Whether the other side may see this entry (the player's, or what the DM shared). */
  visible: (id: Id) => boolean
}
/** The character's relations the other side may see, by key (in the player's IDs). */
function relationsOut(sc: RelationScope, m: IdMap): Map<string, { r: Relation; v: RelValue }> {
  const out = new Map<string, { r: Relation; v: RelValue }>()
  for (const r of sc.relations) {
    if (!(sc.own.has(r.a) || sc.own.has(r.b)) || !sc.visible(r.a) || !sc.visible(r.b)) continue
    const v = relOut(r, m)
    if (v) out.set(relKey(v), { r, v })
  }
  return out
}

/**
 * Mark what changed on this side since the last mark: a part or relation whose fingerprint differs gets a new stamp
 * (`by`: this world); a relation that's gone (not one hidden from the other side) gets a "gone" stamp. Returns whether
 * any stamp changed.
 */
export function stampChanges(s: CharacterSheet, sc: RelationScope, m: IdMap, by: string, now = new Date().toISOString()): boolean {
  const sync: SheetSync = s.sync ?? {}
  let changed = false
  for (const p of PARTS) {
    const h = hash(partOut(s, p, m))
    if (sync[p]?.hash !== h) { sync[p] = { at: now, by, hash: h }; changed = true }
  }
  const rel = { ...(sync.relations ?? {}) }
  const cur = relationsOut(sc, m)
  for (const [k, { v }] of cur) {
    const h = hash(v), st = rel[k]
    if (!st || st.gone || st.hash !== h) { rel[k] = { at: now, by, hash: h }; changed = true }
  }
  for (const [k, st] of Object.entries(rel)) {
    if (st.gone || cur.has(k)) continue
    // still here but hidden from the other side now (an NPC made DM-only): not gone, just not sent
    const [a, b, kind] = k.split('|'), ha = m.in(a), hb = m.in(b)
    if (ha && hb && sc.relations.some(r => r.a === ha && r.b === hb && r.kind === kind)) continue
    rel[k] = { at: now, by, hash: '', gone: true }; changed = true
  }
  if (changed) s.sync = { ...sync, relations: rel }
  return changed
}

/** What this side sends of a character (after stampChanges). */
export function payloadOf(s: CharacterSheet, sc: RelationScope, m: IdMap): SharedPayload {
  const sync = s.sync ?? {}
  const parts: SharedPayload['parts'] = {}
  for (const p of PARTS) { const st = sync[p]; if (st) parts[p] = { stamp: st, value: partOut(s, p, m) } }
  const cur = relationsOut(sc, m)
  const relations: SharedPayload['relations'] = {}
  for (const [k, st] of Object.entries(sync.relations ?? {})) {
    if (st.gone) relations[k] = { stamp: st }
    else { const c = cur.get(k); if (c) relations[k] = { stamp: st, value: c.v } }
  }
  return { parts, relations }
}

/** What a merge does to the world's relations (the caller applies them: adding one is the world's business). */
export interface RelationChanges { add: Omit<Relation, 'id' | 'visibility'>[]; update: { id: string; value: Partial<Relation> }[]; remove: string[] }

/**
 * Take what's newer from the other side: its parts into the sheet, its relations as changes to make. Returns the
 * relation changes and whether the sheet changed. Run stampChanges on this side first, so its own edits count.
 */
export function mergePayload(s: CharacterSheet, p: SharedPayload, relations: Relation[], m: IdMap): { sheet: boolean; rel: RelationChanges } {
  const sync: SheetSync = { ...(s.sync ?? {}) }
  let sheet = false
  for (const part of PARTS) {
    const theirs = p.parts?.[part]
    if (!theirs || !newer(theirs.stamp, sync[part])) continue
    partIn(s, part, theirs.value ?? {}, m)
    sync[part] = { ...theirs.stamp, hash: hash(partOut(s, part, m)) }
    sheet = true
  }
  const rel: RelationChanges = { add: [], update: [], remove: [] }
  const stamps = { ...(sync.relations ?? {}) }
  for (const [k, theirs] of Object.entries(p.relations ?? {})) {
    if (!newer(theirs.stamp, stamps[k])) continue
    const [a0, b0, kind] = k.split('|'), a = m.in(a0), b = m.in(b0)
    // an end this side doesn't have: nothing to do with it
    if (!a || !b) continue
    const here = relations.find(r => r.a === a && r.b === b && r.kind === kind)
    if (theirs.stamp.gone) { if (here) rel.remove.push(here.id) }
    else if (theirs.value) {
      const fields: Partial<Relation> = { role: theirs.value.role, note: theirs.value.note, from: theirs.value.from, to: theirs.value.to }
      if (here) rel.update.push({ id: here.id, value: fields })
      else rel.add.push({ a, b, kind: kind as RelationKind, ...fields })
    }
    stamps[k] = { ...theirs.stamp }
    sheet = true
  }
  if (sheet) s.sync = { ...sync, relations: stamps }
  return { sheet, rel }
}

/** An entry's ID in an IdMap built from a PlayerShare's entries (their ID → the one here). */
export function dmMap(entries: Record<Id, Id>, has: (id: Id) => Entry | undefined): IdMap {
  const back = new Map(Object.entries(entries).map(([their, here]) => [here, their]))
  const theirs = new Set(Object.values(entries))
  return {
    // the player's own things by their ID; what the DM shared keeps its ID; anything else of the DM's too (the
    // relation scope keeps what the player can't see from travelling)
    out: id => back.get(id) ?? (theirs.has(id) ? undefined : has(id) ? id : undefined),
    in: id => entries[id] ?? (has(id) ? id : undefined),
  }
}
