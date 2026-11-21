// Sharing the world with players through a shared folder (e.g. a Google Drive folder shared as "viewer"), one way:
// - The DM publishes: <shared folder>/<world id>/world.json (what players may know) plus files/<hash><ext> for the
//   pictures and files, named by their content so the sync service only moves what changed.
// - A player's world follows one published world: it checks on start and every few minutes, and an update replaces
//   the shared entries (read-only on the player's side), removes what's no longer shared, updates the lists, the
//   calendar, today's date and the ruleset, and leaves everything of the player's own alone (characters, notes, sessions…).
// - Live sessions (electron/live.cjs) carry the same publish over the local network: the DM hosts, "Send now" writes
//   the publish for the session (and the shared folder, if the world has one) and tells the connected players, whose
//   app reads it from the DM instead of the folder while connected. The DM can host whenever the world opens, and
//   have changes sent on their own a few seconds after they're made.
import { computed, reactive, watch } from 'vue'
import type { Database, Entry, Follow, Id, Relation } from './model/types'
import { LISTS, type ListOption } from './model/lists'
import { mapRefs } from './model/refs'
import { backupNow, db, listOptions, save, state, touch } from './store'
import { DATA_VERSION, upgradeEntries } from './migrations'
import { finish, stage, tick } from './progress'
import type { RulesMeta } from './rules'
import type { TravelMode } from './travel'
import { desktop, type HostStatus, type PlayerStatus } from './storage/desktop'
import { clone, dataPaths, outgoingEntries, planExport, stable } from './transfer'

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
  /** The ruleset is null when the DM keeps the standard rules (missing in publishes from before it was shared). */
  world: { calendar: unknown; eventCategories: unknown; today: unknown; rules?: RulesMeta | null; travelModes?: TravelMode[] | null }
  /** Data path → file name in files/. */
  files: Record<string, string>
}

const decode = (b: Uint8Array | null) => (b ? new TextDecoder().decode(b) : null)
const extOf = (p: string) => { const m = p.match(/\.[a-z0-9]{1,6}$/i); return m ? m[0].toLowerCase() : '' }
async function hashOf(blob: Blob) {
  const buf = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}
const content = (e: Entry) => stable({ ...e, updated: undefined, created: undefined })
/**
 * The content names of pictures and files already worked out, by path and size: the app never rewrites a picture in
 * place (a new one gets a new name), so a send only reads the files again, without hashing each one.
 */
const hashes = new Map<string, string>()
async function fileName(p: string, b: Blob) {
  const key = `${p}|${b.size}`
  let name = hashes.get(key)
  if (!name) { name = (await hashOf(b)) + extOf(p); hashes.set(key, name) }
  return name
}
/** The parts of the world besides entries a publish carries, with how a change to each is named. */
const WORLD_PARTS = [
  ['today', "today's date"], ['calendar', 'the calendar'], ['eventCategories', 'the event categories'],
  ['rules', 'the ruleset'], ['travelModes', 'the travel paces'],
] as const

// ---------- the DM's side ----------

export interface PublishPlan {
  pub: Published
  blobs: Map<string, Blob>
  added: Entry[]
  changed: Entry[]
  removed: { id: Id; name: string }[]
  /** What else differs from the last publish ("today's date", "the ruleset"). */
  worldChanged: string[]
  /** The last publish, if any. */
  previous?: string
}

/** Where a publish goes: the shared folder ('publish') and/or the live session ('live'). */
export type PublishTarget = 'publish' | 'live'

/**
 * What a publish would send now: shared entries (no characters), compared with the last publish to `since` (the
 * shared folder, or the live session's last "Send now" when the world has no folder).
 */
