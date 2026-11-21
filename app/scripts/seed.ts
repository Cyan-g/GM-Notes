// npm run seed [data folder]: rebuilds src/seed/world.json, what every new world starts with, from a world's database
// (default: the world GM Notes has open, from its config; else ../data). Commit the result; the next build ships it.
//
// The seed holds every dropdown list with its standard options (a world's own options stay in that world), the standard calendar (Gregorian, real moon, BC/AD; today is 1 January of
// year 1; worlds make their own in the calendar editor), the session colour of the timeline, and only what may be
// published (the repository is public): spells and feats from the SRD (their text ends with the SRD source line), the
// nine SRD species with their traits (scripts/srd-species.json), the four SRD backgrounds and the tools they name
// (scripts/srd-backgrounds.json), the twelve SRD classes and their SRD subclasses with their features
// (scripts/srd-classes.json), the SRD's weapons, armor, instruments and the gear its starting kits name
// (scripts/srd-equipment.json), and the Tool items without text (crafting needs them). Your
// own homebrew and rules text from outside the SRD stay in your world only. DM-only text, pictures and attached files
// are left out, and references to anything else become plain words.
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Abilities, Database, Entry, EntryType, Equipment, Trait, TraitOption } from '../src/model/types'
import { LISTS, optionsIn } from '../src/model/lists'
import { mapRefs } from '../src/model/refs'
import { defaultCalendar } from '../src/calendar'
import { cleanBonus, parseAbilityBonus } from '../src/abilityBonus'
import { norm, slug, stripSecrets } from '../src/model/text'

const here = dirname(fileURLToPath(import.meta.url))
const { WorldDb } = createRequire(import.meta.url)('../electron/db.cjs')
/** The world GM Notes has open (its config in the app's folder), where the DM's world lives since worlds moved there. */
function openWorld(): string | undefined {
  const appData = process.env.APPDATA ?? (process.platform === 'darwin' ? resolve(homedir(), 'Library/Application Support') : resolve(homedir(), '.config'))
  try { return JSON.parse(readFileSync(resolve(appData, 'gm-notes', 'config.json'), 'utf8')).dataDir } catch { return undefined }
}
const dataDir = resolve(process.argv[2] ?? openWorld() ?? resolve(here, '../../data'))
if (!existsSync(resolve(dataDir, 'dndesk.sqlite'))) throw new Error(`No world in ${dataDir}: give its folder, e.g. npm run seed -- "<folder>"`)
const out = resolve(here, '../src/seed/world.json')

const TYPES: EntryType[] = ['race', 'background', 'class', 'subclass', 'spell', 'feat']
const fromSrd = (e: Entry) => /System Reference Document/.test(`${e.body}\n${String(e.fields.summary ?? '')}`)
const takes = (e: Entry) =>
  ((e.type === 'spell' || e.type === 'feat') && fromSrd(e))
  || (e.type === 'item' && e.fields.kind === 'Tool')
/** The world's tools keep their facts but not their text (it isn't from the SRD). */
const textless = (e: Entry) => e.type === 'item' && !gearIds.has(e.id)

const w = new WorldDb(dataDir, { readOnly: true })
const d = w.load().data as Database

// Every SRD 5.2.1 spell and feat (scripts/srd-5.2.1.json, CC BY 4.0). A world's own entry of the same name that kept
// its own text (it was there before the SRD import) is replaced by the SRD's, keeping the world's id and spell type.
const SRD = JSON.parse(readFileSync(resolve(here, 'srd-5.2.1.json'), 'utf8')) as { type: EntryType; name: string; fields: Entry['fields'] }[]
const byName = new Map(Object.values(d.entries).map(e => [`${e.type}:${norm(e.name)}`, e]))
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
      // sizes as the main one and the others ("Medium or Small"), speed as numbers (data version 30); all SRD species are Humanoids
      size: x.size.split(/\s+or\s+/)[0], ...(/ or /.test(x.size) ? { otherSizes: x.size.split(/\s+or\s+/).slice(1) } : {}),
      creatureType: 'Humanoid', speeds: { walk: Number(x.speed.match(/\d+/)?.[0] ?? 30) },
      speciesTraits: x.traits.map(t => {
        const c = withIds(t)
        return c.choice?.options ? { ...c, choice: { ...c.choice, options: c.choice.options.map(withIds) } } : c
      }),
    },
    created: own?.created ?? '2026-11-20T00:00:00.000Z', updated: own?.updated ?? '2026-11-20T00:00:00.000Z',
  } as Entry
})

// The four SRD backgrounds (scripts/srd-backgrounds.json) and the tools they name, which a world may not have yet.
type BgFile = {
  tools: { name: string; value: number; weight?: number }[]
  backgrounds: { name: string; abilities: (keyof Abilities)[]; feat: string; featNote?: string; skills: string[]; tools: string[]; equipment: Equipment & { items: { name: string; amount?: number }[] } }[]
}
const BG = JSON.parse(readFileSync(resolve(here, 'srd-backgrounds.json'), 'utf8')) as BgFile
const stamp = '2026-11-20T00:00:00.000Z'
const toolIds = new Map(chosen.filter(e => e.type === 'item').map(e => [norm(e.name), e.id]))
const tools: Entry[] = BG.tools.filter(t => !toolIds.has(norm(t.name))).map(t => ({
  id: slug(t.name), type: 'item', name: t.name, aliases: [], tags: [], body: '', visibility: 'known',
  fields: { kind: 'Tool', value: t.value, ...(t.weight ? { weight: t.weight } : {}) }, created: stamp, updated: stamp,
} as Entry))
for (const t of tools) toolIds.set(norm(t.name), t.id)

