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
        known: [],
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
  // Version 5: one name per tool. "Alchemy Kit" was the old name for Alchemist's Supplies.
  if ((d.version ?? 1) < 5) {
    const RENAME: Record<string, string> = { 'Alchemy Kit': "Alchemist's Supplies" }
    for (const e of Object.values(d.entries)) {
      const t = e.fields.craftingType as string | undefined
      if (t && RENAME[t]) e.fields.craftingType = RENAME[t]
    }
    if (d.crafting) d.crafting.tools = [...new Set(d.crafting.tools.map(t => RENAME[t] ?? t))]
    d.version = 5
    changed = true
  }
  // Version 6: the spellbook gets a list of known spells; everything prepared is known.
  if ((d.version ?? 1) < 6) {
    if (d.spellbook) d.spellbook.known = [...new Set([...(d.spellbook.known ?? []), ...d.spellbook.always, ...d.spellbook.prepared])]
    d.version = 6
    changed = true
  }
  // Version 7: Harrowmere's map was lost in the move (the comma in its file name broke the link).
  if ((d.version ?? 1) < 7) {
    const u = d.entries['harrowmere']
    if (u && !u.fields.map) u.fields.map = 'images/Harrowmere, the ashen empire.jpg'
    d.version = 7
    changed = true
  }
  // Version 8: the vault filed every brew as a potion. What the Poisoner's Kit makes is poison,
  // and the kit itself is a tool like the other two kits.
  if ((d.version ?? 1) < 8) {
    for (const e of Object.values(d.entries)) {
      if (e.type !== 'item' || e.fields.kind !== 'Potion') continue
      if (e.fields.craftingType === "Poisoner's Kit") e.fields.kind = 'Poison'
      else if (e.id === 'poisoners-kit') e.fields.kind = 'Other'
    }
    d.version = 8
    changed = true
  }
  // Version 9: subraces are races of their own ("Hill Dwarf", Subrace of: Dwarf), like Sunfolk. The subrace lists on
  // races become entries, and characters with a subrace get that entry as their race.
  if ((d.version ?? 1) < 9) {
    const now = new Date().toISOString()
    const all = () => Object.values(d.entries)
    const slugOf = (s: string) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    /** The subrace entry `sub` of `race`: an existing race called "Sub Race" or "Sub", else a new one. */
    function subrace(race: Entry, sub: string, fields: Record<string, unknown> = {}): Id {
      const full = `${sub} ${race.name}`
      const found = all().find(x => x.type === 'race' && x.id !== race.id && [full, sub].some(n => x.name.toLowerCase() === n.toLowerCase()))
      if (found) { if (!found.fields.parent) found.fields.parent = race.id; return found.id }
      let id = slugOf(full), i = 2
      while (d.entries[id]) id = `${slugOf(full)}-${i++}`
      d.entries[id] = { id, type: 'race', name: full, aliases: [], tags: [], fields: { parent: race.id, ...fields }, body: '', visibility: race.visibility, created: now, updated: now }
      return id
    }
    for (const race of all().filter(x => x.type === 'race')) {
      for (const item of (race.fields.subraces as string[] | undefined) ?? []) {
        const m = item.match(/^([^:]+):\s*(.*)$/)
        const sub = (m?.[1] ?? item).trim()
        const text = (m?.[2] ?? '').trim()
        // "+1 Wis, Dwarven Toughness (+1 HP per level)" → ability scores and traits; commas inside brackets stay.
        const parts = text.split(/,\s*(?![^(]*\))/).map(p => p.trim()).filter(Boolean)
        const ab = parts.filter(p => /^[+-]\d+\s+(str|dex|con|int|wis|cha)\b/i.test(p))
        let traits = parts.filter(p => !ab.includes(p) && !/^see \[\[/i.test(p))
        if (race.id === 'dragonborn' && traits.length === 1 && /^(acid|cold|fire|lightning|poison)$/i.test(traits[0])) traits = [`Draconic Ancestry: ${traits[0]} breath weapon and resistance`]
        const fields: Record<string, unknown> = {}
        if (ab.length) fields.abilityIncrease = ab.join(', ')
        if (traits.length) fields.traits = traits
        subrace(race, sub, fields)
      }
      delete race.fields.subraces
    }
    for (const n of all().filter(x => x.type === 'npc' || x.type === 'pc')) {
      const raw = String(n.fields.subrace ?? '').trim()
      if (!raw) { delete n.fields.subrace; continue }
      const m = raw.match(/^(.*?)\s*\((.*)\)$/)
      const race = d.entries[n.fields.race as Id]
      if (race?.type === 'race') {
        n.fields.race = subrace(race, (m?.[1] ?? raw).trim())
        if (m?.[2] && !n.tags.includes(m[2].trim())) n.tags.push(m[2].trim())
      } else if (!n.tags.includes(raw)) n.tags.push(raw)
      delete n.fields.subrace
    }
    d.version = 9
    changed = true
  }
  // Version 10: families written in the notes become relations, so the family trees show them. Relatives who are
  // named but had no entry (the Stonefist parents, Rowan's family) get one.
  if ((d.version ?? 1) < 10) {
    const now = new Date().toISOString()
    let seq = 0
    const person = (id: Id, name: string, fields: Record<string, unknown>, body: string) => {
      if (!d.entries[id]) d.entries[id] = { id, type: 'npc', name, aliases: [], tags: [], fields, body, visibility: 'secret', created: now, updated: now }
    }
    person('vike-stonefist', 'Vike Stonefist', { race: 'human', gender: 'male', age: '52' },
      '# History\nCarpenter in the 6th generation. A simple and traditional man, who wants his sons to take over his business when he retires. Doesn\'t understand [[doran-stonefist|Doran]]\' fascination with music and poetry.')
    person('greta-stonefist', 'Greta Stonefist', { race: 'human', gender: 'female', age: '47' },
      '# History\nFormerly a locally renowned musician, now helps Vike in the family business. She never lost her passion for music and passed it on to [[doran-stonefist|Doran]]: she taught him to play her lute and gifted it to him.')
    person('bram-hale', 'Bram Hale', { gender: 'male' },
      '# History\nFather of Tomas II, Edric and [[rowan-hale|Rowan]]. Deceased; since his death his brother Osric runs the family\'s affairs.')
    person('ilsa-marsh', 'Ilsa Marsh', { gender: 'female' },
      '# History\nMother of Tomas II, Edric and [[rowan-hale|Rowan]]. Since the death of her husband Bram she has kept her distance from the family and drinks.')
    person('edric-hale', 'Edric Hale', { gender: 'male' },
      '# History\nThe middle of the three Hale brothers. A learned philosopher who presses a few too many wisdoms on [[rowan-hale|Rowan]].')
    person('osric-hale', 'Osric Hale', { gender: 'male' },
      '# History\nCyrus\'s uncle. Has run the family\'s affairs since Bram died, until Tomas II turns 25 this year. A shrewd fox who has brought the family more wealth; he treats Tomas II like his own son, having only twin daughters himself.')
    const has = (a: Id, b: Id, kind: Relation['kind']) => d.relations.some(r => r.kind === kind && ((r.a === a && r.b === b) || (r.a === b && r.b === a)))
    const rel = (a: Id, b: Id, kind: Relation['kind'], role?: string) => {
      if (!d.entries[a] || !d.entries[b] || has(a, b, kind)) return
      d.relations.push({ id: `rfam${(seq++).toString(36)}${Date.now().toString(36)}`, a, b, kind, visibility: 'secret', ...(role ? { role } : {}) })
    }
    // From the notes
    rel('doran-stonefist', 'adrian-stonefist', 'sibling')
    rel('eldar', 'kael', 'parent'); rel('lysara', 'kael', 'parent'); rel('eldar', 'lysara', 'spouse')
    rel('inaya-sugarscale', 'cualli-sugarscale', 'sibling')
    rel('shawn-nettle', 'olivia-nettle', 'parent')
    rel('james-miller', 'molly-miller', 'spouse')
    rel('naphala-ular', 'akhim-ular', 'parent')
    rel('tirbalt-westmarch', 'queen-lafira', 'spouse')
    rel('high-priestess-zuhla', 'rell-astra', 'sibling')
    rel('vega', 'antares-ashby', 'sibling', 'twin')
    rel('bartholomeus-witchlight', 'wayland-witchlight', 'related', 'cousin')
    // The Duuthalds
    rel('vike-stonefist', 'greta-stonefist', 'spouse')
    for (const kid of ['doran-stonefist', 'adrian-stonefist']) { rel('vike-stonefist', kid, 'parent'); rel('greta-stonefist', kid, 'parent') }
    rel('vike-stonefist', 'mariners-peak', 'lives-in'); rel('greta-stonefist', 'mariners-peak', 'lives-in')
    // The Mithras: three brothers, their parents, and their uncle
    rel('bram-hale', 'ilsa-marsh', 'spouse')
    for (const kid of ['tomas-hale', 'edric-hale', 'rowan-hale']) { rel('bram-hale', kid, 'parent'); rel('ilsa-marsh', kid, 'parent') }
    rel('tomas-hale', 'edric-hale', 'sibling'); rel('tomas-hale', 'rowan-hale', 'sibling'); rel('edric-hale', 'rowan-hale', 'sibling')
    rel('osric-hale', 'bram-hale', 'sibling')
    d.version = 10
    changed = true
  }
  // Version 11: the Hale family's spelling for Tomas, and Aria's mother.
  if ((d.version ?? 1) < 11) {
    const tomas = d.entries['tomas-hale']
    if (tomas && tomas.name === 'Tomas Hale') tomas.name = 'Tomas Hale'
    const [mum, kid] = ['lena-vance', 'aria-vance']
    if (d.entries[mum] && d.entries[kid] && !d.relations.some(r => r.kind === 'parent' && r.a === mum && r.b === kid))
      d.relations.push({ id: `rfam${Date.now().toString(36)}`, a: mum, b: kid, kind: 'parent', visibility: 'secret' })
    d.version = 11
    changed = true
  }
  // Version 12: Mira is Aria's sister.
  if ((d.version ?? 1) < 12) {
    const [a, b] = ['mira-vance', 'aria-vance']
    if (d.entries[a] && d.entries[b] && !d.relations.some(r => r.kind === 'sibling' && ((r.a === a && r.b === b) || (r.a === b && r.b === a))))
      d.relations.push({ id: `rfam${Date.now().toString(36)}s`, a, b, kind: 'sibling', visibility: 'secret' })
    d.version = 12
    changed = true
  }
  // Version 13: Lena is Mira's mother too.
  if ((d.version ?? 1) < 13) {
    const [mum, kid] = ['lena-vance', 'mira-vance']
    if (d.entries[mum] && d.entries[kid] && !d.relations.some(r => r.kind === 'parent' && r.a === mum && r.b === kid))
      d.relations.push({ id: `rfam${Date.now().toString(36)}m`, a: mum, b: kid, kind: 'parent', visibility: 'secret' })
    d.version = 13
    changed = true
  }
  // Version 14: organizations' rank tables (| Rank | Title | Renown | Station |) move out of the text into the Ranks field.
  if ((d.version ?? 1) < 14) {
    for (const e of Object.values(d.entries)) {
      if (e.type !== 'organization' || e.fields.ranks) continue
      const lines = e.body.split('\n')
      const head = lines.findIndex(l => /^\s*\|\s*rank\s*\|\s*title\s*\|/i.test(l))
      if (head < 0 || !/^\s*\|[\s:|-]+\|\s*$/.test(lines[head + 1] ?? '')) continue
      const cols = lines[head].split('|').slice(1, -1).map(c => c.trim().toLowerCase())
      let end = head + 2
      const rows: { n: number; line: { title: string; renown?: number; station?: string } }[] = []
      for (; end < lines.length && /^\s*\|/.test(lines[end]); end++) {
        const cells = lines[end].split('|').slice(1, -1).map(c => c.trim())
        const get = (name: string) => cells[cols.indexOf(name)] ?? ''
        const title = get('title')
        if (!title) continue
        const renown = Number(get('renown'))
        const station = get('station')
        rows.push({ n: Number(get('rank')) || rows.length + 1, line: { title, ...(get('renown') !== '' && !Number.isNaN(renown) ? { renown } : {}), ...(station ? { station } : {}) } })
      }
      if (!rows.length) continue
      e.fields.ranks = rows.sort((a, b) => a.n - b.n).map(r => r.line)
      lines.splice(head, end - head)
      e.body = lines.join('\n').replace(/\n{3,}/g, '\n\n')
    }
    d.version = 14
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
/** Is a dated relation true today (in the world)? An end date without month or day runs to the end of that year or month. */
export function isCurrent(r: Relation): boolean {
  const today = dateKey(state.db?.meta.today)
  if (r.from && dateKey(r.from) > today) return false
  if (r.to && r.to.year * 10000 + (r.to.month ?? 12) * 100 + (r.to.day ?? 99) < today) return false
  return true
}
