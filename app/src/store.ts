// The loaded world plus lookups the pages need, and saving it (only what changed) with backups.
import { reactive, computed, shallowRef } from 'vue'
import type { ClassLine, Database, Entry, EntryType, Id, Relation, WorldDate } from './model/types'
import type { Storage } from './storage/storage'
import type { Backend, Changes } from './storage/backend'
import { SCHEMA, RELATION_KINDS, MARTIAL_WEAPONS, SIMPLE_WEAPONS, byKey, type FieldDef } from './model/schema'
import { LIST_BY_KEY, LISTS, labelIn, listKeyOf, optionsIn, type ListOption } from './model/lists'
import { checkDatabase, type Problem } from './validate'
import { defaultCalendar, formatYear } from './calendar'
import { classFinder, dieOf, parseClassText } from './model/classes'

/** The play state (the fight, the world's own spellbook and workbench): saved like the rest, but not a "world edit". */
const PLAY_KEYS = ['tracker', 'spellbook', 'crafting'] as const
const BACKUP_DIR = 'backups'
const BACKUP_EVERY_MS = 10 * 60 * 1000
/** The newest data version this build understands (the last step in upgrade()). Newer data opens read-only. */
export const DATA_VERSION = 23
/** The oldest data version this build can still open; older data is refused instead of guessed at. */
export const OLDEST_VERSION = 20
/** What the database must allow: every entry type and relation kind the app knows. */
const TYPES_LIST = SCHEMA.map(t => t.type) as string[]
const KINDS_LIST = Object.keys(RELATION_KINDS)

export const state = reactive({
  /** What the data check found when the data was opened (see validate.ts and the Data page). */
  problems: [] as Problem[],
  /** Pictures and attached files in the data folder. */
  storage: null as Storage | null,
  /** The world's database. */
  backend: null as Backend | null,
  db: null as Database | null,
  dirty: false,
  saving: false,
  error: '' as string,
  lastBackup: 0,
  /** Bumped on every change; lets a save notice edits made while it was writing. */
  changes: 0,
  savedAt: 0,
  /** Why nothing is saved, if it isn't (newer or too old data, the data changed elsewhere). */
  readOnly: '' as string,
  /** Another copy of the app saved since this one loaded. */
  conflict: false,
  /** The data was just converted from the JSON files of an earlier version. */
  converted: null as { entries: number; relations: number } | null,
  /** The open world's permanent ID (desktop app), and the world it may be a copy of. */
  worldId: null as string | null,
  copyOf: null as { title: string; dir: string } | null,
})

/** The world as last loaded or saved, piece by piece (as JSON), to find what changed. */
const saved = { entries: new Map<Id, string>(), relations: new Map<string, string>(), meta: '', play: {} as Record<string, string>, version: 0 }
let rev = 0
/** Entries whose current version must go into the history on the next save (see HistoryDialog). */
export const keepVersion = new Set<Id>()

export const db = () => state.db!

function remember(d: Database) {
  saved.entries = new Map(Object.values(d.entries).map(e => [e.id, JSON.stringify(e)]))
  saved.relations = new Map(d.relations.map(r => [r.id, JSON.stringify(r)]))
  saved.meta = JSON.stringify(d.meta)
  saved.play = Object.fromEntries(PLAY_KEYS.map(k => [k, JSON.stringify(d[k] ?? null)]))
  saved.version = d.version
}

/** Open the world. Returns false if the folder has no world yet (the app then offers to start one). */
export async function open(backend: Backend, storage: Storage): Promise<boolean> {
  state.backend = backend
  state.storage = storage
  const l = await backend.load(TYPES_LIST, KINDS_LIST)
  if (l.empty || !l.data) return false
  const d = l.data
  rev = l.rev ?? 0
  state.converted = l.converted ?? null
  state.worldId = l.worldId ?? null
  state.copyOf = l.copyOf ?? null
  state.db = d
  state.dirty = false
  remember(d)
  if ((d.version ?? 1) < OLDEST_VERSION) {
    state.readOnly = `This data is from an early test version of the app (data version ${d.version ?? 1}); this one opens data version ${OLDEST_VERSION} and newer. Nothing is saved here.`
    return true
  }
  if ((d.version ?? 1) > DATA_VERSION) {
    state.readOnly = `This data was saved by a newer version of the app (data version ${d.version}, this one knows up to ${DATA_VERSION}). Update the app; until then nothing is saved here.`
    return true
  }
  if (upgrade(d)) touch()
  state.problems = checkDatabase(d)
  return true
}