export async function planPublish(since: PublishTarget = 'publish'): Promise<PublishPlan> {
  if (!state.worldId) throw new Error('This world has no ID yet; reopen it in the desktop app.')
  // what players sent (their characters and their own things) stays with the DM
  const plan = planExport(null, { dmText: false, hidden: false, textLinks: false, skip: ['pc'], exclude: e => playerIndex.value.has(e.id) })!
  const { entries, names } = outgoingEntries(plan)
  const ids = new Set(entries.map(e => e.id))
  const files: Record<string, string> = {}
  const blobs = new Map<string, Blob>()
  for (const p of new Set(entries.flatMap(dataPaths))) {
    const b = await state.storage!.readBlob(p)
    if (!b) continue
    const name = await fileName(p, b)
    files[p] = name
    blobs.set(name, b)
  }
  const m = db().meta
  const pub: Published = {
    format: PUBLISH_FORMAT, version: 1, worldId: state.worldId, title: m.title, dataVersion: db().version ?? DATA_VERSION,
    published: new Date().toISOString(),
    entries, relations: plan.relations.filter(r => ids.has(r.a) && ids.has(r.b)).map(clone),
    options: Object.fromEntries(LISTS.map(l => [l.key, listOptions(l.key)])),
    names, world: clone({ calendar: m.calendar, eventCategories: m.eventCategories, today: m.today, rules: m.rules ?? null, travelModes: m.travelModes ?? null }), files,
  }
  let last: Published | null = null
  try { last = JSON.parse(decode(await desktop!.read(since, 'world.json')) ?? 'null') } catch { last = null }
  const before = new Map((last?.entries ?? []).map(e => [e.id, e]))
  return {
    pub, blobs,
    added: entries.filter(e => !before.has(e.id)),
    changed: entries.filter(e => before.has(e.id) && content(before.get(e.id)!) !== content(e)),
    removed: [...before.values()].filter(e => !ids.has(e.id)).map(e => ({ id: e.id, name: e.name })),
    worldChanged: !last ? [] : [
      ...WORLD_PARTS.filter(([k]) => stable(last!.world?.[k] ?? null) !== stable(pub.world[k] ?? null)).map(([, label]) => label),
      ...(stable(last.options ?? {}) !== stable(pub.options) ? ['the dropdown lists'] : []),
    ],
    previous: last?.published,
  }
}

/**
 * Write a publish to each target (the shared folder, the live session): new files first, then world.json (swapped in
 * whole), then old files out. Players connected live are told right after.
 */
export async function publish(p: PublishPlan, progress?: (done: number, total: number) => void, targets: PublishTarget[] = ['publish']) {
  p.pub.published = new Date().toISOString()
  for (const root of targets) {
    const have = new Set(await desktop!.list(root, 'files'))
    const missing = [...p.blobs].filter(([name]) => !have.has(name))
    let done = 0
    for (const [name, b] of missing) {
      await desktop!.write(root, `files/${name}`, new Uint8Array(await b.arrayBuffer()))
      progress?.(++done, missing.length)
    }
    await desktop!.write(root, 'world.json', new TextEncoder().encode(JSON.stringify(p.pub)))
    for (const name of have) if (!p.blobs.has(name)) await desktop!.remove(root, `files/${name}`)
  }
  if (targets.includes('live')) await desktop!.live.sent()
  db().meta.lastPublished = p.pub.published
  touch()
  await save()
}

// ---------- a player's side ----------

/** The DM's world: the entries players sent (playerCharacters.ts), with whose they are and whether still shared. */
const playerIndex = computed(() => {
  const m = new Map<Id, { player: string; who: string; gone: boolean }>()
  for (const [player, p] of Object.entries(state.db?.meta.fromPlayers ?? {})) {
    const gone = new Set(Object.values(p.characters).filter(c => c.gone).map(c => c.id))
    for (const id of Object.values(p.entries)) m.set(id, { player, who: p.who, gone: gone.has(id) })
  }
  return m
})
/** Whose an entry is that a player sent (their character, or something it uses), if it is one. */
export const fromPlayer = (e: Entry | undefined) => (e ? playerIndex.value.get(e.id) : undefined)
/** Read-only here: shared by the followed world (a player's), or sent by a player (the DM's). */
export function isShared(e: Entry | undefined): boolean {
  return !!e && (!!state.db?.follow?.ids.includes(e.id) || playerIndex.value.has(e.id))
}
/** Who an entry that's read-only here comes from, in words: "your DM's Kirandreth", "Celeste's player". */
export function sharedBy(e: Entry | undefined): { label: string; title: string } | undefined {
  if (!e) return undefined
  const p = playerIndex.value.get(e.id)
  if (p) return { label: `from ${p.who}`, title: `Sent by ${p.who}'s app while they're connected to your live session; read-only here${p.gone ? '. They no longer share it' : ''}` }
  if (state.db?.follow?.ids.includes(e.id)) return { label: `from ${state.db.follow.title}`, title: `Shared by your DM from ${state.db.follow.title}; updated from there` }
  return undefined
}

