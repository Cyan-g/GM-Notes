// Bringing data saved by an earlier version of the app up to date, one step per data version (store.ts runs them when
// a world is opened or started from the seed). The steps are frozen: each must keep converting old data exactly as it
// did when it was written, so a step is changed only to fix it, never to follow a later change elsewhere in the app.
import type { ClassLine, Database, Entry, GearEffect, Id, Speeds, Trait } from './model/types'
import { SCHEMA, MARTIAL_WEAPONS, SIMPLE_WEAPONS, byKey } from './model/schema'
import { listKeyOf, optionsIn, type ListOption } from './model/lists'
import { cleanBonus, parseAbilityBonus } from './abilityBonus'
import { CLASS_DIE, classFinder, parseClassText } from './model/classes'

/** The newest data version this build understands (the last step in upgrade()). Newer data opens read-only. */
export const DATA_VERSION = 30
/** The oldest data version this build can still open; older data is refused instead of guessed at. */
export const OLDEST_VERSION = 20

/**
 * Bring older saved data up to date. Returns true if anything changed (it's then saved).
 * Everything before data version 20 was converted and those steps removed.
 * Adding one? Write it as `if ((d.version ?? 1) < 22) { …; d.version = 22; changed = true }`, raise DATA_VERSION
 * to match, and lower OLDEST_VERSION only if the step can handle older data.
 */
export function upgrade(d: Database): boolean {
  let changed = false
  if ((d.version ?? 1) < 21) { upgradeTo21(d); d.version = 21; changed = true }
  if ((d.version ?? 1) < 22) { upgradeTo22(d); d.version = 22; changed = true }
  if ((d.version ?? 1) < 23) { upgradeTo23(d); d.version = 23; changed = true }
  if ((d.version ?? 1) < 24) { upgradeTo24(d); d.version = 24; changed = true }
  if ((d.version ?? 1) < 25) { upgradeTo25(d); d.version = 25; changed = true }
  if ((d.version ?? 1) < 26) { upgradeTo26(d); d.version = 26; changed = true }
  if ((d.version ?? 1) < 27) { upgradeTo27(d); d.version = 27; changed = true }
  // 28: backgrounds, a new entry type; nothing to convert, but an older app mustn't edit a world that has them.
  if ((d.version ?? 1) < 28) { d.version = 28; changed = true }
  // 29: classes, a new entry type with features (and subclasses got features); nothing to convert.
  if ((d.version ?? 1) < 29) { d.version = 29; changed = true }
  if ((d.version ?? 1) < 30) { upgradeTo30(d); d.version = 30; changed = true }
  return changed
}

/**
 * 30: a race's speed became numbers ("30 ft" → walk 30; "30 ft, swim 30 ft" → walk 30, swim 30). Text that isn't a
 * speed is kept as the speeds' note. A size written as "Medium or Small" became the main size and the other sizes.
 */
export function speedsFromText(text: string): Speeds {
  const out: Speeds = {}
  let rest = text
  for (const k of ['swim', 'fly', 'climb', 'burrow'] as const) {
    const m = rest.match(new RegExp(`${k}(?:ing)?(?: speed)?\\s*(?:of\\s*)?(\\d+)\\s*(?:ft|feet)?\\.?`, 'i'))
    if (m) { out[k] = Number(m[1]); rest = rest.replace(m[0], '') }
  }
  if (/hover/i.test(rest)) { out.hover = true; rest = rest.replace(/\(?hover\)?/i, '') }
  const w = rest.match(/(\d+)\s*(?:ft|feet)?\.?/i)
  if (w) { out.walk = Number(w[1]); rest = rest.replace(w[0], '') }
  const note = rest.replace(/^[\s,;.]+|[\s,;.]+$/g, '').trim()
  if (note) out.note = note
  return out
}
function upgradeTo30(d: Database) {
  for (const e of Object.values(d.entries)) {
    if (e.type !== 'race') continue
    const f = e.fields as Record<string, unknown>
    if (typeof f.speed === 'string' && f.speed.trim()) f.speeds = speedsFromText(f.speed)
    delete f.speed
    if (typeof f.size === 'string' && / or /i.test(f.size)) {
      const [main, ...rest] = f.size.split(/\s*(?:,|\bor\b)\s*/i).map(x => x.trim()).filter(Boolean)
      f.size = main
      if (rest.length) f.otherSizes = rest
    }
  }
}

/**
 * 27: a race's and a feat's ability score increase (text, "+2 Str, +1 Cha") became data (abilityBonus.ts): fixed
 * bonuses, picks, a cap. What can't be read is kept as its note.
 */
function upgradeTo27(d: Database) {
  for (const e of Object.values(d.entries)) {
    const f = e.fields as Record<string, unknown>
    if ((e.type !== 'race' && e.type !== 'feat') || typeof f.abilityIncrease !== 'string') continue
    const b = parseAbilityBonus(f.abilityIncrease)
    const c = b && cleanBonus(b)
    if (c) f.abilityIncrease = c; else delete f.abilityIncrease
  }
}

/**
 * 26: a race's trait lines (plain text) became species traits (species.ts) with what they do. Each line becomes a
 * trait, "Name: text" split at the colon; a sense with its range ("Darkvision 60 ft") and resistance to a damage
 * type get their effect filled in. Everything else stays text for the DM to add effects to.
 */
