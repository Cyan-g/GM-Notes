// Sharing single entries between worlds: a spell, an item, an NPC … saved as one file that another copy of the
// app can import as it is.
//
// The file holds the entry, the entries it can't work without (a potion's ingredients, an encounter's creatures,
// a scroll's spell), its pictures and attached files, its relations, and the name and type of everything else it
// links to. On import, those links are reconnected to entries of the same type and name; what isn't there is left out.
import type { Entry, Id, Relation } from './model/types'
import { SCHEMA, type FieldDef } from './model/schema'
import { db, get, state, touch } from './store'
import { newId } from './edit'

export const FORMAT = 'eldoria-export'

interface Bundle {
  format: typeof FORMAT
  version: 1
  exported: string
  /** The world it came from, for the import preview. */
  from: string
  /** The entries that were exported; the rest of `entries` came along as parts. */
  main: Id[]
  entries: Entry[]
  relations: Relation[]
  /** Everything linked to that isn't in the file: matched by type and name on import. */
  refs: Record<Id, { name: string; type: Entry['type'] }>
  /** Pictures and attached files, as data: URLs, by their path in the data folder. */
  files: Record<string, string>
}

// ---------- where entries point at other entries ----------

const fieldDefs = (e: Entry): FieldDef[] => SCHEMA.find(s => s.type === e.type)?.fields ?? []
const REF_KINDS = ['ref', 'refs', 'recipe', 'stock', 'combatants', 'pins']
/** The key inside a line that points at an entry, for fields that are lists of lines. */
const LINE_KEY: Record<string, string> = { recipe: 'item', stock: 'item', combatants: 'creature', pins: 'entry' }
/** Line kinds that make no sense without their entry (a pin or a combatant keeps its label instead). */
const LINE_NEEDS_ENTRY = ['recipe', 'stock']
const LINK = /\[\[([^\]|\\]+)((?:\\?\|)[^\]]*)?\]\]/g
const DATA_PATH = /\]\((?:<)?((?:images|files)\/[^)>]+)(?:>)?\)/g

/** Every entry id an entry points at: in its fields and in its text. */
function pointsAt(e: Entry): Id[] {
  const out: Id[] = []
  for (const f of fieldDefs(e)) {
    const v = e.fields[f.key]
    if (!REF_KINDS.includes(f.kind) || v == null) continue
    if (f.kind === 'ref' && typeof v === 'string') out.push(v)
    else if (f.kind === 'refs' && Array.isArray(v)) out.push(...v.filter(x => typeof x === 'string'))
    else if (Array.isArray(v)) for (const line of v) { const id = line?.[LINE_KEY[f.kind]]; if (typeof id === 'string') out.push(id) }
  }
  for (const m of e.body.matchAll(LINK)) out.push(m[1].trim())
  return out
}

/** The entries an entry can't work without, so they travel with it. */
function partsOf(e: Entry): Id[] {
  const f = e.fields
  const ids: Id[] = []
  if (Array.isArray(f.recipe)) ids.push(...(f.recipe as { item?: Id }[]).map(l => l.item!).filter(Boolean))
  if (Array.isArray(f.creatures)) ids.push(...(f.creatures as { creature?: Id }[]).map(l => l.creature!).filter(Boolean))
  if (e.type === 'item' && typeof f.spell === 'string') ids.push(f.spell)
  return ids
}

/** Paths of the pictures and files an entry uses. */
function dataPaths(e: Entry): string[] {
  const out = new Set<string>()
  if (e.image) out.add(e.image)
  if (typeof e.fields.map === 'string' && e.fields.map) out.add(e.fields.map)
  for (const f of e.files ?? []) out.add(f)
  for (const m of e.body.matchAll(DATA_PATH)) out.add(decodeURI(m[1]))
  return [...out]
}