export interface SyncResult { added: number; changed: number; removed: number; title: string }

/** When the player's world was last backed up before an update (0: not since it was opened). */
let lastBackup = 0
const BACKUP_EVERY = 60 * 60 * 1000

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
  if (pub.format !== PUBLISH_FORMAT) throw new Error("The shared folder's world.json isn't a GM Notes world.")
  if (d.follow && pub.worldId !== d.follow.worldId) throw new Error(`The shared folder holds “${pub.title}”, not the world this one follows.`)
  if (pub.dataVersion > DATA_VERSION) throw new Error(`“${pub.title}” was published by a newer GM Notes (data version ${pub.dataVersion}). Update GM Notes to get it.`)
  if (d.follow?.published === pub.published) return null
  // Published by an older version: its entries are brought up to date, as the DM's world will be.
  if (pub.dataVersion < DATA_VERSION) {
    const u = upgradeEntries(pub.entries, pub.dataVersion, pub.options)
    pub.entries = u.entries
    if (u.lists) pub.options = u.lists
  }

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
  // A backup first: the first update after opening the world, then at most every hour, and whenever entries go
  // (live sessions can send many small updates in an evening).
  if (gone.size || Date.now() - lastBackup > BACKUP_EVERY) { await backupNow(); lastBackup = Date.now() }
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

  // Pictures and files that are new or changed (with a bar when there are several).
  const toFetch: [string, string][] = []
  for (const [p, file] of Object.entries(pub.files)) if (old.files[p] !== file || !await state.storage!.readBlob(p)) toFetch.push([p, file])
  if (toFetch.length > 3) await stage(`Updating from ${pub.title}`, 'Pictures and files', toFetch.length)
  try {
    let n = 0
    for (const [p, file] of toFetch) {
      const b = await desktop.read('shared', `files/${file}`)
      if (b) await state.storage!.writeBlob(p, new Blob([b as BlobPart]))
      if (toFetch.length > 3) await tick(++n)
    }
  } finally { if (toFetch.length > 3) finish() }

  // Lists: the DM's, plus options the player added themselves. Calendar, categories, today, the ruleset and the travel
  // paces: the DM's (a publish from before those were shared leaves the world's own).
  const lists = { ...(d.meta.lists ?? {}) }
  for (const [key, opts] of Object.entries(pub.options)) {
    const own = (lists[key] ?? []).filter(o => !opts.some(x => x.id === o.id))
    lists[key] = [...clone(opts), ...own]
  }
  d.meta.lists = lists
  const { rules, travelModes, ...world } = clone(pub.world)
  Object.assign(d.meta, world)
  if (rules !== undefined) d.meta.rules = rules ?? undefined
  if (travelModes !== undefined) d.meta.travelModes = travelModes ?? undefined

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
    if (r && (r.added || r.changed || r.removed || manual)) syncStatus.note = `Updated from ${r.title}: ${r.added} new, ${r.changed} changed, ${r.removed} removed.`
    else if (manual) syncStatus.note = 'Already up to date.'
  } catch (e) {
    syncStatus.error = (e as Error).message
  } finally { syncStatus.busy = false }
}

// ---------- live sessions ----------

/**
 * The DM's hosting and a player's connection, as the main process reports them; how a player's world gets its
 * updates (`via`: from the live session and/or a shared folder); and why hosting on opening didn't start.
 */