/**
 * Bring older saved data up to date. Returns true if anything changed (it's then saved).
 * Everything before data version 20 was converted and those steps removed.
 * Adding one? Write it as `if ((d.version ?? 1) < 22) { …; d.version = 22; changed = true }`, raise DATA_VERSION
 * to match, and lower OLDEST_VERSION only if the step can handle older data.
 */
function upgrade(d: Database): boolean {
  let changed = false
  if ((d.version ?? 1) < 21) { upgradeTo21(d); d.version = 21; changed = true }
  if ((d.version ?? 1) < 22) { upgradeTo22(d); d.version = 22; changed = true }
  if ((d.version ?? 1) < 23) { upgradeTo23(d); d.version = 23; changed = true }
  return changed
}

/**
 * 23: characters have classes with levels (multiclassing) instead of a class text, and hit dice spent per die.
 * - "Warlock/Fighter" becomes the class list's Warlock and Fighter (a name the list doesn't have is added to it).
 *   One class takes the old level; several start at level 1 each. Without a class, the plain level stays.
 * - The spent hit dice count for the old hit die, or the main class's.
 */
function upgradeTo23(d: Database) {
  const finder = classFinder(d.meta)
  const before = finder.list.length
  for (const e of Object.values(d.entries)) {
    if (e.type !== 'pc') continue
    const f = e.fields as Record<string, unknown>
    if (typeof f.class === 'string' && f.class.trim() && !Array.isArray(f.classLevels)) {
      f.classLevels = parseClassText(f.class, f.level, finder.find)
      delete f.level
    }
    delete f.class
    const s = f.sheet as (Record<string, unknown> & { hitDie?: string }) | undefined
    if (s && 'hitDiceUsed' in s) {
      const used = Number(s.hitDiceUsed) || 0
      const main = Array.isArray(f.classLevels) ? (f.classLevels as ClassLine[])[0] : undefined
      if (used > 0) s.hitDiceSpent = { [s.hitDie || (main ? dieOf(main) : 'd8')]: used }
      delete s.hitDiceUsed
    }
  }
  if (finder.list.length > before) d.meta.lists = { ...(d.meta.lists ?? {}), class: finder.list }
}

/** The tools of version 21 (a Tool item's "tool" field, a recipe's "Crafted with"). */
const TOOLS_21 = [
  "Alchemist's Supplies", "Brewer's Supplies", "Calligrapher's Supplies", "Carpenter's Tools", "Cartographer's Tools",
  "Cobbler's Tools", "Cook's Utensils", "Glassblower's Tools", "Jeweler's Tools", "Leatherworker's Tools", "Mason's Tools",
  "Painter's Supplies", "Potter's Tools", "Smith's Tools", "Tinker's Tools", "Weaver's Tools", "Woodcarver's Tools",
  'Disguise Kit', 'Forgery Kit', 'Gaming Set', 'Herbalism Kit', 'Musical Instrument', "Navigator's Tools", "Poisoner's Kit",
  "Thieves' Tools", 'Vehicles (Land)', 'Vehicles (Water)',
]

/**
 * 22: dropdowns became managed lists, used by reference, and tools became items.
 * - A recipe's "Crafted with" and a character's (or the world Workbench's) tools point to Tool items; a tool with
 *   no item yet gets one. The items' own "tool" field goes.
 * - Weapons get their base weapon from the subtype ("Melee (Rapier)").
 * - Any value in the data that isn't a list's starting option is added to that list, so every value is one.
 */
