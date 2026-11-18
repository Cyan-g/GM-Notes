// The loaded database plus lookups the pages need, and saving with backups.
import { reactive, computed, shallowRef } from 'vue'
import type { Database, Entry, EntryType, Id, Relation, WorldDate } from './model/types'
import type { Storage } from './storage/storage'

const DB_FILE = 'eldoria.json'
/** What changes during play (the fight, the spellbook, the crafting pouch) lives in its own small file, so a click
 *  in a fight doesn't rewrite the whole world. In memory it's all one Database. */
const SESSION_FILE = 'session.json'
const SESSION_KEYS = ['tracker', 'spellbook', 'crafting'] as const
const BACKUP_DIR = 'backups'
const BACKUP_EVERY_MS = 10 * 60 * 1000
/** The newest data version this build understands (the last step in upgrade()). Newer files open read-only. */
export const DATA_VERSION = 20
/** The oldest data version this build can still open; older data (an old backup) is refused instead of guessed at. */
export const OLDEST_VERSION = 20

import { checkDatabase, type Problem } from './validate'

export const state = reactive({
  /** What the data check found when the data was opened (see validate.ts and the Data page). */
  problems: [] as Problem[],
  storage: null as Storage | null,
  db: null as Database | null,
  dirty: false,
  saving: false,
  error: '' as string,
  lastBackup: 0,
  /** Bumped on every change; lets a save notice edits made while it was writing. */
  changes: 0,
  savedAt: 0,
  /** Why this tab doesn't save, if it doesn't (another tab is editing, the file changed elsewhere, newer data). */
  readOnly: '' as string,
  /** The file on disk was changed by something else since this tab loaded or saved it. */
  conflict: false,
})

/** The data file as this tab last read or wrote it; a different one on disk means someone else saved. */
/** The text of each file as last read or written; a file whose new text is the same isn't written again. */
let worldText = '', sessionText = ''
/** How many entries the file had when this tab last read or wrote it. */
let savedCount = 0

export const db = () => state.db!

export async function open(storage: Storage) {
  state.storage = storage
  const text = await storage.readText(DB_FILE)
  if (text == null) throw new Error(`No ${DB_FILE} found in "${storage.label}". Pick the app's data folder.`)
  const d = JSON.parse(text) as Database
  // The play state comes from session.json. Before the split it was inside the world file, which is used then.
  const sessionRaw = await storage.readText(SESSION_FILE)
  if (sessionRaw != null) {
    const sess = JSON.parse(sessionRaw) as Partial<Database>
    for (const k of SESSION_KEYS) { if (sess[k]) (d as any)[k] = sess[k]; else delete (d as any)[k] }
  }
  worldText = text
  sessionText = sessionRaw ?? ''
  state.db = d
  state.dirty = false
  savedCount = Object.keys(d.entries ?? {}).length
  if ((d.version ?? 1) < OLDEST_VERSION) {
    state.readOnly = `This data is from an early test version of the app (data version ${d.version ?? 1}); this one opens data version ${OLDEST_VERSION} and newer. Nothing is saved here.`
    return
  }
  if ((d.version ?? 1) > DATA_VERSION) {
    state.readOnly = `This data was saved by a newer version of the app (data version ${d.version}, this one knows up to ${DATA_VERSION}). Reload to get the newer app; until then nothing is saved here.`
    return
  }
  if (!(await takeLock())) {
    state.readOnly = 'The data is already open for editing in another tab or window. Changes here are not saved; close the other one and reload this one to edit here.'
    return
  }
  if (upgrade(d)) touch()
  state.problems = checkDatabase(d)
}

/**
 * Take over another database (restoring a backup): bring it up to date, accept its size as the new normal,
 * and save it. Data from a newer app version is refused.
 */
export function adopt(d: Database) {
  if ((d.version ?? 1) > DATA_VERSION) throw new Error(`That backup is from a newer version of the app (data version ${d.version}).`)
  if ((d.version ?? 1) < OLDEST_VERSION) throw new Error(`That backup is from an early test version of the app (data version ${d.version ?? 1}) and can't be restored.`)
  upgrade(d)
  // A backup restores the world; the fight, spellbook and pouch stay as they are now.
  for (const k of SESSION_KEYS) { const cur = (state.db as any)?.[k]; if (cur) (d as any)[k] = cur; else delete (d as any)[k] }
  state.db = d
  savedCount = Object.keys(d.entries ?? {}).length
  touch()
}

