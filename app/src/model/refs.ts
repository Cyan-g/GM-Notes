// Every place an entry points at another entry, in one walk: ref and refs fields, recipe and stock lines, map pins,
// encounter lines, a character sheet's inventory, spellbook, recipes and tools, an item's spells, a species trait's
// spells and tools, and [[links]] in the text.
// Sharing uses it both to follow what an entry needs and to rewrite the ids when it lands in another world.
import type { CharacterSheet, Entry, Id, ItemSpell, Trait, TraitOption } from './types'
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
        eq.items = eq.items.map(l => {
          if (!l.item) return l
          const n = to(l.item)
          if (n != null) return { ...l, item: n }
          const { item, ...rest } = l
          return { ...rest, name: rest.name ?? word(item) }
        })
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
          return { ...t, ...(t.spells ? { spells } : {}), ...(t.grants ? { grants } : {}) }
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
}

/** The entries an entry points at (with or without the links in its text). */
export function refsOf(e: Entry, text = true): Id[] {
  const out = new Set<Id>()
  mapRefs(JSON.parse(JSON.stringify(e)), id => { out.add(id); return id }, undefined, text)
  return [...out]
}