function upgradeTo22(d: Database) {
  const low = (v: string) => v.toLowerCase().trim()
  const items = () => Object.values(d.entries).filter(e => e.type === 'item')
  const toolItem = (name: string): Id => {
    const found = items().find(e => e.fields.kind === 'Tool' && (low(String((e.fields as Record<string, unknown>).tool ?? '')) === low(name) || low(e.name) === low(name)))
    if (found) return found.id
    const id = uniqueId(d, name)
    const now = new Date().toISOString()
    d.entries[id] = { id, type: 'item', name, aliases: [], tags: [], fields: { kind: 'Tool' }, body: '', visibility: 'known', created: now, updated: now }
    return id
  }
  for (const e of items()) {
    const f = e.fields as Record<string, unknown>
    if (typeof f.craftingType === 'string' && !d.entries[f.craftingType]) {
      if (f.craftingType === 'Other') delete f.craftingType
      else f.craftingType = toolItem(f.craftingType)
    }
    if (e.fields.kind === 'Weapon' && !e.fields.baseWeapon) {
      const sub = String(e.fields.subtype ?? '')
      const base = sub.match(/\(([^)]+)\)/)?.[1].trim()
      if (base) e.fields.baseWeapon = [...SIMPLE_WEAPONS, ...MARTIAL_WEAPONS].find(w => low(w) === low(base)) ?? base
    }
  }
  const toIds = (tools: string[]) => [...new Set(tools.map(t => (d.entries[t] ? t : toolItem(t))))]
  for (const e of Object.values(d.entries)) {
    const p = e.type === 'pc' ? e.fields.sheet?.proficiencies : undefined
    if (p?.tools?.length) p.tools = toIds(p.tools)
  }
  if (d.crafting?.tools.length) d.crafting.tools = toIds(d.crafting.tools)
  for (const e of items()) delete (e.fields as Record<string, unknown>).tool
  // Every value used becomes an option of its list.
  const lists: Record<string, ListOption[]> = { ...d.meta.lists }
  const add = (key: string, v: unknown) => {
    if (typeof v !== 'string' || !v) return
    const l = (lists[key] ??= optionsIn(d.meta, key).map(o => ({ ...o })))
    if (!l.some(o => o.id === v)) l.push({ id: v, label: v })
  }
  for (const e of Object.values(d.entries)) {
    for (const f of SCHEMA.find(t => t.type === e.type)?.fields ?? []) {
      const key = listKeyOf(f)
      if (!key) continue
      const v = byKey(e.fields)[f.key]
      for (const x of Array.isArray(v) ? v : [v]) if (x != null && !optionsIn(d.meta, key).some(o => o.id === x)) add(key, x)
    }
    const p = e.type === 'pc' ? e.fields.sheet?.proficiencies : undefined
    for (const l of p?.languages ?? []) if (!optionsIn(d.meta, 'language').some(o => o.id === l)) add('language', l)
  }
  if (Object.keys(lists).length) d.meta.lists = lists
}
/** An id for a new entry made from a name: its slug, with a number if taken. */
function uniqueId(d: Database, name: string) {
  const slug = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'entry'
  let id = slug
  for (let n = 2; d.entries[id]; n++) id = `${slug}-${n}`
  return id
}

/**
 * 21: proficiencies became lists the items match. Items get what they were only written in their subtype
 * (a weapon's Simple/Martial, an armor's Light/Medium/Heavy/Shield/Clothing) and kits become Tool items;
 * a sheet's proficiency text moves to "other", and its Workbench tools become its tool proficiencies.
 */
function upgradeTo21(d: Database) {
  const low = (v: string) => v.toLowerCase().trim()
  const named = (list: readonly string[], v: string) => list.find(x => low(x) === low(v))
  const TOOL_NAMES: Record<string, string> = { 'alchemy kit': "Alchemist's Supplies", "alchemist's kit": "Alchemist's Supplies", "thieves tools": "Thieves' Tools" }
  for (const e of Object.values(d.entries)) {
    const f = e.fields
    if (e.type === 'item') {
      const sub = String(f.subtype ?? '')
      if (f.kind === 'Weapon' && !f.weaponCategory) {
        const base = sub.match(/\(([^)]+)\)/)?.[1] ?? sub
        f.weaponCategory = named(SIMPLE_WEAPONS, base) ? 'Simple' : named(MARTIAL_WEAPONS, base) ? 'Martial' : undefined
        if (!f.weaponCategory) delete f.weaponCategory
      }
      if (f.kind === 'Armor' && !f.armorType) {
        const t = sub.match(/^\s*(light|medium|heavy)\s+armor/i)?.[1] ?? (/^\s*shield/i.test(sub) ? 'Shield' : /^\s*clothing/i.test(sub) ? 'Clothing' : undefined)
        if (t) f.armorType = t[0].toUpperCase() + t.slice(1).toLowerCase()
      }
      if (['Other', 'Adventuring Gear'].includes(String(f.kind ?? '')) && !f.recipe?.length) {
        const tool = named(TOOLS_21, e.name) ?? TOOL_NAMES[low(e.name)]
        if (tool) { f.kind = 'Tool'; (f as Record<string, unknown>).tool = tool }
      }
    }
    if (e.type === 'pc' && f.sheet) {
      const s = f.sheet as unknown as Record<string, unknown> & { crafting?: { tools?: string[]; known: Id[] } }
      const old = s.proficiencies
      const p = { armor: [] as string[], weapons: [] as string[], tools: [] as string[], languages: [] as string[], ...(typeof old === 'object' && old ? old : {}) } as { armor: string[]; weapons: string[]; tools: string[]; languages: string[]; other?: string }
      if (typeof old === 'string' && old.trim()) p.other = old
      for (const t of s.crafting?.tools ?? []) if (!p.tools.includes(t)) p.tools.push(t)
      if (s.crafting) delete s.crafting.tools
      if (old != null || p.tools.length) s.proficiencies = p
    }
  }
}