/** Only one tab may edit at a time; it holds this lock until it closes. Without the Web Locks API, every tab may edit. */
function takeLock(): Promise<boolean> {
  const locks = (navigator as any).locks
  if (!locks?.request) return Promise.resolve(true)
  return new Promise(ok => {
    locks.request('eldoria-data', { ifAvailable: true }, (lock: unknown) => {
      ok(!!lock)
      return lock ? new Promise(() => { /* held for the life of the tab */ }) : undefined
    })
  })
}

/**
 * Bring older saved data up to date. Returns true if anything changed (it's then saved).
 * There are no steps yet: everything before data version 20 was converted and the steps removed.
 * Adding one? Write it as `if ((d.version ?? 1) < 21) { …; d.version = 21; changed = true }`, raise DATA_VERSION
 * to match, and lower OLDEST_VERSION only if the step can handle older data.
 */
function upgrade(d: Database): boolean {
  const changed = false
  void d
  return changed
}

/**
 * What must hold before the database is written. A bug that wiped or mangled the data in memory must never
 * reach the disk (and then, over time, the backups too).
 */
function checkBeforeSave(d: Database, text: string): string {
  if (!d.meta || !d.entries || typeof d.entries !== 'object' || !Array.isArray(d.relations)) return 'the data is missing its main parts'
  const n = Object.keys(d.entries).length
  if (!n && savedCount > 0) return 'there would be no entries left'
  const lost = savedCount - n
  if (lost > 10) return `${lost} entries would disappear in one go (${savedCount} → ${n})`
  try { JSON.parse(text) } catch { return 'the file would not read back' }
  return ''
}

