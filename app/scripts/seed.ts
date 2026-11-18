// npm run seed [data folder]: rebuilds src/seed/world.json, what every new world starts with, from a world's database
// (default ../data). Commit the result; the next build ships it.
//
// The seed holds every dropdown list, the standard calendar (Gregorian, real moon, BC/AD; today is 1 January of
// year 1; worlds make their own in the calendar editor), the session colour of the timeline, and these entries:
// races, subclasses, spells, feats and Tool items. DM-only text, pictures and attached files are left out, and
// references to anything else become plain words.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Database, Entry, EntryType } from '../src/model/types'
import { LISTS, optionsIn } from '../src/model/lists'
import { mapRefs } from '../src/model/refs'
import { defaultCalendar } from '../src/calendar'

const here = dirname(fileURLToPath(import.meta.url))
const { WorldDb } = createRequire(import.meta.url)('../electron/db.cjs')
const dataDir = resolve(process.argv[2] ?? resolve(here, '../../data'))
const out = resolve(here, '../src/seed/world.json')

const TYPES: EntryType[] = ['race', 'subclass', 'spell', 'feat']
const takes = (e: Entry) => TYPES.includes(e.type) || (e.type === 'item' && e.fields.kind === 'Tool')

const w = new WorldDb(dataDir, { readOnly: true })
const d = w.load().data as Database
const picked = Object.values(d.entries).filter(takes).sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id))
const ids = new Set(picked.map(e => e.id))

const entries = picked.map(e => {
  const c: Entry = JSON.parse(JSON.stringify(e))
  c.body = c.body
    .replace(/^:::secret\s*\n[\s\S]*?\n:::\s*$/gm, '')
    .replace(/!\[[^\]]*\]\(<?(?:images|files)\/[^)>]*>?\)/g, '')
    .replace(/\[([^\]]*)\]\(<?(?:images|files)\/[^)>]*>?\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n').trim()
  delete c.image
  delete c.files
  mapRefs(c, id => (ids.has(id) ? id : null), id => d.entries[id]?.name ?? id)
  return c
})
const relations = d.relations.filter(r => ids.has(r.a) && ids.has(r.b))

const seed = {
  about: 'What every new world starts with. Made by `npm run seed` from the DM\'s world; don\'t edit by hand.',
  dataVersion: d.version,
  meta: {
    calendar: defaultCalendar(),
    eventCategories: d.meta.eventCategories.filter(c => c.name === 'Session'),
    today: { year: 1, month: 1, day: 1 },
    lists: Object.fromEntries(LISTS.map(l => [l.key, optionsIn(d.meta, l.key)])),
  },
  entries,
  relations,
}
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(seed, null, 1) + '\n')
const count = (t: string) => entries.filter(e => e.type === t).length
console.log(`Seed written to ${out}: data version ${d.version}, ${LISTS.length} lists, ${entries.length} entries `
  + `(${TYPES.map(t => `${count(t)} ${t}`).join(', ')}, ${count('item')} tools), ${relations.length} relations.`)
