// Sharing spells, items and maps with someone else who has this app: one entry saved as a file they can import.
//
// - A spell or item travels with what it needs to work: a recipe's ingredients (and theirs), a scroll's spell,
//   and the spells an item's text links to. Other links in the text become plain words.
// - A map travels as a place with only its name and map picture (no text, pins or "Located in").
// Relations never travel.
import type { Entry, Id } from './model/types'
import { db, get, state, touch } from './store'
import { newId } from './edit'

export const FORMAT = 'dndesk-export'
/** Files exported before the app was renamed. */
const OLD_FORMAT = 'eldoria-export'

interface Bundle {
  format: typeof FORMAT | typeof OLD_FORMAT
  version: 1
  exported: string
  /** The world it came from, for the import preview. */
  from: string
  /** The exported entry; the other entries came along because it needs them. */
  main: Id
  entries: Entry[]
  /** Pictures and attached files, as data: URLs, by their path in the data folder. */
  files: Record<string, string>
}

/** Spells, items, and places with a map can be exported. */
export const canExport = (e: Entry) => e.type === 'spell' || e.type === 'item' || (e.type === 'place' && !!e.fields.map)

const LINK = /\[\[([^\]|\\]+)((?:\\?\|)[^\]]*)?\]\]/g
const DATA_PATH = /\]\(<?((?:images|files)\/[^)>]+)>?\)/g
const stripSecrets = (body: string) => body.replace(/^:::secret\s*\n[\s\S]*?\n:::\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim()

/** What an item needs to work: recipe ingredients, a scroll's spell, spells linked in its text. */
function partsOf(e: Entry): Id[] {
  if (e.type !== 'item') return []
  const f = e.fields
  const ids: Id[] = []
  if (Array.isArray(f.recipe)) ids.push(...(f.recipe as { item?: Id }[]).map(l => l.item!).filter(Boolean))
  if (typeof f.spell === 'string' && f.spell) ids.push(f.spell)
  for (const m of e.body.matchAll(LINK)) if (get(m[1].trim())?.type === 'spell') ids.push(m[1].trim())
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

// ---------- export ----------

export interface ExportPlan {
  main: Entry
  /** Entries that come along because the main one needs them. */
  parts: Entry[]
  files: string[]
  hasSecrets: boolean
}

export function planExport(id: Id): ExportPlan | null {
  const main = get(id)
  if (!main || !canExport(main)) return null
  if (main.type === 'place') return { main, parts: [], files: [main.fields.map as string], hasSecrets: false }
  const all = new Map([[main.id, main]])
  const queue = [main]
  while (queue.length) {
    for (const pid of partsOf(queue.shift()!)) {
      const p = get(pid)
      if (p && !all.has(pid)) { all.set(pid, p); queue.push(p) }
    }
  }
  const list = [...all.values()]
  return {
    main,
    parts: list.slice(1),
    files: [...new Set(list.flatMap(dataPaths))],
    hasSecrets: list.some(e => /^:::secret/m.test(e.body)),
  }
}

/** The copy of an entry that goes into the file. Links to entries that don't come along become plain words. */
function exportCopy(e: Entry, inFile: Set<Id>, secrets: boolean): Entry {
  const c = JSON.parse(JSON.stringify(e)) as Entry
  if (c.type === 'place') {
    return { id: c.id, type: 'place', name: c.name, aliases: [], tags: [], fields: { map: c.fields.map }, body: '', visibility: c.visibility, created: c.created, updated: c.updated }
  }
  if (!secrets) c.body = stripSecrets(c.body)
  c.body = c.body.replace(LINK, (all, ref: string, label?: string) =>
    inFile.has(ref.trim()) ? all : label ? label.replace(/^\\?\|/, '') : (get(ref.trim())?.name ?? ref))
  if (typeof c.fields.spell === 'string' && !inFile.has(c.fields.spell)) delete c.fields.spell
  if (Array.isArray(c.fields.recipe)) c.fields.recipe = (c.fields.recipe as { item: Id }[]).filter(l => inFile.has(l.item))
  return c
}

const toDataUrl = (b: Blob) => new Promise<string>((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => fail(r.error); r.readAsDataURL(b) })

export async function buildExport(plan: ExportPlan, opts: { secrets: boolean }): Promise<{ blob: Blob; name: string }> {
  const list = [plan.main, ...plan.parts]
  const ids = new Set(list.map(e => e.id))
  const files: Record<string, string> = {}
  for (const p of plan.files) {
    const b = await state.storage!.readBlob(p)
    if (b) files[p] = await toDataUrl(b)
  }
  const bundle: Bundle = {
    format: FORMAT, version: 1, exported: new Date().toISOString(), from: db().meta.title,
    main: plan.main.id,
    entries: list.map(e => exportCopy(e, ids, opts.secrets)),
    files,
  }
  const name = `${plan.main.name.replace(/[\\/:*?"<>|]+/g, '')}.dndesk.json`
  return { blob: new Blob([JSON.stringify(bundle, null, 1)], { type: 'application/json' }), name }
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.append(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// ---------- import ----------

export interface ImportPlan {
  from: string
  exported: string
  main: Entry
  /** The same entry already here (same type and name): the user keeps it or replaces it. */
  existing?: Entry
  replace: boolean
  /** The entries that came along, and whether this world already has each one (then that one is used). */
  parts: { entry: Entry; here?: Entry }[]
  bundle: Bundle
}

const norm = (s: string) => s.trim().toLowerCase()
function findHere(type: Entry['type'], name: string): Entry | undefined {
  const list = Object.values(db().entries).filter(e => e.type === type)
  return list.find(e => norm(e.name) === norm(name)) ?? list.find(e => e.aliases.some(a => norm(a) === norm(name)))
}

export async function readImport(file: File): Promise<ImportPlan> {
  let b: Bundle
  try { b = JSON.parse(await file.text()) } catch { throw new Error(`${file.name} isn't a file this app can read.`) }
  if ((b?.format !== FORMAT && b?.format !== OLD_FORMAT) || !Array.isArray(b.entries)) throw new Error(`${file.name} isn't an exported spell, item or map. Use a file made with ⇩ Export on an entry's page.`)
  if (b.version > 1) throw new Error(`${file.name} was made by a newer version of the app. Update this one first.`)
  const ok = b.entries.filter(e => e?.id && typeof e.name === 'string' && e.fields && canExport(e))
  const main = ok.find(e => e.id === b.main)
  if (!main) throw new Error(`${file.name} doesn't hold a spell, item or map.`)
  return {
    from: b.from, exported: b.exported, main,
    existing: findHere(main.type, main.name), replace: false,
    parts: ok.filter(e => e !== main).map(e => ({ entry: e, here: findHere(e.type, e.name) })),
    bundle: b,
  }
}

/** Add the file's contents to this world. Returns the id of the imported (or kept) entry. */
export async function applyImport(plan: ImportPlan): Promise<Id> {
  const d = db()
  const b = plan.bundle
  if (plan.existing && !plan.replace) return plan.existing.id

  // Where each id from the file ends up here.
  const map = new Map<Id, Id>()
  const incoming: { e: Entry; id: Id }[] = []
  const taken = new Set<Id>()
  const add = (e: Entry, id: Id) => { map.set(e.id, id); taken.add(id); incoming.push({ e, id }) }
  const freeId = (name: string) => { let id = newId(name); for (let i = 2; taken.has(id); i++) id = newId(`${name} ${i}`); return id }
  add(plan.main, plan.existing ? plan.existing.id : freeId(plan.main.name))
  for (const p of plan.parts) {
    if (p.here) map.set(p.entry.id, p.here.id)
    else add(p.entry, freeId(p.entry.name))
  }

  // Pictures and files first (nothing in the data changes until they're stored).
  // Only paths inside the data folder, and only data carried in the file itself (never fetched from elsewhere).
  const paths = new Map<string, string>()
  const used = new Set(incoming.flatMap(({ e }) => dataPaths(e)))
  for (const [path, url] of Object.entries(b.files ?? {})) {
    if (!used.has(path) || !/^(images|files)\/[^/]+$/.test(path) || !String(url).startsWith('data:')) continue
    paths.set(path, await storeFile(path, await (await fetch(url)).blob()))
  }

  const now = new Date().toISOString()
  for (const { e, id } of incoming) {
    const c = JSON.parse(JSON.stringify(e)) as Entry
    const mine = d.entries[id]
    if (c.type === 'place') {
      // A map: a place with only its name and picture. Replacing keeps the place's own text, pins and
      // "Located in", and only swaps the map picture.
      const pic = paths.get(String(c.fields.map ?? ''))
      if (mine) { if (pic) mine.fields.map = pic; mine.updated = now; continue }
      d.entries[id] = { id, type: 'place', name: c.name, aliases: [], tags: [], fields: pic ? { map: pic } : {}, body: '', visibility: 'secret', created: now, updated: now }
      continue
    }
    c.id = id
    c.aliases ??= []; c.tags ??= []; c.body ??= ''; c.visibility ??= 'secret'
    c.created = mine?.created ?? now
    c.updated = now
    if (typeof c.fields.spell === 'string') { const to = map.get(c.fields.spell); if (to) c.fields.spell = to; else delete c.fields.spell }
    if (Array.isArray(c.fields.recipe)) c.fields.recipe = (c.fields.recipe as { item: Id }[]).flatMap(l => (map.has(l.item) ? [{ ...l, item: map.get(l.item)! }] : []))
    c.body = c.body.replace(LINK, (_all, ref: string, label?: string) => {
      const to = map.get(ref.trim())
      return to ? `[[${to}${label ?? ''}]]` : label ? label.replace(/^\\?\|/, '') : ref
    }).replace(DATA_PATH, (all, p: string) => { const to = paths.get(decodeURI(p)); return to ? all.replace(p, encodeURI(to)) : all })
    if (c.image) c.image = paths.get(c.image)
    if (!c.image) delete c.image
    if (c.files) c.files = c.files.map(f => paths.get(f)).filter((f): f is string => !!f)
    d.entries[id] = c
  }
  touch()
  return map.get(plan.main.id)!
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
