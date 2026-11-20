// npm run seed [data folder]: rebuilds src/seed/world.json, what every new world starts with, from a world's database
// (default ../data). Commit the result; the next build ships it.
//
// The seed holds every dropdown list, the standard calendar (Gregorian, real moon, BC/AD; today is 1 January of
// year 1; worlds make their own in the calendar editor), the session colour of the timeline, and only what may be
// published (the repository is public): spells and feats from the SRD (their text ends with the SRD source line), the
// nine SRD species with their traits (scripts/srd-species.json), and the Tool items without text (crafting needs them). Your
// own homebrew and rules text from outside the SRD stay in your world only. DM-only text, pictures and attached files
// are left out, and references to anything else become plain words.
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Database, Entry, EntryType, Trait, TraitOption } from '../src/model/types'
import { LISTS, optionsIn } from '../src/model/lists'
import { mapRefs } from '../src/model/refs'
import { defaultCalendar } from '../src/calendar'
import { cleanBonus, parseAbilityBonus } from '../src/abilityBonus'

const here = dirname(fileURLToPath(import.meta.url))
const { WorldDb } = createRequire(import.meta.url)('../electron/db.cjs')
const dataDir = resolve(process.argv[2] ?? resolve(here, '../../data'))
const out = resolve(here, '../src/seed/world.json')

const TYPES: EntryType[] = ['race', 'spell', 'feat']
const fromSrd = (e: Entry) => /System Reference Document/.test(`${e.body}\n${String(e.fields.summary ?? '')}`)
const takes = (e: Entry) =>
  ((e.type === 'spell' || e.type === 'feat') && fromSrd(e))
  || (e.type === 'item' && e.fields.kind === 'Tool')
/** Tools keep their facts but not their text (it isn't from the SRD). */
const textless = (e: Entry) => e.type === 'item'

const w = new WorldDb(dataDir, { readOnly: true })
const d = w.load().data as Database

// Every SRD 5.2.1 spell and feat (scripts/srd-5.2.1.json, CC BY 4.0). A world's own entry of the same name that kept
// its own text (it was there before the SRD import) is replaced by the SRD's, keeping the world's id and spell type.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const SRD = JSON.parse(readFileSync(resolve(here, 'srd-5.2.1.json'), 'utf8')) as { type: EntryType; name: string; fields: Entry['fields'] }[]
const byName = new Map(Object.values(d.entries).map(e => [`${e.type}:${norm(e.name)}`, e]))
const slug = (n: string) => n.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const fromFile: Entry[] = SRD.flatMap(s => {
  const own = byName.get(`${s.type}:${norm(s.name)}`)
  if (own && fromSrd(own)) return []
  return [{
    id: own?.id ?? slug(s.name), type: s.type, name: s.name, aliases: [], tags: [], body: '', visibility: 'known',
    fields: { ...s.fields, ...(own?.fields.spellType ? { spellType: own.fields.spellType } : {}) },
    created: own?.created ?? '2026-11-19T00:00:00.000Z', updated: own?.updated ?? '2026-11-19T00:00:00.000Z',
  } as Entry]
})
const replaced = new Set(fromFile.map(e => e.id))
const chosen = [...Object.values(d.entries).filter(e => takes(e) && !replaced.has(e.id)), ...fromFile]

// The nine SRD species with their traits (scripts/srd-species.json); their spells are named there, the seed's ids here.
type SpeciesFile = { name: string; size: string; speed: string; traits: (Trait & { spells?: { spell: string }[] })[] }[]
const SPECIES = JSON.parse(readFileSync(resolve(here, 'srd-species.json'), 'utf8')) as SpeciesFile
const spellId = new Map(chosen.filter(e => e.type === 'spell').map(e => [norm(e.name), e.id]))
const idOfSpell = (name: string) => { const id = spellId.get(norm(name)); if (!id) throw new Error(`srd-species.json names a spell the seed doesn't have: ${name}`); return id }
const withIds = <T extends TraitOption>(t: T): T => (t.spells ? { ...t, spells: t.spells.map(x => ({ ...x, spell: idOfSpell(x.spell) })) } : t)
const species: Entry[] = SPECIES.map(x => {
  const own = byName.get(`race:${norm(x.name)}`)
  return {
    id: own && !own.fields.parent ? own.id : slug(x.name), type: 'race', name: x.name, aliases: [], tags: [], visibility: 'known',
    body: '*Source: System Reference Document 5.2.1 (CC BY 4.0).*',
    fields: {
      size: x.size, speed: x.speed,
      speciesTraits: x.traits.map(t => {
        const c = withIds(t)
        return c.choice?.options ? { ...c, choice: { ...c.choice, options: c.choice.options.map(withIds) } } : c
      }),
    },
    created: own?.created ?? '2026-11-20T00:00:00.000Z', updated: own?.updated ?? '2026-11-20T00:00:00.000Z',
  } as Entry
})
const picked = [...chosen, ...species].sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id))
const ids = new Set(picked.map(e => e.id))

const entries = picked.map(e => {
  const c: Entry = JSON.parse(JSON.stringify(e))
  c.body = c.body
    .replace(/^:::secret\s*\n[\s\S]*?\n:::\s*$/gm, '')
    .replace(/!\[[^\]]*\]\(<?(?:images|files)\/[^)>]*>?\)/g, '')
    .replace(/\[([^\]]*)\]\(<?(?:images|files)\/[^)>]*>?\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n').trim()
  if (textless(c)) c.body = ''
  // An ability score increase still written as text (a world before data version 27, the SRD file) becomes data.
  const inc: unknown = c.fields.abilityIncrease
  if (typeof inc === 'string') { const b = cleanBonus(parseAbilityBonus(inc) ?? {}); if (b) c.fields.abilityIncrease = b; else delete c.fields.abilityIncrease }
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
