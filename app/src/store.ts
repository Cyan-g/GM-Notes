// The loaded database plus lookups the pages need, and saving with backups.
import { reactive, computed, shallowRef } from 'vue'
import type { Database, Entry, EntryType, Id, Relation, WorldDate } from './model/types'
import type { Storage } from './storage/storage'
import { OLD_PLACE_SIZES, byKey } from './model/schema'

const DB_FILE = 'eldoria.json'
/** What changes during play (the fight, the spellbook, the crafting pouch) lives in its own small file, so a click
 *  in a fight doesn't rewrite the whole world. In memory it's all one Database. */
const SESSION_FILE = 'session.json'
const SESSION_KEYS = ['tracker', 'spellbook', 'crafting'] as const
const BACKUP_DIR = 'backups'
const BACKUP_EVERY_MS = 10 * 60 * 1000
/** The newest data version this build understands (the last step in upgrade()). Newer files open read-only. */
export const DATA_VERSION = 20

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

/** Bring older saved data up to date. Returns true if anything changed (it's then saved). */
function upgrade(d: Database) {
  // Old data has fields the schema no longer knows; the steps below read and remove them untyped.
  const raw = (e: Entry) => byKey(e.fields) as Record<string, any>
  let changed = false
  for (const e of Object.values(d.entries)) {
    if (e.type === 'place' && OLD_PLACE_SIZES.includes(e.fields.placeType ?? '')) { delete e.fields.placeType; changed = true }
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
      const t = e.fields.craftingType
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
      for (const item of (raw(race).subraces as string[] | undefined) ?? []) {
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
      delete raw(race).subraces
    }
    for (const n of all().filter(x => x.type === 'npc' || x.type === 'pc')) {
      const typed = String(raw(n).subrace ?? '').trim()
      if (!typed) { delete raw(n).subrace; continue }
      const m = typed.match(/^(.*?)\s*\((.*)\)$/)
      const race = n.fields.race ? d.entries[n.fields.race] : undefined
      if (race?.type === 'race') {
        n.fields.race = subrace(race, (m?.[1] ?? typed).trim())
        if (m?.[2] && !n.tags.includes(m[2].trim())) n.tags.push(m[2].trim())
      } else if (!n.tags.includes(typed)) n.tags.push(typed)
      delete raw(n).subrace
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
  // Version 15: feats written under a "Feats" heading become feat entries, granted by the entry they were in.
  //   - **Ironwall** - Fighting Style            (with sub-bullets: Prerequisite, Ability Score increase, text)
  //   **Origin Feat** - Sanguine expert             (the text on the following lines)
  // Anything else in those sections (a subclass, a spell perk) stays as text.
  if ((d.version ?? 1) < 15) {
    const now = new Date().toISOString()
    const isKind = (s: string) => /\b(feat|fighting style|boon)\b/i.test(s)
    const kindOf = (s: string) => /origin/i.test(s) ? 'Origin Feat' : /fighting style/i.test(s) ? 'Fighting Style' : /boon/i.test(s) ? 'Epic Boon' : /feat/i.test(s) ? 'General Feat' : 'Other'
    const slugOf = (s: string) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const needs: { feat: Entry; names: string[] }[] = []
    for (const host of Object.values(d.entries)) {
      const lines = host.body.split('\n')
      const h = lines.findIndex(l => /^#{1,6}\s+feats?\s*$/i.test(l.trim()))
      if (h < 0) continue
      const level = lines[h].trim().match(/^#+/)![0].length
      let end = lines.findIndex((l, i) => i > h && /^#{1,6}\s/.test(l.trim()) && l.trim().match(/^#+/)![0].length <= level)
      if (end < 0) end = lines.length
      const drop = new Set<number>()
      for (let i = h + 1; i < end; i++) {
        const a = lines[i].match(/^-\s*\*\*(.+?)\*\*\s*-\s*(.+?)\s*$/)
        const b = lines[i].match(/^\*\*(.+?)\*\*\s*-\s*(.+?)\s*$/)
        let name = '', kind = ''
        const text: string[] = []
        const f: Record<string, unknown> = {}
        let j = i + 1
        if (a && isKind(a[2])) {
          name = a[1].trim(); kind = kindOf(a[2])
          for (; j < end && (/^\s+-/.test(lines[j]) || (!lines[j].trim() && /^\s+-/.test(lines[j + 1] ?? ''))); j++) {
            const t = lines[j].replace(/^\s+-\s*/, '').trim()
            if (!t) continue
            const pre = t.match(/^\*\*prerequisite\*\*\s*:?\s*(.*)$/i)
            const asi = t.match(/^\*\*ability score increase:?\*\*\s*:?\s*(.*)$/i)
            if (pre) {
              const others: string[] = []
              for (const p of pre[1].split('|').map(x => x.trim()).filter(Boolean)) {
                const lv = p.match(/^level\s*(\d+)\+?$/i)
                if (lv) f.level = Number(lv[1])
                else others.push(p)
              }
              if (others.length) f.prerequisiteNames = others
            } else if (asi) f.abilityIncrease = asi[1].trim()
            else text.push(t)
          }
        } else if (b && isKind(b[1])) {
          kind = kindOf(b[1]); name = b[2].trim()
          name = name[0].toUpperCase() + name.slice(1)
          for (; j < end && lines[j].trim() && !/^\*\*/.test(lines[j].trim()) && !/^#/.test(lines[j].trim()); j++) text.push(lines[j].trim())
        } else continue
        let id = slugOf(name), n = 2
        while (d.entries[id]) id = `${slugOf(name)}-${n++}`
        const names = (f.prerequisiteNames as string[] | undefined) ?? []
        delete f.prerequisiteNames
        const feat: Entry = {
          id, type: 'feat', name, aliases: [], tags: [], body: '', visibility: host.visibility, created: now, updated: now,
          fields: { category: kind, ...f, source: host.id, ...(text.length ? { summary: text.join('\n\n') } : {}) },
        }
        d.entries[id] = feat
        if (names.length) needs.push({ feat, names })
        for (let k = i; k < j; k++) drop.add(k)
        i = j - 1
      }
      if (!drop.size) continue
      host.body = lines.filter((_, k) => !drop.has(k)).join('\n').replace(/\n{3,}/g, '\n\n')
    }
    // "Prerequisite: Level 8+ | Barricade": a name that is a feat becomes a link, anything else stays as text.
    for (const { feat, names } of needs) {
      const ids: Id[] = [], rest: string[] = []
      for (const nm of names) {
        const hit = Object.values(d.entries).find(x => x.type === 'feat' && x.name.toLowerCase() === nm.toLowerCase())
        if (hit) ids.push(hit.id); else rest.push(nm)
      }
      if (ids.length) feat.fields.requires = ids
      if (rest.length) feat.fields.prerequisite = rest.join(', ')
    }
    d.version = 15
    changed = true
  }
  // Version 16: the fight, spellbook and crafting pouch are saved in session.json instead of the world file.
  // Nothing to convert in memory; the next save writes the two files. (Older app files open this read-only.)
  if ((d.version ?? 1) < 16) {
    d.version = 16
    changed = true
  }
  // Version 17: leftovers from the Obsidian import go. `mapConfig` was the old map plugin's setting (unused);
  // `raceText` was a race typed in that matched no entry. A typed "undead" survives as a tag.
  if ((d.version ?? 1) < 17) {
    for (const e of Object.values(d.entries)) {
      delete raw(e).mapConfig
      const typed = String(raw(e).raceText ?? '').trim()
      if (typed.toLowerCase() === 'undead' && !e.tags.includes('undead')) e.tags.push('undead')
      delete raw(e).raceText
    }
    d.version = 17
    changed = true
  }
  // Version 18: spellbooks and workbenches belong to characters. The world's spellbook goes to the character it
  // was set to, with the workbench: its recipes and tools onto their sheet, the pouch and crafted things into
  // their inventory. That character becomes the current one. Without a character set, nothing moves.
  if ((d.version ?? 1) < 18) {
    const pc = d.spellbook?.caster ? d.entries[d.spellbook.caster] : undefined
    if (pc?.type === 'pc') {
      const sheet = (raw(pc).sheet ??= {}) as Record<string, any>
      sheet.saves ??= []; sheet.skills ??= {}; sheet.features ??= []; sheet.inventory ??= []
      if (!sheet.spellbook) {
        const { caster: _caster, ...book } = d.spellbook!
        sheet.spellbook = book
        delete d.spellbook
      }
      if (d.crafting && !sheet.crafting) {
        sheet.crafting = { tools: d.crafting.tools, known: d.crafting.known }
        for (const l of [...d.crafting.pouch, ...d.crafting.made]) {
          const have = sheet.inventory.find((x: { item?: string }) => x.item === l.item)
          if (have) have.qty += l.qty; else sheet.inventory.push({ item: l.item, qty: l.qty })
        }
        delete d.crafting
      }
      d.meta.currentCharacter = pc.id
      pc.updated = new Date().toISOString()
    }
    d.version = 18
    changed = true
  }
  // Version 19: "Requires attunement" set on the items that need it (gone through with the DM on 2026-11-18):
  // those whose text says so, the official rings, and the homebrew ones picked by hand.
  if ((d.version ?? 1) < 19) {
    const ATTUNED = [
      'crown-of-the-sun-queen', 'the-crown-of-the-consumed-sun', 'mirrorsheen-glove', 'orb-of-entanglement',
      'ring-of-the-chlorolymph', 'tome-of-the-fathomless-depths', 'duskbringer', 'the-iron-spine',
      'staff-of-the-radiant-gaze', 'wand-of-surging-tides', 'wand-of-the-radiant-gaze',
      'ring-of-protection', 'ring-of-resistance',
      'ubtaos-fang', 'the-shade-anchor', 'pendant-of-gold', 'chainmasters-collar',
      'nightfall', 'sword-of-the-desert-sun', 'thorn-of-ironhold', 'spine-of-ildran-the-mad',
      'squallmasters-band', 'apprentices-folly', 'tome-of-merrow-the-sodden',
    ]
    for (const id of ATTUNED) { const e = d.entries[id]; if (e?.type === 'item') e.fields.attunement = true }
    d.version = 19
    changed = true
  }
  // Version 20 (found by the data check): a weapon's damage type is a list, since some do two
  // ("Slashing/Piercing" was one text the form couldn't show); characters lose the statblock the sheet replaced.
  if ((d.version ?? 1) < 20) {
    for (const e of Object.values(d.entries)) {
      const dt: unknown = raw(e).damageType
      if (typeof dt === 'string') {
        const list = dt.split('/').map(x => x.trim()).filter(Boolean)
        if (list.length) e.fields.damageType = list; else delete e.fields.damageType
      }
      if (e.type === 'pc') delete e.fields.statblock
    }
    d.version = 20
    changed = true
  }
  // Adding a step? Raise DATA_VERSION at the top to match, or the new data opens read-only in this build.
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