/** What changed since the last save; `world` says whether entries or relations did. */
function changesOf(d: Database): Changes & { world: boolean } {
  const upsert: Entry[] = [], relUpsert: Relation[] = []
  for (const e of Object.values(d.entries)) if (saved.entries.get(e.id) !== JSON.stringify(e)) upsert.push(e)
  const remove = [...saved.entries.keys()].filter(id => !d.entries[id])
  const ids = new Set(d.relations.map(r => r.id))
  for (const r of d.relations) if (saved.relations.get(r.id) !== JSON.stringify(r)) relUpsert.push(r)
  const relRemove = [...saved.relations.keys()].filter(id => !ids.has(id))
  const play: Changes['play'] = {}
  for (const k of PLAY_KEYS) if (saved.play[k] !== JSON.stringify(d[k] ?? null)) play[k] = d[k] ?? null
  const metaChanged = saved.meta !== JSON.stringify(d.meta)
  const world = !!(upsert.length || remove.length || relUpsert.length || relRemove.length)
  return { rev, upsert, remove, relUpsert, relRemove, play, world, meta: metaChanged || world ? d.meta : undefined, version: d.version !== saved.version ? d.version : undefined }
}

/**
 * What must hold before saving. A bug that wiped or mangled the world in memory must never reach the disk.
 * The database refuses broken entries and links by itself; this catches mass deletions it can't tell from intent.
 */
function checkBeforeSave(c: Changes): string {
  if (c.remove.length > 10) return `${c.remove.length} entries would disappear in one go`
  return ''
}

