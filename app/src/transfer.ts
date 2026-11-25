// Sharing with someone else who has this app: an entry, or the whole world, saved as a file they can import.
//
// - Export starts at an entry (or at the world) and follows every reference it holds, and theirs, recursively
//   (model/refs.ts): fields, recipes, stock, pins, a character's inventory, spellbook and tools, and if asked the
//   [[links]] in the text. The world's export holds every entry, the connections between them, all dropdown lists,
//   the calendar and today's date.
// - Campaigns, sessions, encounters and creatures never travel: they're what the DM runs the game with.
// - DM-only text is left out unless asked; entries hidden from the players (and connections to them) can be too.
// - A reference to something that stays home stays a reference (a link keeps its words), so it still works where
//   that entry exists; one to a hidden entry left out is dropped (a link becomes plain words). On import, a
//   reference to something neither in the file nor here is dropped, and a field that lost one keeps this world's
//   own value.
// - Import matches each entry to one already here (same id, else same type and name) and updates it; the rest are
//   added. The import preview says what's new, what changes and what's already the same.
import { progress, stage, tick } from './progress'
import { parseClassText } from './model/classes'
// - Choices (kind, rarity, school…) travel with their labels: one this world doesn't have is added to its list;
//   from a world's file, a renamed option is renamed here too.
import type { Database, Entry, EntryType, Id, Relation, Statblock } from './model/types'
import { statsOf } from './encounter'
import { db, get, listOptions, setList, state, touch } from './store'
import { LIST_BY_KEY, LISTS, listKeyOf, type ListOption } from './model/lists'
import { addRelation, newId } from './edit'
import { RELATION_KINDS, TYPES } from './model/schema'
import { mapRefs, refsOf } from './model/refs'
import { checkEntry, checkField } from './validate'
import { hasSecrets, stripSecrets } from './model/text'
import { DATA_VERSION, OLDEST_VERSION, upgradeEntries } from './migrations'

export const FORMAT = 'dndesk-export'
const VERSION = 2

/**
 * Never shared: what the DM runs the game with. Campaigns known to players are shared (players link their characters
 * to them), and so are creatures known to players (a player's companions).
 */
export const NEVER: readonly EntryType[] = ['session', 'encounter']
export const canExport = (e: Entry) => !NEVER.includes(e.type)

/** The parts of the world's settings that travel with the world. */
type WorldPart = Pick<Database['meta'], 'calendar' | 'eventCategories' | 'today'>

export interface Bundle {
  format: typeof FORMAT
  version: 1 | 2
  /** The data version of the entries (files from before data version 31 don't say: they're taken as 30). */
  dataVersion?: number
  exported: string
  /** The world it came from, for the import preview. */
  from: string
  /** The exported entry; the other entries came along because it points at them. None: the whole world. */
  main?: Id
  entries: Entry[]
  /** Connections between the entries in the file. */
  relations?: Relation[]
  /** Pictures and attached files, as data: URLs, by their path in the data folder. */
  files: Record<string, string>
  /** The list options the entries use (a world's file: every list), with their labels. */
  options?: Record<string, ListOption[]>
  /** The names of entries referred to that stay home, for a world that doesn't have them (a link becomes words). */
  names?: Record<Id, string>
  /** False when the DM-only text was left out. */
  dmText?: boolean
  world?: WorldPart
}

