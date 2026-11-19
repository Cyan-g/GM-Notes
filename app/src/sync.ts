// Sharing the world with players through a shared folder (e.g. a Google Drive folder shared as "viewer"), one way:
// - The DM publishes: <shared folder>/<world id>/world.json (what players may know) plus files/<hash><ext> for the
//   pictures and files, named by their content so the sync service only moves what changed.
// - A player's world follows one published world: it checks on start and every few minutes, and an update replaces
//   the shared entries (read-only on the player's side), removes what's no longer shared, updates the lists, the
//   calendar and today's date, and leaves everything of the player's own alone (characters, notes, sessions…).
import { reactive } from 'vue'
import type { Entry, Follow, Id, Relation } from './model/types'
import { LISTS, type ListOption } from './model/lists'
import { mapRefs } from './model/refs'
import { DATA_VERSION, backupNow, db, listOptions, save, state, touch } from './store'
import { desktop } from './storage/desktop'
import { dataPaths, outgoingEntries, planExport, stable } from './transfer'

export const PUBLISH_FORMAT = 'dndesk-publish'
/** Entry types players can keep their own notes on (people and places). */
export const NOTE_TYPES = ['npc', 'organization', 'place', 'deity', 'event']

export interface Published {
  format: typeof PUBLISH_FORMAT
  version: 1
  worldId: string
  title: string
  dataVersion: number
  published: string
  entries: Entry[]
  relations: Relation[]
  /** Every dropdown list. */
  options: Record<string, ListOption[]>
  /** Names of entries referenced but not shared. */
  names: Record<Id, string>
  world: { calendar: unknown; eventCategories: unknown; today: unknown }
  /** Data path → file name in files/. */
  files: Record<string, string>
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const decode = (b: Uint8Array | null) => (b ? new TextDecoder().decode(b) : null)
const extOf = (p: string) => { const m = p.match(/\.[a-z0-9]{1,6}$/i); return m ? m[0].toLowerCase() : '' }
async function hashOf(blob: Blob) {
  const buf = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}
const content = (e: Entry) => stable({ ...e, updated: undefined, created: undefined })

// ---------- the DM's side ----------

export interface PublishPlan {
  pub: Published
  blobs: Map<string, Blob>
  added: Entry[]
  changed: Entry[]
  removed: { id: Id; name: string }[]
  /** The last publish, if any. */
  previous?: string
}

/** What a publish would send now: shared entries (no characters), compared with the last publish. */
export async function planPublish(): Promise<PublishPlan> {
  if (!state.worldId) throw new Error('This world has no ID yet; reopen it in the desktop app.')
  const plan = planExport(null, { dmText: false, hidden: false, textLinks: false, skip: ['pc'] })!
  const { entries, names } = outgoingEntries(plan)
  const ids = new Set(entries.map(e => e.id))
  const files: Record<string, string> = {}
  const blobs = new Map<string, Blob>()
  for (const p of new Set(entries.flatMap(dataPaths))) {
    const b = await state.storage!.readBlob(p)
    if (!b) continue
    const name = (await hashOf(b)) + extOf(p)
    files[p] = name
    blobs.set(name, b)
  }
  const m = db().meta
  const pub: Published = {
    format: PUBLISH_FORMAT, version: 1, worldId: state.worldId, title: m.title, dataVersion: db().version ?? DATA_VERSION,
    published: new Date().toISOString(),
    entries, relations: plan.relations.filter(r => ids.has(r.a) && ids.has(r.b)).map(clone),
    options: Object.fromEntries(LISTS.map(l => [l.key, listOptions(l.key)])),
    names, world: clone({ calendar: m.calendar, eventCategories: m.eventCategories, today: m.today }), files,
  }
  let last: Published | null = null
  try { last = JSON.parse(decode(await desktop!.read('publish', 'world.json')) ?? 'null') } catch { last = null }
  const before = new Map((last?.entries ?? []).map(e => [e.id, e]))
  return {
    pub, blobs,
    added: entries.filter(e => !before.has(e.id)),
    changed: entries.filter(e => before.has(e.id) && content(before.get(e.id)!) !== content(e)),
    removed: [...before.values()].filter(e => !ids.has(e.id)).map(e => ({ id: e.id, name: e.name })),
    previous: last?.published,
  }
}

/** Write a publish into the shared folder: new files first, then world.json (swapped in whole), then old files out. */
export async function publish(p: PublishPlan, progress?: (done: number, total: number) => void) {
  const have = new Set(await desktop!.list('publish', 'files'))
  const missing = [...p.blobs].filter(([name]) => !have.has(name))
  let done = 0
  for (const [name, b] of missing) {
    await desktop!.write('publish', `files/${name}`, new Uint8Array(await b.arrayBuffer()))
    progress?.(++done, missing.length)
  }
  await desktop!.write('publish', 'world.json', new TextEncoder().encode(JSON.stringify(p.pub)))
  for (const name of have) if (!p.blobs.has(name)) await desktop!.remove('publish', `files/${name}`)
  db().meta.lastPublished = p.pub.published
  touch()
  await save()
}

// ---------- a player's side ----------

/** The entries shared by the followed world (read-only here). */
export function isShared(e: Entry | undefined): boolean {
  return !!e && !!state.db?.follow?.ids.includes(e.id)
}

export interface SyncResult { added: number; changed: number; removed: number; title: string }

/**
 * Bring this world up to date with the world it follows. Returns what changed, or null when there's nothing new.
 * A backup is made before anything changes.
 */
export async function syncNow(): Promise<SyncResult | null> {
  if (!desktop || !state.db || state.readOnly) return null
  const raw = decode(await desktop.read('shared', 'world.json'))
  if (!raw) throw new Error("The shared world isn't in the shared folder (yet). Is the folder synced to this computer?")
  const pub = JSON.parse(raw) as Published
  const d = db()
  if (pub.format !== PUBLISH_FORMAT) throw new Error("The shared folder's world.json isn't a DnDesk world.")
  if (d.follow && pub.worldId !== d.follow.worldId) throw new Error(`The shared folder holds “${pub.title}”, not the world this one follows.`)
  if (pub.dataVersion > DATA_VERSION) throw new Error(`“${pub.title}” was published by a newer DnDesk (data version ${pub.dataVersion}). Update DnDesk to get it.`)
  if (d.follow?.published === pub.published) return null

  await backupNow()
  const old = d.follow ?? { worldId: pub.worldId, title: pub.title, ids: [], relations: [], files: {} } as Follow
  const oldIds = new Set(old.ids)
  const newIds = new Set(pub.entries.map(e => e.id))
  const name = (id: Id) => d.entries[id]?.name ?? pub.names[id] ?? id

  // An entry here with the id of a newly shared one: the same thing (same type and name, e.g. a spell of the
  // starting world) simply becomes the shared one; something else of the player's own moves aside (references follow).
  for (const e of pub.entries) {
    const here = d.entries[e.id]
    if (here && !oldIds.has(e.id) && (here.type !== e.type || here.name.trim().toLowerCase() !== e.name.trim().toLowerCase())) {
      const mine = d.entries[e.id]
      let to = `${e.id}-own`
      for (let i = 2; d.entries[to] || newIds.has(to); i++) to = `${e.id}-own-${i}`
      delete d.entries[e.id]
      mine.id = to
      d.entries[to] = mine
      for (const x of Object.values(d.entries)) if (!oldIds.has(x.id)) mapRefs(x, id => (id === e.id ? to : id), name)
      for (const r of d.relations) { if (r.a === e.id) r.a = to; if (r.b === e.id) r.b = to }
    }
  }

  // No longer shared: removed; the player's own entries keep the name where they pointed at it.
  const gone = new Set([...oldIds].filter(id => !newIds.has(id) && d.entries[id]))
  if (gone.size) {
    for (const x of Object.values(d.entries)) if (!oldIds.has(x.id)) mapRefs(x, id => (gone.has(id) ? null : id), name)
    for (const id of gone) delete d.entries[id]
  }

  // The shared entries, as published.
  let added = 0, changed = 0
  for (const e of pub.entries) {
    const before = d.entries[e.id]
    if (!before) added++
    else if (content(before) !== content(e)) changed++
    d.entries[e.id] = clone(e)
  }

  // Connections: the shared ones are replaced; the player's own stay unless they lead to something removed.
  const oldRel = new Set(old.relations)
  const pubRel = new Set(pub.relations.map(r => r.id))
  d.relations = [
    ...d.relations.filter(r => !oldRel.has(r.id) && !pubRel.has(r.id) && !gone.has(r.a) && !gone.has(r.b)),
    ...pub.relations.map(clone),
  ]

  // Pictures and files that are new or changed.
  for (const [p, file] of Object.entries(pub.files)) {
    if (old.files[p] === file && await state.storage!.readBlob(p)) continue
    const b = await desktop.read('shared', `files/${file}`)
    if (b) await state.storage!.writeBlob(p, new Blob([b as BlobPart]))
  }

  // Lists: the DM's, plus options the player added themselves. Calendar, categories and today: the DM's.
  const lists = { ...(d.meta.lists ?? {}) }
  for (const [key, opts] of Object.entries(pub.options)) {
    const own = (lists[key] ?? []).filter(o => !opts.some(x => x.id === o.id))
    lists[key] = [...clone(opts), ...own]
  }
  d.meta.lists = lists
  Object.assign(d.meta, clone(pub.world))

  d.follow = { worldId: pub.worldId, title: pub.title, published: pub.published, ids: [...newIds], relations: [...pubRel], files: { ...pub.files } }
  touch()
  await save()
  return { added, changed, removed: gone.size, title: pub.title }
}

/** The player's own note on a shared entry. */
export function setPlayerNote(id: Id, text: string) {
  const d = db()
  const notes = { ...(d.playerNotes ?? {}) }
  if (text.trim()) notes[id] = text; else delete notes[id]
  d.playerNotes = notes
  touch()
}

// ---------- checking for updates ----------

/** What the last check said, for the banner and ⚙. */
export const syncStatus = reactive({ note: '', error: '', busy: false, checked: '' })

/** Look for a new publish and apply it. `manual`: say so too when there's nothing new. */
export async function checkShared(manual = false) {
  if (syncStatus.busy) return
  syncStatus.busy = true
  try {
    const r = await syncNow()
    syncStatus.error = ''
    syncStatus.checked = new Date().toISOString()
    if (r) syncStatus.note = `Updated from ${r.title}: ${r.added} new, ${r.changed} changed, ${r.removed} removed.`
    else if (manual) syncStatus.note = 'Already up to date.'
  } catch (e) {
    syncStatus.error = (e as Error).message
  } finally { syncStatus.busy = false }
}

let timer: number | undefined
/** In a world that follows a shared one: check now and every 5 minutes. */
export async function startFollowing() {
  if (!desktop || !(state.db?.follow || await desktop.shared.get())) return
  await checkShared()
  clearInterval(timer)
  timer = window.setInterval(() => checkShared(), 5 * 60 * 1000)
}
