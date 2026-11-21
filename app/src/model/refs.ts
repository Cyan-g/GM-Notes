// Every place an entry points at another entry, in one walk: ref and refs fields, recipe and stock lines, map pins,
// encounter lines, a statblock's base creature and spells, required races, a background's and a class's starting
// equipment, a character sheet's inventory, spellbook, active and concentrated spells, recipes, tools, companions
// and renown, an item's spells, a species trait's spells and tools, and [[links]] in the text.
// Sharing uses it both to follow what an entry needs and to rewrite the ids when it lands in another world.
import type { CharacterSheet, ClassBasics, Entry, Id, ItemSpell, Requirements, Statblock, Trait, TraitOption } from './types'
import { TYPES } from './schema'

/** The id to use instead, or null to drop the reference. */
export type RefMap = (id: Id) => Id | null

export const LINK = /\[\[([^\]|\\]+)((?:\\?\|)[^\]]*)?\]\]/g

/**
 * Rewrite every reference of an entry in place (pass a copy). A dropped reference is removed, or becomes plain
 * words where there are some to keep (a pin's label, an inventory line's name, a link's text). Returns the fields
 * that lost something; a character sheet is never listed (it keeps the words for what it lost).
 */
export function mapRefs(e: Entry, to: RefMap, word: (id: Id) => string = id => id, text = true): Set<string> {
  const cut = new Set<string>()
  const f = e.fields as Record<string, unknown>
  for (const def of TYPES[e.type]?.fields ?? []) {
    const v = f[def.key]
    if (v == null) continue
    switch (def.kind) {
      case 'ref': {
        if (typeof v !== 'string') break
        const n = to(v)
        if (n == null) { delete f[def.key]; cut.add(def.key) } else f[def.key] = n
        break
      }
      case 'refs': {
        if (!Array.isArray(v)) break
        const n = v.map(x => (typeof x === 'string' ? to(x) : null))
        if (n.some(x => x == null)) cut.add(def.key)
        const kept = n.filter((x): x is Id => x != null)
        if (kept.length) f[def.key] = kept; else delete f[def.key]
        break
      }
      case 'recipe': case 'stock': {
        if (!Array.isArray(v)) break
        const kept = (v as { item?: Id }[]).flatMap(l => { const n = l.item ? to(l.item) : null; return n == null ? [] : [{ ...l, item: n }] })
        if (kept.length < v.length) cut.add(def.key)
        f[def.key] = kept
        break
      }
      case 'equipment': {
        const eq = v as { items?: { item?: Id; name?: string }[] }
        if (!Array.isArray(eq.items)) break
        eq.items = eq.items.map(l => equipmentLine(l, to, word))
        break
      }
      case 'combatants': {
        if (!Array.isArray(v)) break
        f[def.key] = (v as { creature?: Id; name?: string }[]).map(l => {
          if (!l.creature) return l
          const n = to(l.creature)
          if (n != null) return { ...l, creature: n }
          cut.add(def.key)
          const { creature, ...rest } = l
          return { ...rest, name: rest.name ?? word(creature) }
        })
        break
      }
      case 'pins': {
        if (!Array.isArray(v)) break
        f[def.key] = (v as { entry?: Id; label?: string }[]).map(p => {
          if (!p.entry) return p
          const n = to(p.entry)
          if (n != null) return { ...p, entry: n }
          cut.add(def.key)
          const { entry, ...rest } = p
          return { ...rest, label: rest.label || word(entry) }
        })
        break
      }
      case 'sheet': mapSheet(v as CharacterSheet, to, word); break
      case 'itemSpells': {
        if (!Array.isArray(v)) break
        const l = (v as ItemSpell[]).flatMap(x => { const n = to(x.spell); return n == null ? [] : [{ ...x, spell: n }] })
        if (l.length < v.length) cut.add(def.key)
        f[def.key] = l
        break
      }
      case 'speciesTraits': {
        if (!Array.isArray(v)) break
        let lost = false
        const part = <T extends TraitOption>(t: T): T => {
          const spells = t.spells?.flatMap(x => { const n = to(x.spell); return n == null ? [] : [{ ...x, spell: n }] })
          const grants = t.grants?.flatMap(g => { if (g.kind !== 'tool') return [g]; const n = to(g.id); return n == null ? [] : [{ ...g, id: n }] })
          if ((spells?.length ?? 0) < (t.spells?.length ?? 0) || (grants?.length ?? 0) < (t.grants?.length ?? 0)) lost = true
          // The tool choices that come with an option pick among Tool items, like a trait's own.
          const choices = t.choices?.map(c => (c.kind === 'tool' && c.among ? { ...c, among: c.among.flatMap(id => { const n = to(id); return n == null ? [] : [n] }) } : c))
          return { ...t, ...(t.spells ? { spells } : {}), ...(t.grants ? { grants } : {}), ...(t.choices ? { choices } : {}) }
        }
        f[def.key] = (v as Trait[]).map(t => {
          const x = part(t)
          if (x.choice?.options) x.choice = { ...x.choice, options: x.choice.options.map(part) }
          if (x.choice?.kind === 'tool' && x.choice.among) x.choice = { ...x.choice, among: x.choice.among.flatMap(id => { const n = to(id); return n == null ? [] : [n] }) }
          return x
        })
        if (lost) cut.add(def.key)
        break
      }
      case 'classes': {
        if (!Array.isArray(v)) break
        f[def.key] = (v as { subclass?: Id }[]).map(l => {
          if (!l.subclass) return l
          const n = to(l.subclass)
          if (n != null) return { ...l, subclass: n }
          cut.add(def.key)
          const { subclass, ...rest } = l
          return rest
        })
        break
      }
      case 'statblock': {
        // The creature it's based on, and the spells it casts.
        const sb = v as Statblock
        if (typeof sb !== 'object') break
        if (sb.base) {
          const n = to(sb.base)
          if (n != null) sb.base = n
          else { delete sb.base; cut.add(def.key) }
        }
        if (Array.isArray(sb.spellcasting?.lists)) {
          sb.spellcasting.lists = sb.spellcasting.lists.map(l => {
            if (!Array.isArray(l.spells)) return l
            const spells = l.spells.flatMap(id => { const n = to(id); return n == null ? [] : [n] })
            if (spells.length < l.spells.length) cut.add(def.key)
            return { ...l, spells }
          })
        }
        break
      }
      case 'requires': {
        // The races it asks for; the rest is names and numbers.
        const r = v as Requirements
        if (!Array.isArray(r.races)) break
        const races = r.races.flatMap(id => { const n = typeof id === 'string' ? to(id) : null; return n == null ? [] : [n] })
        if (races.length < r.races.length) cut.add(def.key)
        if (races.length) r.races = races; else delete r.races
        break
      }
      case 'classBasics': {
        // Its starting equipment options, each like a background's equipment: a lost item keeps its name.
        const b = v as ClassBasics
        if (!Array.isArray(b.equipment)) break
        b.equipment = b.equipment.map(eq => (Array.isArray(eq.items) ? { ...eq, items: eq.items.map(l => equipmentLine(l, to, word)) } : eq))
        break
      }
    }
  }
  if (text) {
    e.body = (e.body ?? '').replace(LINK, (all, ref: string, label?: string) => {
      const n = to(ref.trim())
      if (n == null) return label ? label.replace(/^\\?\|/, '') : word(ref.trim())
      return n === ref.trim() ? all : `[[${n}${label ?? ''}]]`
    })
  }
  return cut
}