const stampOf = (t: Date) => { const p = (n: number) => String(n).padStart(2, '0'); return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}-${p(t.getHours())}-${p(t.getMinutes())}-${p(t.getSeconds())}` }
const BACKUP_NAME = /^dndesk-(\d{4})-(\d\d)-(\d\d)-(\d\d)-(\d\d)-(\d\d)\.sqlite$/

/**
 * Which automatic backups to keep: everything from the last 2 hours, then the newest of each hour for 2 days,
 * of each day for 2 months, and of each month for good. Files the app didn't name itself are never touched.
 */
export function backupsToDelete(names: string[], now = Date.now()): string[] {
  const dated = names.flatMap(n => {
    const m = n.match(BACKUP_NAME)
    return m ? [{ n, t: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() }] : []
  }).sort((a, b) => b.t - a.t)
  const H = 3600e3, D = 24 * H
  const seen = new Set<string>()
  const drop: string[] = []
  for (const { n, t } of dated) {
    const age = now - t, at = new Date(t)
    if (age < 2 * H) continue
    const bucket = age < 2 * D ? `h${at.getFullYear()}-${at.getMonth()}-${at.getDate()}-${at.getHours()}`
      : age < 60 * D ? `d${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`
      : `m${at.getFullYear()}-${at.getMonth()}`
    if (seen.has(bucket)) drop.push(n)
    else seen.add(bucket)
  }
  return drop
}

/**
 * Save what changed, as one transaction: it lands completely or not at all. At most every 10 minutes a copy of
 * the database goes to data/backups first. Another copy of the app having saved in between stops the save.
 */
export async function save(force = false) {
  const b = state.backend, d = state.db
  if (!b || !d || state.saving || state.readOnly) return
  state.saving = true
  const at = state.changes
  try {
    // "Last edit" on the Data page: stamped only when the world itself changes, not on every click in a fight.
    if (changesOf(d).world) d.meta.edited = new Date().toISOString()
    const { world: _world, ...c } = changesOf(d)
    const nothing = !c.upsert.length && !c.remove.length && !c.relUpsert.length && !c.relRemove.length && !c.meta && c.version == null && !Object.keys(c.play ?? {}).length
    if (!nothing) {
      const problem = checkBeforeSave(c)
      if (problem && !force) throw new Error(`Not saved, because ${problem}. Reload to get the last saved data back.`)
      const backupDue = force || Date.now() - state.lastBackup > BACKUP_EVERY_MS
      if (backupDue) await b.copyTo('data', `${BACKUP_DIR}/dndesk-${stampOf(new Date())}.sqlite`)
      if (force) c.rev = -1
      c.keep = c.upsert.filter(e => keepVersion.has(e.id)).map(e => e.id)
      rev = await b.save(c)
      keepVersion.clear()
      remember(d)
      if (backupDue && !b.readOnly) {
        for (const n of backupsToDelete(await state.storage!.list(BACKUP_DIR))) await state.storage!.remove(`${BACKUP_DIR}/${n}`)
        state.lastBackup = Date.now()
      }
    }
    state.dirty = state.changes !== at
    state.savedAt = Date.now()
    state.error = ''
  } catch (e) {
    const m = (e as Error).message
    if (m.startsWith('Conflict')) {
      state.conflict = true
      state.readOnly = "The data was saved by another copy of the app since this one loaded it. To keep those changes, reload. To keep this window's version instead, overwrite (the other version is kept in the backups)."
    } else state.error = m
  } finally {
    state.saving = false
    if (state.dirty && !state.error && !state.readOnly) scheduleSave()
  }
}

/** After a conflict: write this window's version anyway (the database is backed up first). */
export async function overwrite() {
  if (!state.conflict) return
  state.conflict = false
  state.readOnly = ''
  await save(true)
}

let timer: number | undefined
/** Save a moment after the last change, so typing doesn't write on every key. */
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

// ---------- the dropdown lists (model/lists.ts) ----------

/** A list's options in this world. */
export const listOptions = (key: string | undefined): ListOption[] => (key ? optionsIn(state.db?.meta, key) : [])
/** The options a field picks from (none for a field without a list). */
export const fieldOptions = (f: FieldDef | undefined) => listOptions(listKeyOf(f))
/** What a field's stored value reads as: an option's label, or for list fields each one's. */
export function fieldLabel(f: FieldDef | undefined, v: unknown): string {
  const key = listKeyOf(f)
  return Array.isArray(v) ? v.map(x => labelIn(state.db?.meta, key, x)).join(', ') : labelIn(state.db?.meta, key, v)
}
/** An option's label in a list. */
export const optionLabel = (key: string, id: unknown) => labelIn(state.db?.meta, key, id)
/** Replace a list (the Lists page); stored only once changed. */
export function setList(key: string, options: ListOption[]) {
  if (!LIST_BY_KEY.has(key)) return
  const m = db().meta
  m.lists = { ...m.lists, [key]: options }
  touch()
}
export { LISTS }

/** Player mode: the app trimmed for a player's own world (see meta.mode). */
export const playerMode = computed(() => state.db?.meta.mode === 'player')
export function setMode(mode: 'dm' | 'player') {
  const m = db().meta
  if (mode === 'dm') delete m.mode; else m.mode = mode
  touch()
}

/** What every new world starts with: src/seed/world.json, made by `npm run seed` from the DM's world. */
interface Seed {
  dataVersion: number
  meta: Pick<Database['meta'], 'calendar' | 'eventCategories' | 'today' | 'lists'>
  entries: Entry[]
  relations: Database['relations']
}

/**
 * Start a new world in a folder that has none (a player's copy). It opens in player mode, with the seed's lists,
 * calendar, races, subclasses, spells, feats and tools; a seed from an older data version is brought up to date
 * like any older data. Without a usable seed it starts empty, with a plain calendar.
 */
export async function createWorld(backend: Backend, storage: Storage, title: string) {
  const seed = (await import('./seed/world.json')).default as unknown as Seed
  if (seed?.dataVersion >= OLDEST_VERSION && seed.dataVersion <= DATA_VERSION) {
    const d: Database = {
      version: seed.dataVersion,
      meta: { title: title.trim() || 'My world', ...JSON.parse(JSON.stringify(seed.meta)), mode: 'player' },
      entries: Object.fromEntries(seed.entries.map(e => [e.id, JSON.parse(JSON.stringify(e)) as Entry])),
      relations: JSON.parse(JSON.stringify(seed.relations)),
    }
    upgrade(d)
    await backend.create(d, TYPES_LIST, KINDS_LIST)
    await open(backend, storage)
    return
  }
  const d: Database = {
    version: DATA_VERSION,
    meta: {
      title: title.trim() || 'My world',
      today: { year: 1, month: 1, day: 1 },
      calendar: defaultCalendar(),
      eventCategories: [],
      mode: 'player',
    },
    entries: {},
    relations: [],
  }
  await backend.create(d, TYPES_LIST, KINDS_LIST)
  await open(backend, storage)
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
  const y = formatYear(cal, d.year)
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