const DATA_PATH = /\]\(<?((?:images|files)\/[^)>]+)>?\)/g
const SAFE_PATH = /^(images|files)\/[^/]+$/
/** A deep copy of plain data (through JSON). */
export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const norm = (s: string) => s.trim().toLowerCase()
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
/** JSON with sorted keys, to tell whether two things are the same. */
export const stable = (v: unknown) => JSON.stringify(v, (_k, x) => (isObj(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x))

/** The keys of a type's picture fields (a place's map, a deity's symbol). */
const imageKeys = (t: EntryType) => (TYPES[t]?.fields ?? []).filter(f => f.kind === 'image').map(f => f.key)
/** The keys of a type's DM-only fields (an NPC's secret and attitude). */
const dmOnlyKeys = (t: EntryType) => (TYPES[t]?.fields ?? []).filter(f => f.dmOnly).map(f => f.key)

/** Paths of the pictures and files an entry uses. */
export function dataPaths(e: Entry): string[] {
  const out = new Set<string>()
  if (e.image) out.add(e.image)
  for (const k of imageKeys(e.type)) { const v = (e.fields as Record<string, unknown>)[k]; if (typeof v === 'string' && v) out.add(v) }
  for (const f of e.files ?? []) out.add(f)
  for (const m of (e.body ?? '').matchAll(DATA_PATH)) out.add(decodeURI(m[1]))
  return [...out]
}

// ---------- export ----------

export interface ExportOptions {
  /** Keep the DM-only parts of the text. */
  dmText: boolean
  /** Take entries (and connections) the players don't know about, too. */
  hidden: boolean
  /** Also follow the [[links]] in the text (the world's export has everything anyway). */
  textLinks: boolean
  /** Types to leave out. */
  skip: EntryType[]
  /** Entries to leave out, whatever their type (what came from elsewhere and is there already). */
  exclude?: (e: Entry) => boolean
}

export interface ExportPlan {
  /** The entry it starts at; none for the whole world. */
  start: Entry | null
  /** Everything that goes in, the start first. */
  entries: Entry[]
  relations: Relation[]
  /** How many entries of each type there would be with no type left out. */
  counts: Partial<Record<EntryType, number>>
  /** How many of the entries are hidden from the players (with hidden ones taken along). */
  hiddenCount: number
  opts: ExportOptions
}

/** What an export holds: from an entry, everything it points at, recursively; from the world, every entry. */
export function planExport(start: Id | null, opts: ExportOptions): ExportPlan | null {
  const first = (start ? get(start) : null) ?? null
  if (start && (!first || !canExport(first))) return null
  const d = db()
  const travels = (e: Entry | undefined, skip: readonly EntryType[], hidden: boolean): e is Entry =>
    !!e && (e.id === start || (canExport(e) && !skip.includes(e.type) && !opts.exclude?.(e) && (hidden || e.visibility === 'known')))
  const collect = (skip: readonly EntryType[], hidden = opts.hidden): Entry[] => {
    if (!first) return Object.values(d.entries).filter(e => travels(e, skip, hidden))
    const all = new Map<Id, Entry>([[first.id, first]])
    const queue = [first]
    while (queue.length) {
      for (const id of refsOf(queue.shift()!, opts.textLinks)) {
        const e = get(id)
        if (!all.has(id) && travels(e, skip, hidden)) { all.set(id, e); queue.push(e) }
      }
    }
    return [...all.values()]
  }
  const entries = collect(opts.skip)
  const counts: ExportPlan['counts'] = {}
  for (const e of opts.skip.length ? collect([]) : entries) counts[e.type] = (counts[e.type] ?? 0) + 1
  const ids = new Set(entries.map(e => e.id))
  const relations = d.relations.filter(r => ids.has(r.a) && ids.has(r.b) && (opts.hidden || r.visibility === 'known'))
  const hiddenCount = (opts.hidden ? entries : collect(opts.skip, true)).filter(e => e.id !== start && e.visibility !== 'known').length
  return { start: first, entries, relations, counts, hiddenCount, opts }
}

const toDataUrl = (b: Blob) => new Promise<string>((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => fail(r.error); r.readAsDataURL(b) })

/** A field value with the DM-only blocks taken out of every text in it. */
function noSecrets(v: unknown): unknown {
  if (typeof v === 'string') return hasSecrets(v) ? stripSecrets(v).replace(/\n{3,}/g, '\n\n').trim() : v
  if (Array.isArray(v)) return v.map(noSecrets)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, noSecrets(x)]))
  return v
}

/**
 * The plan's entries as they leave this world: DM-only text out unless asked, references to what doesn't go along
 * as plain words (or, for entries that stay home but aren't hidden, kept with their name in `names`).
 */
