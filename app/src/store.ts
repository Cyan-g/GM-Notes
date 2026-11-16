// The loaded database plus lookups the pages need, and saving with backups.
import { reactive, computed, shallowRef } from 'vue'
import type { Database, Entry, EntryType, Id, Relation, WorldDate } from './model/types'
import type { Storage } from './storage/storage'
import { OLD_PLACE_SIZES } from './model/schema'

const DB_FILE = 'eldoria.json'
const BACKUP_DIR = 'backups'
const BACKUP_EVERY_MS = 10 * 60 * 1000
const BACKUPS_KEPT = 40

export const state = reactive({
  storage: null as Storage | null,
  db: null as Database | null,
  dirty: false,
  saving: false,
  error: '' as string,
  lastBackup: 0,
  /** Bumped on every change; lets a save notice edits made while it was writing. */
  changes: 0,
  savedAt: 0,
})

export const db = () => state.db!

export async function open(storage: Storage) {
  state.storage = storage
  const text = await storage.readText(DB_FILE)
  if (text == null) throw new Error(`No ${DB_FILE} found in "${storage.label}". Pick the app's data folder.`)
  state.db = JSON.parse(text) as Database
  state.dirty = false
  if (upgrade(state.db)) touch()
}

/** Bring older saved data up to date. Returns true if anything changed (it's then saved). */
function upgrade(d: Database) {
  let changed = false
  for (const e of Object.values(d.entries)) {
    if (e.type === 'place' && OLD_PLACE_SIZES.includes(e.fields.placeType as string)) { delete e.fields.placeType; changed = true }
  }
  // Version 2: places whose map was a picture in the text (the import only took a picture at the very top)
  // get it as their map banner. Runs once; afterwards pictures in the text stay where you put them.
  if ((d.version ?? 1) < 2) {
    for (const e of Object.values(d.entries)) {
      if (e.type !== 'place' || e.fields.map || !e.body) continue
      const m = e.body.match(/!\[[^\]]*\]\((images\/[^)]+)\)/)
      if (!m) continue
      e.fields.map = decodeURIComponent(m[1])
      e.body = e.body.replace(m[0], '')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/(\n|^)#+ [^\n]*\s*$/, '') // a heading left with nothing under it at the end
        .trim()
    }
    d.version = 2
    changed = true
  }
  // Version 3: the "Spell Tome" note becomes the Spellbook page. The import lost the note's settings,
  // so they're filled in from the Obsidian note as it was, and the empty note is removed.
  if ((d.version ?? 1) < 3) {
    if (!d.spellbook) {
      const ids = (names: string[]) => names.map(n => Object.values(d.entries).find(e => e.type === 'spell' && e.name.toLowerCase() === n.toLowerCase())?.id).filter((x): x is string => !!x)
      d.spellbook = {
        attackBonus: 8, saveDC: 15, preparedMax: 15,
        slots: [4, 4, 4, 3, 2, 1, 0, 0, 0].map(max => ({ max, used: 0 })),
        prepared: ids(['Tharns Might', 'Alarm', 'Bless']),
        always: ids(['Acid Splash', 'Fire Bolt', 'Friends', 'Yawn']),
      }
    }
    const tome = d.entries['spell-tome']
    if (tome && tome.type === 'note' && tome.body.trim().length < 60) {
      delete d.entries['spell-tome']
      if (d.meta.favourites) d.meta.favourites = d.meta.favourites.filter(f => f !== 'spell-tome')
    }
    d.version = 3
    changed = true
  }
  // Version 4: scrolls link the spell they hold instead of describing it. Each "Scroll of X" gets
  // linked to the spell X (created empty if it doesn't exist yet), and the generated boilerplate goes.
  if ((d.version ?? 1) < 4) {
    for (const e of Object.values(d.entries)) {
      if (e.type !== 'item' || e.fields.kind !== 'Scroll' || e.fields.spell) continue
      const name = e.name.match(/^scroll of (.+)$/i)?.[1]?.trim()
      if (!name) continue
      let spell = Object.values(d.entries).find(x => x.type === 'spell' && x.name.toLowerCase() === name.toLowerCase())
      if (!spell) {
        const id = name.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        const now = new Date().toISOString()
        spell = { id: d.entries[id] ? `${id}-spell` : id, type: 'spell', name, aliases: [], tags: [], fields: {}, body: '', visibility: e.visibility, created: now, updated: now }
        d.entries[spell.id] = spell
      }
      e.fields.spell = spell.id
      if (/lets you cast/i.test(String(e.fields.summary ?? ''))) delete e.fields.summary
      if (/^\*\*Effect\*\*\s*Use an action to cast/i.test(e.body.trim())) e.body = ''
    }
    d.version = 4
    changed = true
  }
  return changed
}

/** Save the database. Before overwriting, keep a copy of the previous file every 10 minutes. */
export async function save() {
  const s = state.storage, d = state.db
  if (!s || !d || state.saving) return
  state.saving = true
  const at = state.changes
  try {
    if (Date.now() - state.lastBackup > BACKUP_EVERY_MS) {
      const prev = await s.readText(DB_FILE)
      if (prev) {
        const d = new Date(), p = (n: number) => String(n).padStart(2, '0')
        const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
        await s.writeText(`${BACKUP_DIR}/eldoria-${stamp}.json`, prev)
        const old = (await s.list(BACKUP_DIR)).filter(n => n.endsWith('.json')).sort()
        for (const n of old.slice(0, Math.max(0, old.length - BACKUPS_KEPT))) await s.remove(`${BACKUP_DIR}/${n}`)
      }
      state.lastBackup = Date.now()
    }
    await s.writeText(DB_FILE, JSON.stringify(d, null, 1))
    state.dirty = state.changes !== at
    state.savedAt = Date.now()
    state.error = ''
  } catch (e) {
    state.error = (e as Error).message
  } finally {
    state.saving = false
    if (state.dirty && !state.error) scheduleSave()
  }
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
  if (state.db) state.db.meta.edited = new Date().toISOString()
  scheduleSave()
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
    const p = e.fields.parent as Id | undefined
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
    cur = get(cur.fields.parent as Id)
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
