// Merging what another of the user's devices changed into this copy of the world. Every entry, relation and world
// setting carries the time and device of its latest change (the change log in electron/db.cjs); for each thing
// both have, the newer change wins (equal times: the higher device ID, so both devices decide alike). What a newer
// change replaces here goes into the entry's History; a thing changed on both devices since they last talked is a
// conflict, counted for a notice. Pictures and files are only listed here: fetching them is the network's job.
//
// No app code is imported (only types), so this file runs on its own in tests.
import type { Database, Entry, Id, Relation } from '../model/types'

/** One change from another device: the thing as it is there now (for a put). */
export interface SyncItem { kind: 'entry' | 'relation' | 'setting' | 'file'; key: string; op: 'put' | 'delete'; at: string; device: string; value?: unknown }
/** What a device sends: its changes after a point in its log, and where to ask from next. */
export interface SyncBatch { log: string; device: string; upTo: number; more: boolean; items: SyncItem[] }
/** When and where a thing last changed. */
export interface Line { at: string; device: string }
export interface Conflict { kind: SyncItem['kind']; key: string; name: string; kept: 'here' | 'theirs' }
export interface MergePlan {
  putEntries: Entry[]
  delEntries: Id[]
  putRelations: Relation[]
  delRelations: string[]
  /** World settings: a part of meta set (or removed: undefined), a play setting set (or removed: null). */
  meta: Record<string, unknown>
  play: Record<string, unknown>
  /** For the change log: which device made each change taken, and when. */
  origin: Record<string, Line>
  /** Entries whose version here is replaced: kept in History whatever its age. */
  keep: Id[]
  conflicts: Conflict[]
  /** Pictures and files to fetch from the other device, and to remove here. */
  files: { need: string[]; gone: string[] }
  /** Relations not taken because one of their entries isn't here (deleted here later). */
  skipped: number
}

/** Settings that belong to one copy, never taken from another device (the sender doesn't send them either). */
const LOCAL_META = new Set(['theme', 'cardStyle', 'mode', 'sharing', 'edited', 'externalBackup', 'lastPublished', 'currentCharacter'])
const PLAY = new Set(['tracker', 'spellbook', 'crafting', 'playerNotes'])

/** Whether change `a` is newer than `b`. */
export const newer = (a: Line, b: Line) => a.at > b.at || (a.at === b.at && a.device > b.device)
const keyOf = (x: { kind: string; key: string }) => `${x.kind}:${x.key}`
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * What taking `batch` into `d` means. `local`: this copy's latest change to each thing in the batch (by "kind:key");
 * `since`: when the two devices last talked (changes on both sides after it are conflicts).
 */
export function planMerge(d: Database, batch: SyncBatch, local: Record<string, Line>, since = ''): MergePlan {
  const plan: MergePlan = { putEntries: [], delEntries: [], putRelations: [], delRelations: [], meta: {}, play: {}, origin: {}, keep: [], conflicts: [], files: { need: [], gone: [] }, skipped: 0 }
  const nameOf = (x: SyncItem) => (x.kind === 'entry' ? ((x.value as Entry | undefined)?.name ?? d.entries[x.key]?.name ?? x.key)
    : x.kind === 'relation' ? 'a relation' : x.kind === 'setting' ? x.key.replace(/^meta\./, '') : x.key)
  // which items to take: newer than this copy's own change, and not this copy's own change coming back
  const take: SyncItem[] = []
  for (const x of batch.items) {
    if (x.kind === 'setting' && (x.key.startsWith('meta.') ? LOCAL_META.has(x.key.slice(5)) : !PLAY.has(x.key))) continue
    const mine = local[keyOf(x)]
    if (mine && mine.at === x.at && mine.device === x.device) continue
    const clash = !!mine && mine.at > since && x.at > since && mine.device !== x.device
    if (mine && !newer(x, mine)) { if (clash) plan.conflicts.push({ kind: x.kind, key: x.key, name: nameOf(x), kept: 'here' }); continue }
    if (clash) plan.conflicts.push({ kind: x.kind, key: x.key, name: nameOf(x), kept: 'theirs' })
    take.push(x)
  }
  // entries first, so relations can tell whether both their entries will be here
  const present = new Set(Object.keys(d.entries))
  for (const x of take.filter(t => t.kind === 'entry')) {
    const here = d.entries[x.key]
    if (x.op === 'delete') {
      if (here) { plan.delEntries.push(x.key); present.delete(x.key) }
    } else {
      const e = x.value as Entry
      if (!e || e.id !== x.key) continue
      present.add(x.key)
      if (same(here, e)) continue
      if (here) plan.keep.push(x.key)
      plan.putEntries.push(e)
    }
    plan.origin[keyOf(x)] = { at: x.at, device: x.device }
  }
  const rels = new Map(d.relations.map(r => [r.id, r]))
  for (const x of take.filter(t => t.kind === 'relation')) {
    if (x.op === 'delete') {
      if (rels.has(x.key)) plan.delRelations.push(x.key)
    } else {
      const r = x.value as Relation
      if (!r || r.id !== x.key) continue
      if (!present.has(r.a) || !present.has(r.b)) { plan.skipped++; continue }
      if (same(rels.get(x.key), r)) continue
      plan.putRelations.push(r)
    }
    plan.origin[keyOf(x)] = { at: x.at, device: x.device }
  }
  for (const x of take.filter(t => t.kind === 'setting')) {
    const v = x.op === 'delete' ? null : x.value ?? null
    if (x.key.startsWith('meta.')) {
      const k = x.key.slice(5)
      if (same((d.meta as Record<string, unknown>)[k], v)) continue
      plan.meta[k] = v ?? undefined
    } else {
      if (same((d as unknown as Record<string, unknown>)[x.key], v)) continue
      plan.play[x.key] = v
    }
    plan.origin[keyOf(x)] = { at: x.at, device: x.device }
  }
  for (const x of take.filter(t => t.kind === 'file')) {
    ;(x.op === 'delete' ? plan.files.gone : plan.files.need).push(x.key)
    plan.origin[keyOf(x)] = { at: x.at, device: x.device }
  }
  return plan
}

/** Make the plan's changes in `d` (relations of deleted entries go too). Returns how many things changed. */
export function applyPlan(d: Database, plan: MergePlan): number {
  for (const id of plan.delEntries) delete d.entries[id]
  for (const e of plan.putEntries) d.entries[e.id] = e
  const gone = new Set(plan.delRelations)
  const put = new Map(plan.putRelations.map(r => [r.id, r]))
  const kept: Relation[] = []
  for (const r of d.relations) {
    if (gone.has(r.id) || !d.entries[r.a] || !d.entries[r.b]) continue
    kept.push(put.get(r.id) ?? r)
    put.delete(r.id)
  }
  d.relations = [...kept, ...put.values()]
  const meta = d.meta as Record<string, unknown>
  for (const [k, v] of Object.entries(plan.meta)) { if (v === undefined) delete meta[k]; else meta[k] = v }
  const play = d as unknown as Record<string, unknown>
  for (const [k, v] of Object.entries(plan.play)) { if (v == null) delete play[k]; else play[k] = v }
  return plan.putEntries.length + plan.delEntries.length + plan.putRelations.length + plan.delRelations.length
    + Object.keys(plan.meta).length + Object.keys(plan.play).length
}