function upgradeTo26(d: Database) {
  const DAMAGE = ['Acid', 'Bludgeoning', 'Cold', 'Fire', 'Force', 'Lightning', 'Necrotic', 'Piercing', 'Poison', 'Psychic', 'Radiant', 'Slashing', 'Thunder']
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  for (const e of Object.values(d.entries)) {
    if (e.type !== 'race') continue
    const f = e.fields as Record<string, unknown>
    const lines = Array.isArray(f.traits) ? (f.traits as unknown[]).map(x => String(x).trim()).filter(Boolean) : []
    delete f.traits
    if (!lines.length || Array.isArray(f.speciesTraits)) continue
    f.speciesTraits = lines.map((line, i): Trait => {
      const m = line.match(/^([^:]{1,60}):\s*([\s\S]+)$/)
      const t: Trait = { id: `t${i + 1}`, name: (m ? m[1] : line).trim() }
      if (m) t.text = m[2].trim()
      const effects: GearEffect[] = []
      const sense = line.match(/\b(darkvision|blindsight|tremorsense|truesight)\b\D{0,15}(\d+)\s*(?:ft|feet|')/i)
      if (sense) effects.push({ on: 'sense', sense: cap(sense[1]), value: Number(sense[2]) })
      for (const r of line.matchAll(/resistan(?:ce|t)\s+(?:to\s+)?(\w+)(?:\s+damage)?/gi)) {
        const type = DAMAGE.find(x => x.toLowerCase() === r[1].toLowerCase())
        if (type && !effects.some(x => x.on === 'resistance' && x.type === type)) effects.push({ on: 'resistance', type })
      }
      if (effects.length) t.effects = effects
      return t
    })
  }
}

/**
 * 25: items' Bonus text became effects (effects.ts). A weapon's "+1" is +1 to hit and +1 damage; armor's "+1" or
 * "+2 AC" is AC; anything else is kept as a feature line.
 */
function upgradeTo25(d: Database) {
  for (const e of Object.values(d.entries)) {
    if (e.type !== 'item') continue
    const f = e.fields as Record<string, unknown>
    const text = typeof f.bonus === 'string' ? f.bonus.trim() : ''
    delete f.bonus
    if (!text) continue
    const effects: GearEffect[] = Array.isArray(f.effects) ? [...(f.effects as GearEffect[])] : []
    const plain = text.match(/^\+\s*(\d+)$/), ac = text.match(/^\+\s*(\d+)\s*ac$/i)
    if (ac || (plain && f.kind === 'Armor')) effects.push({ on: 'ac', value: Number((ac ?? plain)![1]) })
    else if (plain && f.kind === 'Weapon') effects.push({ on: 'attack', value: Number(plain[1]) }, { on: 'damage', value: Number(plain[1]) })
    else effects.push({ on: 'feature', text })
    f.effects = effects
  }
}

/**
 * 24: weapon and ingredient properties became two managed lists (Archive → Lists).
 * - An ingredient's properties move to its own field ("traits", still shown as Properties).
 * - Each list gets every value in use that it doesn't have yet (a value matching an option but for upper/lower
 *   case is changed to that option).
 */
function upgradeTo24(d: Database) {
  const lists = { ...(d.meta.lists ?? {}) }
  const take = (key: string, values: string[][]) => {
    const list = (lists[key] ?? optionsIn(d.meta, key)).map(o => ({ ...o }))
    const fixed = new Map<string, string>()
    for (const v of values.flat()) {
      if (typeof v !== 'string' || !v.trim()) continue
      const same = list.find(o => o.id === v || o.label.toLowerCase() === v.trim().toLowerCase())
      if (same) { fixed.set(v, same.id); continue }
      list.push({ id: v.trim(), label: v.trim() })
      fixed.set(v, v.trim())
    }
    lists[key] = list
    return (vs: string[]) => [...new Set(vs.map(v => fixed.get(v) ?? v))]
  }
  const items = Object.values(d.entries).filter(e => e.type === 'item')
  const props = (e: Entry) => (Array.isArray((e.fields as Record<string, unknown>).properties) ? (e.fields as Record<string, unknown>).properties as string[] : [])
  for (const e of items) {
    const f = e.fields as Record<string, unknown>
    if (f.kind === 'Ingredient' && props(e).length) { f.traits = props(e); delete f.properties }
  }
  const weapon = take('weaponProperty', items.filter(e => e.fields.kind !== 'Ingredient').map(props))
  const ingredient = take('ingredientProperty', items.map(e => (e.fields as Record<string, unknown>).traits as string[] ?? []))
  for (const e of items) {
    const f = e.fields as Record<string, unknown>
    if (props(e).length) f.properties = weapon(props(e))
    if (Array.isArray(f.traits)) f.traits = ingredient(f.traits as string[])
  }
  d.meta.lists = lists
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
      // The main class's hit die as the app had it then: data from before version 29 has no class entries to change it.
      if (used > 0) s.hitDiceSpent = { [s.hitDie || (main ? main.die || (CLASS_DIE[main.class] ?? 'd8') : 'd8')]: used }
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