const stampOf = (t: Date) => { const p = (n: number) => String(n).padStart(2, '0'); return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}-${p(t.getHours())}-${p(t.getMinutes())}-${p(t.getSeconds())}` }
const BACKUP_NAME = /^(eldoria|session)-(\d{4})-(\d\d)-(\d\d)-(\d\d)-(\d\d)-(\d\d)\.json$/

/**
 * Which automatic backups to keep: everything from the last 2 hours, then the newest of each hour for 2 days,
 * of each day for 2 months, and of each month for good. Files the app didn't name itself are never touched.
 */
export function backupsToDelete(names: string[], now = Date.now()): string[] {
  const dated = names.flatMap(n => {
    const m = n.match(BACKUP_NAME)
    return m ? [{ n, kind: m[1], t: new Date(+m[2], +m[3] - 1, +m[4], +m[5], +m[6], +m[7]).getTime() }] : []
  }).sort((a, b) => b.t - a.t)
  const H = 3600e3, D = 24 * H
  const seen = new Set<string>()
  const drop: string[] = []
  for (const { n, kind, t } of dated) {
    const age = now - t, at = new Date(t)
    if (age < 2 * H) continue
    const bucket = kind + (age < 2 * D ? `h${at.getFullYear()}-${at.getMonth()}-${at.getDate()}-${at.getHours()}`
      : age < 60 * D ? `d${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`
      : `m${at.getFullYear()}-${at.getMonth()}`)
    if (seen.has(bucket)) drop.push(n)
    else seen.add(bucket)
  }
  return drop
}

/** Save the database. Before overwriting, keep a copy of the previous file (at most every 10 minutes). */
/** The database as the two files it's saved in. */
function splitForSave(d: Database) {
  const world: Record<string, unknown> = {}, session: Record<string, unknown> = { version: 1 }
  for (const [k, v] of Object.entries(d)) {
    if ((SESSION_KEYS as readonly string[]).includes(k)) { if (v) session[k] = v }
    else world[k] = v
  }
  return { world: JSON.stringify(world, null, 1), session: JSON.stringify(session, null, 1) }
}

/**
 * Save what changed. Each file is checked for changes made elsewhere first, and the world is sanity-checked.
 * The play state is written before the world, so the world file never loses it without session.json having it.
 * The world gets a backup (at most every 10 minutes) only when it actually changes; so does the play state.
 */
export async function save(force = false) {
  const s = state.storage, d = state.db
  if (!s || !d || state.saving || state.readOnly) return
  state.saving = true
  const at = state.changes
  try {
    let { world, session } = splitForSave(d)
    const worldChanged = world !== worldText, sessionChanged = session !== sessionText
    // "Last edit" on the Data page: stamped only when the world itself changes, not on every click in a fight.
    if (worldChanged) { d.meta.edited = new Date().toISOString(); world = splitForSave(d).world }
    // Someone else saved a file since this tab read it: stop rather than overwrite their work.
    // Compared by content, not by the file's date: on Windows, asking the browser for a file's date leaves the
    // file open, and then the browser can't replace it. Reading it whole doesn't.
    const [worldDisk, sessionDisk] = await Promise.all([worldChanged ? s.readText(DB_FILE) : null, sessionChanged ? s.readText(SESSION_FILE) : null])
    const clash = !force && ((worldDisk != null && worldDisk !== worldText) || (sessionDisk != null && sessionDisk !== sessionText))
    if (clash) {
      state.conflict = true
      state.readOnly = `The data files were changed outside this tab since it loaded them. To keep those changes, reload. To keep this tab's version instead, overwrite (the other version is kept in backups).`
      return
    }
    if (worldChanged) {
      const problem = checkBeforeSave(d, world)
      if (problem) throw new Error(`Not saved, because ${problem}. Reload to get the last saved data back.`)
    }
    const backupDue = force || Date.now() - state.lastBackup > BACKUP_EVERY_MS
    const when = stampOf(new Date())
    if (sessionChanged) {
      if (backupDue && sessionDisk) await s.writeText(`${BACKUP_DIR}/session-${when}.json`, sessionDisk)
      await s.writeText(SESSION_FILE, session)
      sessionText = session
    }
    if (worldChanged) {
      if (backupDue && worldDisk) await s.writeText(`${BACKUP_DIR}/eldoria-${when}.json`, worldDisk)
      await s.writeText(DB_FILE, world)
      worldText = world
      savedCount = Object.keys(d.entries).length
    }
    if (backupDue && (worldChanged || sessionChanged)) {
      for (const n of backupsToDelete(await s.list(BACKUP_DIR))) await s.remove(`${BACKUP_DIR}/${n}`)
      state.lastBackup = Date.now()
    }
    state.dirty = state.changes !== at
    state.savedAt = Date.now()
    state.error = ''
  } catch (e) {
    state.error = (e as Error).message
  } finally {
    state.saving = false
    if (state.dirty && !state.error && !state.readOnly) scheduleSave()
  }
}

/** After a conflict: write this tab's version anyway (the version on disk goes to the backups first). */
export async function overwrite() {
  if (!state.conflict) return
  state.conflict = false
  state.readOnly = ''
  await save(true)
}

let timer: number | undefined
/** Save a moment after the last change, so typing doesn't write the file on every key. */
export function scheduleSave(delay = 1200) {
  clearTimeout(timer)
  timer = window.setTimeout(save, delay)
}

// ---------- lookups ----------

const version = shallowRef(0)
/** Call after changing entries or relations so the indexes rebuild. */
export const touch = () => {
  version.value++
  state.dirty = true
  state.changes++
  scheduleSave()
}

/** Player mode: the app trimmed for a player's own world (see meta.mode). */
export const playerMode = computed(() => state.db?.meta.mode === 'player')
export function setMode(mode: 'dm' | 'player') {
  const m = db().meta
  if (mode === 'dm') delete m.mode; else m.mode = mode
  touch()
}

/** Start a new, empty world in a folder that has none (a player's copy). It opens in player mode. */
export async function createWorld(storage: Storage, title: string) {
  if (await storage.readText(DB_FILE) != null) throw new Error(`There already is a world in "${storage.label}".`)
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  const d: Database = {
    version: DATA_VERSION,
    meta: {
      title: title.trim() || 'My world',
      today: { year: 1, month: 1, day: 1 },
      calendar: {
        name: 'Calendar', months: months.map((name, i) => ({ name, days: days[i] })),
        weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        leapMonth: 2, firstWeekDay: 1, moons: [], eras: [], holidays: [],
      },
      eventCategories: [],
      mode: 'player',
    },
    entries: {},
    relations: [],
  }
  await storage.writeText(DB_FILE, JSON.stringify(d, null, 1))
  await open(storage)
}