// The SRD's weapons, armor, musical instruments and the gear its class and background kits name
// (scripts/srd-equipment.json), so a new world's starting kits hand out real items. A tool the world has keeps its own.
type GearFile = { items: { name: string; fields: Entry['fields'] }[] }
const GEAR = JSON.parse(readFileSync(resolve(here, 'srd-equipment.json'), 'utf8')) as GearFile
const takenIds = new Set([...chosen, ...tools].map(e => e.id))
/** An id of its own: the Shield item isn't the Shield spell. */
const freeId = (name: string) => { let id = slug(name); if (takenIds.has(id)) id = `${id}-item`; takenIds.add(id); return id }
const gear: Entry[] = GEAR.items.filter(g => !toolIds.has(norm(g.name))).map(g => ({
  id: freeId(g.name), type: 'item', name: g.name, aliases: [], tags: [], body: '*Source: System Reference Document 5.2.1 (CC BY 4.0).*', visibility: 'known',
  fields: g.fields, created: stamp, updated: stamp,
} as Entry))
const gearIds = new Set(gear.map(e => e.id))
/** Every item the seed has, by name ("Arrows" finds "Arrow"). */
const itemIds = new Map([...chosen.filter(e => e.type === 'item'), ...tools, ...gear].map(e => [norm(e.name), e.id]))
const itemId = (name: string) => itemIds.get(norm(name)) ?? itemIds.get(norm(name).replace(/s$/, ''))
const featId = new Map(chosen.filter(e => e.type === 'feat').map(e => [norm(e.name), e.id]))
const need = (m: Map<string, string>, name: string, what: string) => { const id = m.get(norm(name)); if (!id) throw new Error(`srd-backgrounds.json names a ${what} the seed doesn't have: ${name}`); return id }
const backgrounds: Entry[] = BG.backgrounds.map(b => ({
  id: slug(b.name), type: 'background', name: b.name, aliases: [], tags: [], visibility: 'known',
  body: '*Source: System Reference Document 5.2.1 (CC BY 4.0).*',
  fields: {
    abilityIncrease: { pick: [{ amount: 2, among: b.abilities }, { amount: 1, among: b.abilities }], orPick: [{ amount: 1, count: 3, among: b.abilities }] },
    originFeat: need(featId, b.feat, 'feat'), ...(b.featNote ? { originFeatNote: b.featNote } : {}),
    skillProfs: b.skills, toolProfs: b.tools.map(t => need(toolIds, t, 'tool')),
    equipment: { ...b.equipment, items: b.equipment.items.map(l => { const id = itemId(l.name); return id ? { item: id, ...(l.amount ? { amount: l.amount } : {}) } : l }) },
  },
  created: stamp, updated: stamp,
} as Entry))

// The twelve SRD classes and their SRD subclasses with their features (scripts/srd-classes.json); spells by name there.
type ClassFile = { classes: { name: string; features: Trait[] }[]; subclasses: { name: string; class: string; body: string; features: Trait[] }[] }
const CLS = JSON.parse(readFileSync(resolve(here, 'srd-classes.json'), 'utf8')) as ClassFile
const featuresWithIds = (ts: Trait[]) => ts.map(t => {
  const c = withIds(t)
  return c.choice?.options ? { ...c, choice: { ...c.choice, options: c.choice.options.map(withIds) } } : c
})
const SOURCE = '*Source: System Reference Document 5.2.1 (CC BY 4.0).*'
const classes: Entry[] = [
  ...CLS.classes.map(c => ({
    id: slug(c.name), type: 'class', name: c.name, aliases: [], tags: [], visibility: 'known', body: SOURCE,
    fields: { class: c.name, speciesTraits: featuresWithIds(c.features) }, created: stamp, updated: stamp,
  } as Entry)),
  ...CLS.subclasses.map(c => {
    // the SRD's italic first line ("Make a Deal with the Lower Planes") is the subclass's tagline
    const m = c.body.match(/^\*([^*\n]+)\*\s*\n\s*\n/)
    return {
      id: slug(c.name), type: 'subclass', name: c.name, aliases: [], tags: [], visibility: 'known', body: [m ? c.body.slice(m[0].length) : c.body, SOURCE].join('\n\n'),
      fields: { class: c.class, ...(m ? { tagline: m[1].trim() } : {}), speciesTraits: featuresWithIds(c.features) }, created: stamp, updated: stamp,
    } as Entry
  }),
]
const picked = [...chosen, ...species, ...tools, ...gear, ...backgrounds, ...classes].sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id))
const ids = new Set(picked.map(e => e.id))

const entries = picked.map(e => {
  const c: Entry = JSON.parse(JSON.stringify(e))
  c.body = stripSecrets(c.body)
    .replace(/!\[[^\]]*\]\(<?(?:images|files)\/[^)>]*>?\)/g, '')
    .replace(/\[([^\]]*)\]\(<?(?:images|files)\/[^)>]*>?\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n').trim()
  if (textless(c)) { c.body = ''; delete c.fields.summary }
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
    // the standard options only: a world's own (homebrew weapon properties, ingredient properties) stay in it
    lists: Object.fromEntries(LISTS.map(l => [l.key, optionsIn(undefined, l.key)])),
  },
  entries,
  relations,
}
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(seed, null, 1) + '\n')
const count = (t: string) => entries.filter(e => e.type === t).length
console.log(`Seed written to ${out}: data version ${d.version}, ${LISTS.length} lists, ${entries.length} entries `
  + `(${TYPES.map(t => `${count(t)} ${t}`).join(', ')}, ${count('item') - gear.length} tools, ${gear.length} SRD gear), ${relations.length} relations.`)