export const live = reactive({
  host: { hosting: false } as HostStatus, player: { state: 'off' } as PlayerStatus,
  via: { live: false, folder: false }, hostError: '',
})
if (desktop?.live) {
  desktop.live.onHost(s => { live.host = s })
  desktop.live.onPlayer(s => { live.player = s })
  // The DM sent a new version: fetch it (nothing happens when it's the one this world already has).
  desktop.live.onPublished(p => { if (state.db?.follow?.published !== p) checkShared() })
}
/** The name the DM sees for this player: their current character, or the world's title. */
export const whoAmI = () => {
  const id = state.db?.meta.currentCharacter
  return (id && state.db?.entries[id]?.name) || ''
}

let timer: number | undefined
/**
 * In a world that follows a shared one: keep in touch with the DM's live session (if it has one), and check the
 * shared folder now and every 5 minutes (if it has one).
 */
export async function startFollowing() {
  if (!desktop) return
  const f = await desktop.shared.get()
  if (!(state.db?.follow || f)) return
  live.via = { live: !!f?.live, folder: !!f?.folder }
  if (f?.live) live.player = await desktop.live.follow(whoAmI())
  if (f?.live && !f.folder) return
  await checkShared()
  clearInterval(timer)
  timer = window.setInterval(() => checkShared(), 5 * 60 * 1000)
}

/** Follow the world's live session from now on (a world that already follows the same DM world, e.g. via Drive). */
export async function connectLive(s: { host: string; port: number; worldId: string }, code: string) {
  await desktop!.shared.follow(null, s.worldId, { host: s.host, port: s.port, code })
  live.via.live = true
  live.player = await desktop!.live.follow(whoAmI())
}

/** On opening a world: follow the DM's world (a player's), or host the live session if the DM asked for that. */
export async function startSharing() {
  await startFollowing()
  if (!desktop?.live || state.db?.follow || state.readOnly || !state.db?.meta.sharing?.hostOnOpen) return
  try {
    live.host = await desktop.live.start(db().meta.title)
    live.hostError = ''
    if (state.db.meta.sharing.autoSend) await sendChanges()
  } catch (e) { live.hostError = hostErrorText(e) }
}
/** A hosting error without Electron's wrapping. */
export const hostErrorText = (e: unknown) => (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/** Change the DM's sharing choices; turning auto-send on while hosting sends what's new right away. */
export function setSharing(patch: NonNullable<Database['meta']['sharing']>) {
  const m = db().meta
  const next = { ...m.sharing, ...patch }
  for (const k of Object.keys(next) as (keyof typeof next)[]) if (!next[k]) delete next[k]
  m.sharing = Object.keys(next).length ? next : undefined
  touch()
  if (patch.autoSend && live.host.hosting) sendChanges()
}

// ---------- sending changes as they're made ----------

/** What auto-send did last, for the Live button. */
export const autoSend = reactive({ sent: '', error: '', busy: false })
/** How long after the last saved change auto-send waits, so a burst of edits goes out once. */
const AUTO_DELAY = 5000
let autoTimer: number | undefined
let sending = false
/** Whether a publish would change anything for the players. */
export const hasChanges = (p: PublishPlan) => !!(p.added.length || p.changed.length || p.removed.length || p.worldChanged.length)

/** Send what players don't have yet to the live session (nothing happens when nothing they see changed). */
export async function sendChanges() {
  if (!desktop?.live || !live.host.hosting || sending) return
  sending = true
  autoSend.busy = true
  try {
    const p = await planPublish('live')
    if (p.previous && p.previous === live.host.published && !hasChanges(p)) return
    await publish(p, undefined, ['live'])
    live.host = await desktop.live.hostStatus()
    autoSend.sent = p.pub.published
    autoSend.error = ''
  } catch (e) {
    autoSend.error = (e as Error).message
  } finally { sending = false; autoSend.busy = false }
}
// Every save while hosting with auto-send on starts the wait again (a send's own save doesn't count).
watch(() => state.savedAt, () => {
  if (sending || !live.host.hosting || !state.db?.meta.sharing?.autoSend || state.db.follow) return
  clearTimeout(autoTimer)
  autoTimer = window.setTimeout(sendChanges, AUTO_DELAY)
}, { flush: 'sync' })