export function outgoingEntries(plan: ExportPlan): { entries: Entry[]; names: Record<Id, string> } {
  const ids = new Set(plan.entries.map(e => e.id))
  const word = (id: Id) => get(id)?.name ?? id
  /** References kept: what's in the file, and what stays home unless it's hidden and hidden ones stay out. */
  const keep = (id: Id) => ids.has(id) || (!!get(id) && (plan.opts.hidden || get(id)!.visibility === 'known'))
  const names: Record<Id, string> = {}
  const entries = plan.entries.map(e => {
    const c = clone(e)
    if (!plan.opts.dmText && hasSecrets(c.body)) c.body = stripSecrets(c.body).replace(/\n{3,}/g, '\n\n').trim()
    // so are the DM-only fields (an NPC's or organization's secret, and how it stands with the party)
    if (!plan.opts.dmText) for (const k of dmOnlyKeys(c.type)) delete (c.fields as Record<string, unknown>)[k]
    // and the DM-only blocks written into a field's text (an item's description, a feature's text)
    if (!plan.opts.dmText) c.fields = noSecrets(c.fields) as Entry['fields']
    // stats based on a creature that doesn't go along: its stats written out, so the copy is complete
    const sb = c.fields.statblock as Statblock | undefined
    if (sb?.base && !ids.has(sb.base)) { const full = { ...(statsOf(e) ?? sb) }; delete full.base; c.fields.statblock = full }
    mapRefs(c, id => { if (!keep(id)) return null; if (!ids.has(id)) names[id] = word(id); return id }, word)
    return c
  })
  return { entries, names }
}

export async function buildExport(plan: ExportPlan): Promise<{ blob: Blob; name: string }> {
  const bundle = await bundleOf(plan)
  const base = plan.start ? plan.start.name : `${db().meta.title || 'World'} (world)`
  return { blob: new Blob([JSON.stringify(bundle, null, 1)], { type: 'application/json' }), name: `${base.replace(/[\\/:*?"<>|]+/g, '')}.dndesk.json` }
}

/** What an export file holds: the plan's entries as they leave, their pictures and files, the lists they use. */
export async function bundleOf(plan: ExportPlan): Promise<Bundle> {
  const { entries, names } = outgoingEntries(plan)
  const files: Record<string, string> = {}
  const paths = [...new Set(entries.flatMap(dataPaths))]
  await stage(progress.title || 'Exporting', 'Pictures and files', paths.length)
  for (const p of paths) {
    const b = await state.storage!.readBlob(p)
    if (b) files[p] = await toDataUrl(b)
    await tick()
  }
  await stage(progress.title || 'Exporting', 'Writing the file')
  const meta = db().meta
  const bundle: Bundle = {
    format: FORMAT, version: VERSION, dataVersion: DATA_VERSION, exported: new Date().toISOString(), from: meta.title,
    main: plan.start?.id,
    entries,
    relations: plan.relations.map(r => clone(r)),
    files,
    options: plan.start ? optionsUsed(entries) : Object.fromEntries(LISTS.map(l => [l.key, listOptions(l.key)])),
    names,
    dmText: plan.opts.dmText,
    world: plan.start ? undefined : clone({ calendar: meta.calendar, eventCategories: meta.eventCategories, today: meta.today }),
  }
  return bundle
}