export const entries = computed(() => { version.value; return state.db ? Object.values(state.db.entries) : [] })

export const byType = computed(() => {
  const m = new Map<EntryType, Entry[]>()
  for (const e of entries.value) {
    if (!m.has(e.type)) m.set(e.type, [])
    m.get(e.type)!.push(e)
  }
  for (const list of m.values()) list.sort((a, b) => a.name.localeCompare(b.name))
  return m
})

export const relationsOf = computed(() => {
  version.value
  const m = new Map<Id, Relation[]>()
  for (const r of state.db?.relations ?? []) {
    for (const id of [r.a, r.b]) {
      if (!m.has(id)) m.set(id, [])
      m.get(id)!.push(r)
    }
  }
  return m
})

/** Entries whose `parent` field points at this one (sub-places, sub-organizations). */
export const childrenOf = computed(() => {
  const m = new Map<Id, Entry[]>()
  for (const e of entries.value) {
    const p = e.fields.parent
    if (!p) continue
    if (!m.has(p)) m.set(p, [])
    m.get(p)!.push(e)
  }
  for (const list of m.values()) list.sort((a, b) => a.name.localeCompare(b.name))
  return m
})

/** Every entry that mentions this one, in its text or in a field. */
export const backlinks = computed(() => {
  const m = new Map<Id, Set<Id>>()
  const add = (to: Id, from: Id) => { if (to !== from) { if (!m.has(to)) m.set(to, new Set()); m.get(to)!.add(from) } }
  for (const e of entries.value) {
    for (const [, id] of e.body.matchAll(/\[\[([^\]|#]+)/g)) add(id, e.id)
    const walk = (v: unknown) => {
      if (typeof v === 'string') { if (state.db!.entries[v]) add(v, e.id) }
      else if (Array.isArray(v)) v.forEach(walk)
      else if (v && typeof v === 'object') Object.values(v).forEach(walk)
    }
    walk(e.fields)
  }
  return m
})

export const get = (id: Id | undefined | null) => (id ? state.db?.entries[id] : undefined)

/** Places from the top down to this entry: World › Region › City. */
export function placePath(id: Id): Entry[] {
  const out: Entry[] = []
  const seen = new Set<Id>()
  let cur = get(id)
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    out.unshift(cur)
    cur = get(cur.fields.parent)
  }
  return out
}

// ---------- formatting ----------

export function formatMoney(cp: unknown): string {
  if (typeof cp !== 'number' || !isFinite(cp)) return ''
  if (cp < 0) return '−' + formatMoney(-cp)
  if (cp >= 100 && cp % 100 === 0) return `${(cp / 100).toLocaleString()} gp`
  if (cp >= 100) return `${(cp / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })} gp`
  if (cp >= 10 && cp % 10 === 0) return `${cp / 10} sp`
  return `${cp} cp`
}

export function formatDate(d: WorldDate | undefined | null): string {
  if (!d || d.year == null) return ''
  const cal = state.db?.meta.calendar
  const era = d.year < 0 ? ' BC' : ' AC'
  const y = `${Math.abs(d.year)}${era}`
  if (!d.month) return y
  const month = cal?.months[d.month - 1]?.name ?? `Month ${d.month}`
  return d.day ? `${d.day} ${month} ${y}` : `${month} ${y}`
}

export const dateKey = (d?: WorldDate | null) => d ? d.year * 10000 + (d.month ?? 0) * 100 + (d.day ?? 0) : Number.NEGATIVE_INFINITY
/** Is a dated relation true today (in the world)? An end date without month or day runs to the end of that year or month. */
export function isCurrent(r: Relation): boolean {
  const today = dateKey(state.db?.meta.today)
  if (r.from && dateKey(r.from) > today) return false
  if (r.to && r.to.year * 10000 + (r.to.month ?? 12) * 100 + (r.to.day ?? 99) < today) return false
  return true
}