const stripSecrets = (body: string) => body.replace(/^:::secret\s*\n[\s\S]*?\n:::\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim()

// ---------- export ----------

export interface ExportPlan {
  main: Entry[]
  /** Entries that come along because the main ones need them. */
  parts: Entry[]
  /** Linked entries that stay behind (matched by name on import). */
  linked: Entry[]
  files: string[]
  hasSecrets: boolean
}

export function planExport(ids: Id[]): ExportPlan {
  const main = ids.map(id => get(id)).filter((e): e is Entry => !!e)
  const all = new Map(main.map(e => [e.id, e]))
  // Parts of parts too (an ingredient that is itself brewed), but nothing else.
  const queue = [...main]
  while (queue.length) {
    for (const id of partsOf(queue.shift()!)) {
      const p = get(id)
      if (p && !all.has(id)) { all.set(id, p); queue.push(p) }
    }
  }
  const inFile = [...all.values()]
  const linked = new Map<Id, Entry>()
  const consider = (id: Id) => { const x = get(id); if (x && !all.has(id)) linked.set(id, x) }
  for (const e of inFile) pointsAt(e).forEach(consider)
  for (const r of db().relations) if (all.has(r.a) || all.has(r.b)) { consider(r.a); consider(r.b) }
  return {
    main,
    parts: inFile.filter(e => !ids.includes(e.id)),
    linked: [...linked.values()].sort((a, b) => a.name.localeCompare(b.name)),
    files: [...new Set(inFile.flatMap(dataPaths))],
    hasSecrets: inFile.some(e => /^:::secret/m.test(e.body)),
  }
}

const toDataUrl = (b: Blob) => new Promise<string>((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => fail(r.error); r.readAsDataURL(b) })

export async function buildExport(plan: ExportPlan, opts: { secrets: boolean }): Promise<{ blob: Blob; name: string }> {
  const inFile = [...plan.main, ...plan.parts]
  const ids = new Set(inFile.map(e => e.id))
  const entries = inFile.map(e => {
    const c = JSON.parse(JSON.stringify(e)) as Entry
    if (!opts.secrets) c.body = stripSecrets(c.body)
    return c
  })
  const files: Record<string, string> = {}
  for (const p of plan.files) {
    const b = await state.storage!.readBlob(p)
    if (b) files[p] = await toDataUrl(b)
  }
  const bundle: Bundle = {
    format: FORMAT, version: 1, exported: new Date().toISOString(), from: db().meta.title,
    main: plan.main.map(e => e.id),
    entries,
    relations: db().relations.filter(r => ids.has(r.a) || ids.has(r.b)).map(r => ({ ...r })),
    refs: Object.fromEntries(plan.linked.map(e => [e.id, { name: e.name, type: e.type }])),
    files,
  }
  const first = plan.main[0]?.name ?? 'export'
  const name = `${(plan.main.length > 1 ? `${first} and ${plan.main.length - 1} more` : first).replace(/[\\/:*?"<>|]+/g, '')}.eldoria.json`
  return { blob: new Blob([JSON.stringify(bundle, null, 1)], { type: 'application/json' }), name }
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.append(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// ---------- import ----------

/** What to do with an entry from the file that this world already has (same type and name). */
export type Clash = 'keep' | 'replace' | 'copy'

export interface ImportItem {
  entry: Entry
  main: boolean
  /** The entry here with the same type and name, if any. */
  existing?: Entry
  action: Clash
}
export interface ImportPlan {
  from: string
  exported: string
  items: ImportItem[]
  /** Links to entries that weren't in the file: found here, or left out. */
  found: { name: string; type: Entry['type']; here: Entry }[]
  missing: { name: string; type: Entry['type'] }[]
  bundle: Bundle
}

const norm = (s: string) => s.trim().toLowerCase()
function findHere(type: Entry['type'], name: string, id?: Id): Entry | undefined {
  const same = id ? get(id) : undefined
  if (same && same.type === type && norm(same.name) === norm(name)) return same
  const list = Object.values(db().entries).filter(e => e.type === type)
  return list.find(e => norm(e.name) === norm(name)) ?? list.find(e => e.aliases.some(a => norm(a) === norm(name)))
}

export async function readImport(file: File): Promise<ImportPlan> {
  let b: Bundle
  try { b = JSON.parse(await file.text()) } catch { throw new Error(`${file.name} isn't a file this app can read.`) }
  if (b?.format !== FORMAT || !Array.isArray(b.entries)) throw new Error(`${file.name} isn't an exported entry. Use a file made with Export on an entry's page.`)
  if (b.version > 1) throw new Error(`${file.name} was made by a newer version of the app. Update this one first.`)
  const known = new Set(SCHEMA.map(s => s.type))
  const items: ImportItem[] = b.entries.filter(e => e?.id && known.has(e.type) && typeof e.name === 'string').map(e => {
    const existing = findHere(e.type, e.name, e.id)
    return { entry: e, main: b.main.includes(e.id), existing, action: existing ? 'keep' : 'copy' }
  })
  const found: ImportPlan['found'] = [], missing: ImportPlan['missing'] = []
  for (const [id, r] of Object.entries(b.refs ?? {})) {
    const here = findHere(r.type, r.name, id)
    if (here) found.push({ ...r, here }); else missing.push(r)
  }
  return { from: b.from, exported: b.exported, items, found, missing, bundle: b }
}

/** Add the file's contents to this world. Returns the id of the (first) main entry. */
export async function applyImport(plan: ImportPlan): Promise<Id | undefined> {
  const d = db()
  const b = plan.bundle
  // Where each id from the file ends up here; ids missing from the map are left out.
  const map = new Map<Id, Id>()
  for (const [id, r] of Object.entries(b.refs ?? {})) { const here = findHere(r.type, r.name, id); if (here) map.set(id, here.id) }
  const incoming: { e: Entry; id: Id }[] = []
  const taken = new Set<Id>()
  for (const it of plan.items) {
    if (it.existing && it.action === 'keep') { map.set(it.entry.id, it.existing.id); continue }
    let id = it.existing && it.action === 'replace' ? it.existing.id : newId(it.entry.name)
    for (let i = 2; taken.has(id); i++) id = newId(`${it.entry.name} ${i}`)
    taken.add(id)
    map.set(it.entry.id, id)
    incoming.push({ e: it.entry, id })
  }

  // Pictures and files first (nothing in the data changes until they're stored):
  // an identical one already here is reused, otherwise it's stored under a free name.
  const paths = new Map<string, string>()
  const used = new Set(incoming.flatMap(({ e }) => dataPaths(e)))
  for (const [path, url] of Object.entries(b.files ?? {})) {
    // Only paths inside the data folder, and only data carried in the file itself (never fetched from elsewhere).
    if (!used.has(path) || !/^(images|files)\/[^/]+$/.test(path) || !String(url).startsWith('data:')) continue
    const blob = await (await fetch(url)).blob()
    paths.set(path, await storeFile(path, blob))
  }

  const now = new Date().toISOString()
  for (const { e, id } of incoming) {
    const c = JSON.parse(JSON.stringify(e)) as Entry
    c.id = id
    c.aliases ??= []; c.tags ??= []; c.fields ??= {}; c.body ??= ''; c.visibility ??= 'secret'; c.created ??= now
    c.updated = now
    c.fields = remapFields(c, map)
    c.body = c.body.replace(LINK, (all, ref: string, label?: string) => {
      const to = map.get(ref.trim())
      if (to) return `[[${to}${label ?? ''}]]`
      return label ? label.replace(/^\\?\|/, '') : (b.refs?.[ref.trim()]?.name ?? ref)
    }).replace(DATA_PATH, (all, p: string) => { const to = paths.get(decodeURI(p)); return to ? all.replace(p, encodeURI(to)) : all })
    if (c.image) c.image = paths.get(c.image)
    if (typeof c.fields.map === 'string') c.fields.map = paths.get(c.fields.map) ?? ''
    if (c.files) c.files = c.files.map(f => paths.get(f)).filter((f): f is string => !!f)
    if (!c.image) delete c.image
    if (!c.fields.map) delete c.fields.map
    d.entries[id] = c
  }

  // Relations: both ends must be here now, and the same connection isn't added twice.
  // A replaced entry keeps its own relations; the file's are added next to them.
  const newIds = new Set(incoming.map(x => x.id))
  for (const r of b.relations ?? []) {
    const a = map.get(r.a), bb = map.get(r.b)
    if (!a || !bb || (!newIds.has(a) && !newIds.has(bb))) continue
    if (d.relations.some(x => x.a === a && x.b === bb && x.kind === r.kind)) continue
    let rid: string, n = 0
    do rid = `r${Date.now().toString(36)}i${(n++).toString(36)}`
    while (d.relations.some(x => x.id === rid))
    d.relations.push({ ...r, id: rid, a, b: bb })
  }
  touch()
  const first = b.main.find(id => map.has(id))
  return first ? map.get(first) : undefined
}

function remapFields(e: Entry, map: Map<Id, Id>): Record<string, unknown> {
  const out = { ...e.fields }
  for (const f of fieldDefs(e)) {
    const v = out[f.key]
    if (!REF_KINDS.includes(f.kind) || v == null) continue
    if (f.kind === 'ref') { const to = typeof v === 'string' ? map.get(v) : undefined; if (to) out[f.key] = to; else delete out[f.key]; continue }
    if (!Array.isArray(v)) { delete out[f.key]; continue }
    if (f.kind === 'refs') { out[f.key] = v.map(x => map.get(x)).filter(Boolean); continue }
    const key = LINE_KEY[f.kind]
    out[f.key] = v.flatMap(line => {
      const id = line?.[key]
      if (id == null) return [line]
      const to = map.get(id)
      if (to) return [{ ...line, [key]: to }]
      if (LINE_NEEDS_ENTRY.includes(f.kind)) return []
      const { [key]: _gone, ...rest } = line
      return [rest]
    })
  }
  return out
}

/** Store an imported picture or file. An identical file already in the folder is reused. */
async function storeFile(path: string, blob: Blob): Promise<string> {
  const s = state.storage!
  const slash = path.indexOf('/')
  const dir = path.slice(0, slash), file = path.slice(slash + 1).replace(/[\\/:*?"<>|]+/g, '')
  const names = new Set(await s.list(dir))
  const dot = file.lastIndexOf('.')
  const base = dot > 0 ? file.slice(0, dot) : file, ext = dot > 0 ? file.slice(dot) : ''
  let name = file, i = 2
  while (names.has(name)) {
    const have = await s.readBlob(`${dir}/${name}`)
    if (have && have.size === blob.size && await sameBytes(have, blob)) return `${dir}/${name}`
    name = `${base} ${i++}${ext}`
  }
  await s.writeBlob(`${dir}/${name}`, blob)
  return `${dir}/${name}`
}
async function sameBytes(a: Blob, b: Blob) {
  const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()])
  const u = new Uint8Array(x), v = new Uint8Array(y)
  for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return false
  return true
}