/** The options of every list the entries pick from (fields and sheet proficiencies), with their labels. */
function optionsUsed(entries: Entry[]): Record<string, ListOption[]> {
  const out: Record<string, ListOption[]> = {}
  const put = (key: string, id: unknown) => {
    const o = listOptions(key).find(x => x.id === id)
    if (o && !(out[key] ??= []).some(x => x.id === id)) out[key].push({ ...o })
  }
  for (const e of entries) {
    for (const f of TYPES[e.type].fields) {
      const key = listKeyOf(f)
      const v = (e.fields as Record<string, unknown>)[f.key]
      if (key && v != null) for (const id of Array.isArray(v) ? v : [v]) put(key, id)
    }
    const p = e.type === 'pc' ? e.fields.sheet?.proficiencies : undefined
    if (p) for (const l of LISTS) if (l.sheet) for (const id of p[l.sheet] ?? []) put(l.key, id)
    if (e.type === 'pc') for (const l of e.fields.classLevels ?? []) put('class', l.class)
  }
  return out
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.append(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// ---------- import ----------

export interface ImportItem {
  /** As in the file. */
  entry: Entry
  /** As it will be stored here. */
  ready: Entry
  /** The one already here that it updates. */
  here?: Entry
  status: 'new' | 'changed' | 'same'
  /** For a changed one: whether to update it (the user can keep theirs). */
  take: boolean
}

export interface ImportPlan {
  from: string
  exported: string
  /** The file's main entry (its id in the file); none for a world's file. */
  main?: Id
  items: ImportItem[]
  relations: { add: Omit<Relation, 'id'>[]; change: { id: Id; to: Omit<Relation, 'id'> }[] }
  /** Lists that change, as they'll be. */
  lists: { changed: Record<string, ListOption[]>; added: number; renamed: number }
  world?: { part: WorldPart; changed: boolean; take: boolean }
  /** Pictures and files to store: the path here, and the path in the file. */
  writes: [string, string][]
  /** What the data check found in the file: these are left out. */
  warnings: string[]
  bundle: Bundle
}

/** Which list an unknown proficiency goes to. */
const PROF_LIST = { armor: 'item.armorType', weapons: 'item.baseWeapon', languages: 'language' } as const

export interface ImportOptions {
  /**
   * Where an entry of the file goes: an entry here to update (its id), a new one (null), or as usual (undefined:
   * the same id, else the same type and name).
   */
  claim?: (e: Entry) => Id | null | undefined
}

export async function readImport(file: File, opts: ImportOptions = {}): Promise<ImportPlan> {
  let b: Bundle
  await stage(progress.title || 'Importing', 'Reading the file')
  try { b = JSON.parse(await file.text()) } catch { throw new Error(`${file.name} isn't a file this app can read.`) }
  if (b?.format !== FORMAT || !Array.isArray(b.entries)) throw new Error(`${file.name} isn't an exported file. Use a file made with Export on an entry's page, or with Settings → Export the world.`)
  if (b.version > VERSION) throw new Error(`${file.name} was made by a newer version of the app. Update this one first.`)
  const fileVersion = typeof b.dataVersion === 'number' ? b.dataVersion : 30
  if (fileVersion > DATA_VERSION) throw new Error(`${file.name} was made by a newer version of the app (data version ${fileVersion}). Update this one first.`)
  if (fileVersion < OLDEST_VERSION) throw new Error(`${file.name} is from a version of the app too old to read.`)
  const d = db()
  const warnings: string[] = []
  let known = b.entries.filter(e => isObj(e) && typeof e.id === 'string' && typeof e.name === 'string' && isObj(e.fields) && TYPES[e.type])
  // Entries saved by an older version are brought up to date first, as a world would be.
  if (fileVersion < DATA_VERSION) {
    const u = upgradeEntries(clone(known), fileVersion, isObj(b.options) ? clone(b.options) : undefined)
    known = u.entries.filter(e => TYPES[e.type])
    if (u.lists) b.options = u.lists
  }
  const ok = known.filter(canExport)
  if (known.length > ok.length) warnings.push(`${known.length - ok.length} campaign(s), session(s), encounter(s) or creature(s), which aren't shared`)
  if (b.main && !ok.some(e => e.id === b.main)) throw new Error(`${file.name} doesn't hold the entry it was exported from.`)
  if (!ok.length) throw new Error(`${file.name} holds nothing this app can import.`)
  // The data check, on the shape only (links are worked out below). A broken entry stops the import; a field
  // that's unknown or of the wrong kind is only left out.
  const found = ok.flatMap(e => checkEntry({ ...e, aliases: e.aliases ?? [], tags: e.tags ?? [], body: e.body ?? '', visibility: e.visibility ?? 'secret' }))
  const serious = found.find(p => p.serious)
  if (serious) throw new Error(`${file.name} is damaged: ${serious.where} ${serious.message}.`)
  warnings.push(...found.map(p => `${p.where} ${p.message}`))
  // Files from before version 2 carried a map as a place with only its name and picture: the rest stays as it is here.
  const mapOnly = b.version === 1 ? [...TYPES.place.fields.map(f => f.key).filter(k => k !== 'map'), 'body'] : []

  // ---- where each entry ends up: the same one here (by id, else by type and name), else a new id ----
  const map = new Map<Id, Id>()
  const here = new Map<Id, Entry>()
  const claimed = new Set<Id>()
  const claim = (e: Entry, h: Entry) => { map.set(e.id, h.id); here.set(e.id, h); claimed.add(h.id) }
  const fresh = new Set<Id>()
  for (const e of ok) {
    const c = opts.claim?.(e)
    if (c === null) fresh.add(e.id)
    else if (c && d.entries[c]?.type === e.type && !claimed.has(c)) claim(e, d.entries[c])
  }
  for (const e of ok) { const h = d.entries[e.id]; if (!map.has(e.id) && !fresh.has(e.id) && h && h.type === e.type && !claimed.has(h.id)) claim(e, h) }
  for (const e of ok) {
    if (map.has(e.id) || fresh.has(e.id)) continue
    const same = Object.values(d.entries).filter(h => h.type === e.type && !claimed.has(h.id))
    const h = same.find(h => norm(h.name) === norm(e.name)) ?? same.find(h => h.aliases.some(a => norm(a) === norm(e.name)))
    if (h) claim(e, h)
  }
  const taken = new Set<Id>()
  for (const e of ok) {
    if (map.has(e.id)) continue
    let id = e.id
    if (d.entries[id] || taken.has(id) || /[[\]|\\/#?]/.test(id) || id.length > 120) {
      id = newId(e.name)
      for (let i = 2; taken.has(id); i++) id = newId(`${e.name} ${i}`)
    }
    taken.add(id); map.set(e.id, id)
  }

  // ---- the choices, as this world's options ----
  const work = new Map<string, ListOption[]>()
  const changedLists = new Set<string>()
  const optIds = new Map<string, Map<string, string>>()
  let added = 0, renamed = 0
  const listOf = (key: string) => { let l = work.get(key); if (!l) { l = listOptions(key).map(o => ({ ...o })); work.set(key, l) } return l }
  const fileLabel = (key: string, id: string): string | undefined => {
    const l = isObj(b.options) ? b.options[key] : undefined
    return Array.isArray(l) ? l.find(o => o?.id === id)?.label : undefined
  }
  /** A choice from the file as this world's option: same id, else same label, else a new option. */
  function opt(key: string, id: string): string {
    const m = optIds.get(key) ?? new Map<string, string>()
    optIds.set(key, m)
    if (m.has(id)) return m.get(id)!
    const l = listOf(key)
    const label = String(fileLabel(key, id) ?? id).trim() || id
    let out = id
    const same = l.find(o => o.id === id)
    if (same) {
      // From a world's file, its names win: a renamed option is renamed here too.
      if (b.world && same.label !== label && !l.some(o => o !== same && norm(o.label) === norm(label))) { same.label = label; renamed++; changedLists.add(key) }
    } else {
      const byLabel = l.find(o => norm(o.label) === norm(label))
      if (byLabel) out = byLabel.id
      else {
        for (let i = 2; l.some(o => o.id === out); i++) out = `${id} ${i}`
        l.push({ id: out, label }); added++; changedLists.add(key)
      }
    }
    m.set(id, out)
    return out
  }
  const prof = (k: keyof typeof PROF_LIST, id: string) => {
    const key = LISTS.find(l => l.sheet === k && fileLabel(l.key, id) != null)?.key
      ?? LISTS.find(l => l.sheet === k && listOptions(l.key).some(o => o.id === id))?.key
      ?? PROF_LIST[k]
    return opt(key, id)
  }
  for (const [key, list] of Object.entries(isObj(b.options) ? b.options : {})) {
    if (LIST_BY_KEY.has(key) && Array.isArray(list)) for (const o of list) if (isObj(o) && typeof o.id === 'string' && typeof o.label === 'string') opt(key, o.id)
  }

  // ---- pictures and files: an identical one already here is used ----
  const paths = new Map<string, string>()
  const writes: [string, string][] = []
  const used = new Set(ok.flatMap(dataPaths))
  const dirs = new Map<string, Set<string>>()
  const reserved = new Set<string>()
  const fileList = Object.entries(isObj(b.files) ? b.files : {})
  await stage(progress.title || 'Importing', 'Comparing pictures and files', fileList.length)
  for (const [path, url] of fileList) {
    await tick()
    if (!used.has(path) || !SAFE_PATH.test(path) || typeof url !== 'string' || !url.startsWith('data:')) continue
    const p = await placeFile(path, await (await fetch(url)).blob(), dirs, reserved)
    paths.set(path, p.path)
    if (p.write) writes.push([p.path, path])
  }

  // ---- each entry as it will be stored ----
  const now = new Date().toISOString()
  const items: ImportItem[] = ok.map(e => {
    const h = here.get(e.id)
    const c = clone(e)
    c.id = map.get(e.id)!
    c.aliases = Array.isArray(c.aliases) ? c.aliases.filter(a => typeof a === 'string') : []
    c.tags = Array.isArray(c.tags) ? c.tags.filter(a => typeof a === 'string') : []
    c.body = typeof c.body === 'string' ? c.body : ''
    c.visibility = c.visibility === 'known' ? 'known' : 'secret'
    // Only the fields this app knows, with values of the right kind, and choices as this world's options.
    const fields = c.fields as Record<string, unknown>
    // A character from before multiclassing: its class text becomes class lines.
    if (c.type === 'pc' && typeof fields.class === 'string') {
      if (fields.class.trim() && !Array.isArray(fields.classLevels)) { fields.classLevels = parseClassText(fields.class, fields.level, n => opt('class', n)); delete fields.level }
      delete fields.class
    }
    for (const [k, v] of Object.entries(fields)) {
      const f = TYPES[c.type].fields.find(x => x.key === k)
      if (!f || checkField(f, v)) { delete fields[k]; continue }
      const key = listKeyOf(f)
      if (key) fields[k] = Array.isArray(v) ? v.map(x => opt(key, String(x))) : opt(key, String(v))
    }
    // References to the file's entries go to where they land; to anything else, to the same entry here if there is one.
    const lost = mapRefs(c, id => map.get(id) ?? (d.entries[id] ? id : null), id => (typeof b.names?.[id] === 'string' ? b.names[id] : id.replace(/-/g, ' ')))
    if (c.type === 'pc' && Array.isArray(c.fields.classLevels)) c.fields.classLevels = c.fields.classLevels.map(l => ({ ...l, class: opt('class', String(l.class)) }))
    const p = c.type === 'pc' ? c.fields.sheet?.proficiencies : undefined
    if (p) for (const k of ['armor', 'weapons', 'languages'] as const) if (Array.isArray(p[k])) p[k] = [...new Set(p[k].map(id => prof(k, String(id))))]
    // Pictures and files at their path here.
    for (const k of imageKeys(c.type)) if (typeof fields[k] === 'string') { const to = paths.get(fields[k] as string); if (to) fields[k] = to; else delete fields[k] }
    c.body = c.body.replace(DATA_PATH, (all, path: string) => { const to = paths.get(decodeURI(path)); return to ? all.replace(path, encodeURI(to)) : all })
    if (c.image) c.image = paths.get(c.image)
    if (!c.image) delete c.image
    if (Array.isArray(c.files)) c.files = c.files.map(f => paths.get(f)).filter((f): f is string => !!f)
    if (!c.files?.length) delete c.files
    if (h) {
      // What the file couldn't carry stays as it is here.
      for (const k of [...lost, ...(c.type === 'place' ? mapOnly : [])]) {
        if (k === 'body') c.body = h.body
        else if ((h.fields as Record<string, unknown>)[k] != null) fields[k] = clone((h.fields as Record<string, unknown>)[k])
        else delete fields[k]
      }
      // A file without the DM-only text never wipes it out here.
      if (b.dmText === false && hasSecrets(h.body)) c.body = h.body
      if (b.dmText === false) for (const k of dmOnlyKeys(c.type)) { const v = (h.fields as Record<string, unknown>)[k]; if (v != null) fields[k] = clone(v) }
      c.created = h.created
    } else c.created = typeof e.created === 'string' ? e.created : now
    c.updated = now
    const status: ImportItem['status'] = !h ? 'new' : stable(content(c)) === stable(content(h)) ? 'same' : 'changed'
    if (h && status === 'same') c.updated = h.updated
    return { entry: e, ready: c, here: h, status, take: true }
  })

  // ---- connections between the entries: matched by their two ends and kind ----
  const relations: ImportPlan['relations'] = { add: [], change: [] }
  for (const r of Array.isArray(b.relations) ? b.relations : []) {
    if (!isObj(r) || typeof r.a !== 'string' || typeof r.b !== 'string' || !(r.kind in RELATION_KINDS)) continue
    // an end that isn't in the file may be an entry this world has (a player's character's relation to what the DM shared)
    const a = map.get(r.a) ?? (d.entries[r.a] ? r.a : undefined), bb = map.get(r.b) ?? (d.entries[r.b] ? r.b : undefined)
    if (!a || !bb) continue
    const to: Omit<Relation, 'id'> = { a, b: bb, kind: r.kind, visibility: r.visibility === 'known' ? 'known' : 'secret' }
    for (const k of ['role', 'note'] as const) if (typeof r[k] === 'string' && r[k]) to[k] = r[k]
    for (const k of ['from', 'to'] as const) if (isObj(r[k]) && typeof r[k]!.year === 'number') to[k] = r[k]
    const mine = d.relations.find(x => x.a === a && x.b === bb && x.kind === r.kind)
    if (!mine) relations.add.push(to)
    else { const { id, ...rest } = mine; if (stable(rest) !== stable(to)) relations.change.push({ id, to }) }
  }

  // ---- the calendar and today's date, from a world's file ----
  let world: ImportPlan['world']
  const w = b.world
  if (isObj(w) && isObj(w.calendar) && Array.isArray(w.calendar.months) && isObj(w.today) && typeof w.today.year === 'number') {
    const part: WorldPart = { calendar: w.calendar, eventCategories: Array.isArray(w.eventCategories) ? w.eventCategories : d.meta.eventCategories, today: w.today }
    const changed = stable(part) !== stable({ calendar: d.meta.calendar, eventCategories: d.meta.eventCategories, today: d.meta.today })
    world = { part, changed, take: changed }
  }

  return {
    from: String(b.from ?? ''), exported: String(b.exported ?? ''), main: b.main,
    items, relations, world, writes, warnings,
    lists: { changed: Object.fromEntries([...changedLists].map(k => [k, work.get(k)!])), added, renamed },
    bundle: b,
  }
}

/** What's compared to tell whether an entry changes. */
const content = (e: Entry) => ({ type: e.type, name: e.name, aliases: e.aliases, tags: e.tags, fields: e.fields, body: e.body, visibility: e.visibility, image: e.image ?? null, files: e.files?.length ? e.files : null })

/** Whether importing the plan would change anything. */
export const importChanges = (p: ImportPlan) =>
  p.items.some(i => i.status === 'new' || (i.status === 'changed' && i.take)) || p.relations.add.length + p.relations.change.length > 0
  || Object.keys(p.lists.changed).length > 0 || !!p.world?.take

/** Bring the file's contents into this world. Returns the id of the main entry here, if the file has one. */
export async function applyImport(plan: ImportPlan): Promise<Id | undefined> {
  const d = db()
  const b = plan.bundle
  const items = plan.items.filter(i => i.status === 'new' || (i.status === 'changed' && i.take))
  // Pictures and files first (nothing in the data changes until they're stored).
  const need = new Set(items.flatMap(i => dataPaths(i.ready)))
  const writes = plan.writes.filter(([to]) => need.has(to))
  await stage(progress.title || 'Importing', 'Storing pictures and files', writes.length)
  for (const [to, from] of writes) { await state.storage!.writeBlob(to, await (await fetch(b.files[from])).blob()); await tick() }
  await stage(progress.title || 'Importing', `Adding ${items.length} entries`)
  for (const [key, list] of Object.entries(plan.lists.changed)) setList(key, clone(list))
  for (const i of items) d.entries[i.ready.id] = clone(i.ready)
  for (const r of plan.relations.add) Object.assign(addRelation(r.a, r.b, r.kind), clone(r))
  for (const { id, to } of plan.relations.change) {
    const mine = d.relations.find(x => x.id === id)
    if (mine) { for (const k of ['role', 'note', 'from', 'to'] as const) delete mine[k]; Object.assign(mine, clone(to)) }
  }
  if (plan.world?.take) Object.assign(d.meta, clone(plan.world.part))
  touch()
  return plan.items.find(i => i.entry.id === plan.main)?.ready.id
}

/**
 * Where an imported picture or file goes: an identical file already in the folder is reused, otherwise a free
 * name (written on import).
 */
async function placeFile(path: string, blob: Blob, dirs: Map<string, Set<string>>, reserved: Set<string>): Promise<{ path: string; write: boolean }> {
  const s = state.storage!
  const slash = path.indexOf('/')
  const dir = path.slice(0, slash), file = path.slice(slash + 1).replace(/[\\/:*?"<>|]+/g, '')
  let names = dirs.get(dir)
  if (!names) { names = new Set(await s.list(dir)); dirs.set(dir, names) }
  const dot = file.lastIndexOf('.')
  const base = dot > 0 ? file.slice(0, dot) : file, ext = dot > 0 ? file.slice(dot) : ''
  for (let name = file, i = 2; ; name = `${base} ${i++}${ext}`) {
    const p = `${dir}/${name}`
    if (reserved.has(p)) continue
    if (!names.has(name)) { reserved.add(p); return { path: p, write: true } }
    const have = await s.readBlob(p)
    if (have && have.size === blob.size && await sameBytes(have, blob)) return { path: p, write: false }
  }
}
async function sameBytes(a: Blob, b: Blob) {
  const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()])
  const u = new Uint8Array(x), v = new Uint8Array(y)
  for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return false
  return true
}