function mapSheet(s: CharacterSheet, to: RefMap, word: (id: Id) => string) {
  if (!s || typeof s !== 'object') return
  const ids = (a: unknown) => (Array.isArray(a) ? a.flatMap(x => { const n = typeof x === 'string' ? to(x) : null; return n == null ? [] : [n] }) : a)
  if (Array.isArray(s.inventory)) {
    s.inventory = s.inventory.map(l => {
      if (!l.item) return l
      const n = to(l.item)
      if (n != null) return { ...l, item: n }
      const { item, ...rest } = l
      return { ...rest, name: rest.name ?? word(item) }
    })
  }
  if (s.spellbook) for (const k of ['known', 'prepared', 'always'] as const) s.spellbook[k] = ids(s.spellbook[k]) as Id[]
  if (s.crafting) s.crafting.known = ids(s.crafting.known) as Id[]
  if (s.proficiencies) s.proficiencies.tools = ids(s.proficiencies.tools) as Id[]
  if (Array.isArray(s.activeSpells)) s.activeSpells = ids(s.activeSpells) as Id[]
  if (s.concentrating) {
    const n = to(s.concentrating)
    if (n != null) s.concentrating = n; else delete s.concentrating
  }
  // A companion is its creature's statblock with a name: without the creature there is nothing left to show.
  if (Array.isArray(s.companions)) s.companions = s.companions.flatMap(c => { const n = c.creature ? to(c.creature) : null; return n == null ? [] : [{ ...c, creature: n }] })
  if (s.renown && typeof s.renown === 'object') {
    const renown: Record<Id, number> = {}
    for (const [id, v] of Object.entries(s.renown)) { const n = to(id); if (n != null) renown[n] = v }
    s.renown = renown
  }
  // The species picks and swaps are left as they are: they hold entry ids (feats, spells, tools) and option ids or
  // skill names alike, and only the trait they belong to says which, so they can't be told apart here.
}

/** An equipment line with its item renamed, or, when the item is dropped, with the item's name in its place. */
function equipmentLine<L extends { item?: Id; name?: string }>(l: L, to: RefMap, word: (id: Id) => string): L {
  if (!l.item) return l
  const n = to(l.item)
  if (n != null) return { ...l, item: n }
  const { item, ...rest } = l
  return { ...rest, name: rest.name ?? word(item) } as L
}

/** The entries an entry points at (with or without the links in its text). */
export function refsOf(e: Entry, text = true): Id[] {
  const out = new Set<Id>()
  mapRefs(JSON.parse(JSON.stringify(e)), id => { out.add(id); return id }, undefined, text)
  return [...out]
}
