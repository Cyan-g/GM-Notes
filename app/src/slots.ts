// Spell slots from a character's class levels (5e): full, half and third casters share one table (the multiclass
// spellcaster table), a warlock's pact slots are their own and come back on a short rest, and from warlock level 11
// Mystic Arcanum gives one 6th-level casting a day (7th at 13, 8th at 15, 9th at 17). A count typed in the
// spellbook (slots[i].own) wins over the worked-out one.
import type { Entry, Spellbook } from './model/types'
import { classesOf } from './model/classes'
import { get } from './store'
import { casterOf } from './classRules'

/** Slots by level (1st…9th) for a caster level of 1…20. */
const TABLE: number[][] = [
  [], [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
]
/** Fighter and rogue subclasses that cast as a third caster. */
const THIRD = /eldritch knight|arcane trickster/i

export interface RuleSlots {
  /** Slots of 1st…9th level (9 numbers). */
  slots: number[]
  /** Warlock pact magic: how many slots, all of one level. */
  pact?: { count: number; level: number }
  /** Mystic Arcanum levels (6…9), one casting each per long rest. */
  arcana: number[]
}

/** What a character's classes give; undefined without classes (their slots are typed by hand). */
export function ruleSlots(pc: Entry): RuleSlots | undefined {
  const lines = classesOf(pc)
  if (!lines.length) return undefined
  const kinds = lines.map(l => {
    const n = Number(l.level) || 0
    const sub = l.subclass ? get(l.subclass)?.name ?? l.subclass : ''
    // how the class casts: its basics (the SRD's, or what its class entry sets)
    const c = casterOf(l.class)
    if (c === 'full') return { kind: 'full' as const, n }
    if (c === 'artificer') return { kind: 'artificer' as const, n }
    if (c === 'half') return { kind: 'half' as const, n }
    if (c === 'third' || ((l.class === 'Fighter' || l.class === 'Rogue') && THIRD.test(sub))) return { kind: 'third' as const, n }
    if (c === 'pact') return { kind: 'warlock' as const, n }
    return { kind: 'none' as const, n }
  })
  const casters = kinds.filter(k => k.kind !== 'none' && k.kind !== 'warlock')
  // One class: half and third casters round up from their first casting level; with several, they round down.
  const single = casters.length === 1
  const level = casters.reduce((sum, k) => sum + (
    k.kind === 'full' ? k.n
      : k.kind === 'artificer' ? Math.ceil(k.n / 2)
        : k.kind === 'half' ? (single ? (k.n >= 2 ? Math.ceil(k.n / 2) : 0) : Math.floor(k.n / 2))
          : (single ? (k.n >= 3 ? Math.ceil(k.n / 3) : 0) : Math.floor(k.n / 3))
  ), 0)
  const slots = Array.from({ length: 9 }, (_, i) => TABLE[Math.min(20, level)]?.[i] ?? 0)
  const w = kinds.find(k => k.kind === 'warlock')?.n ?? 0
  const pact = w ? { count: w >= 17 ? 4 : w >= 11 ? 3 : w >= 2 ? 2 : 1, level: Math.min(5, Math.ceil(w / 2)) } : undefined
  const arcana = [[11, 6], [13, 7], [15, 8], [17, 9]].filter(([at]) => w >= at).map(([, l]) => l)
  return { slots, pact, arcana }
}

/** The slots one class gives at a class level on its own (for its progression table): slots of 1st…9th level, or pact
 * slots with their level. */
export function classSlotsAt(caster: string, n: number): { slots: number[]; pact?: { count: number; level: number } } {
  const lvl = caster === 'full' ? n : caster === 'artificer' ? Math.ceil(n / 2) : caster === 'half' ? (n >= 2 ? Math.ceil(n / 2) : 0) : caster === 'third' ? (n >= 3 ? Math.ceil(n / 3) : 0) : 0
  const slots = Array.from({ length: 9 }, (_, i) => TABLE[Math.min(20, lvl)]?.[i] ?? 0)
  return caster === 'pact' ? { slots, pact: { count: n >= 17 ? 4 : n >= 11 ? 3 : n >= 2 ? 2 : 1, level: Math.min(5, Math.ceil(n / 2)) } } : { slots }
}

/** One row of pips in the spellbook. */
export interface SlotRow {
  key: string
  kind: 'slot' | 'pact' | 'arcanum'
  /** Spell level the slot casts at (1…9). */
  level: number
  max: number
  used: number
  /** The rules' count, when a typed one replaces it. */
  rule?: number
}

/** The rows a spellbook shows: the levelled slots (worked out, or typed), the pact slots, the arcana. */
export function slotRows(book: Spellbook, pc?: Entry): SlotRow[] {
  const r = pc ? ruleSlots(pc) : undefined
  const rows: SlotRow[] = book.slots.map((s, i) => {
    const rule = r?.slots[i]
    const max = r && !s.own ? rule ?? 0 : s.max
    return { key: 's' + i, kind: 'slot', level: i + 1, max, used: Math.min(s.used, max), rule: r && s.own && s.max !== rule ? rule : undefined }
  })
  if (r?.pact) {
    const max = book.pact?.max ?? r.pact.count
    rows.push({ key: 'pact', kind: 'pact', level: r.pact.level, max, used: Math.min(book.pact?.used ?? 0, max), rule: book.pact?.max != null && book.pact.max !== r.pact.count ? r.pact.count : undefined })
  }
  for (const l of r?.arcana ?? []) rows.push({ key: 'a' + l, kind: 'arcanum', level: l, max: 1, used: book.arcanaUsed?.includes(l) ? 1 : 0 })
  return rows
}

/** Spend (+1) or give back (-1) a slot of a row. */
export function useSlot(book: Spellbook, row: SlotRow, by: 1 | -1) {
  const used = Math.max(0, Math.min(row.max, row.used + by))
  if (row.kind === 'slot') book.slots[row.level - 1].used = used
  else if (row.kind === 'pact') book.pact = { ...(book.pact ?? {}), used }
  else {
    const l = (book.arcanaUsed ?? []).filter(x => x !== row.level)
    if (used) l.push(row.level)
    if (l.length) book.arcanaUsed = l; else delete book.arcanaUsed
  }
}

/** Type a row's count (replacing the rules'), or clear it (null) to follow the rules again. */
export function setSlotCount(book: Spellbook, row: SlotRow, n: number | null) {
  if (row.kind === 'slot') {
    const s = book.slots[row.level - 1]
    if (n == null) { delete s.own; s.max = 0 } else { s.max = n; s.own = true }
    s.used = Math.min(s.used, n ?? s.used)
  } else if (row.kind === 'pact') {
    const p = { ...(book.pact ?? { used: 0 }) }
    if (n == null) delete p.max; else p.max = n
    book.pact = p
  }
}

/** The slot a levelled spell is cast with: the lowest-level row with one left at or above its level (pact first on a tie). */
export function slotFor(rows: SlotRow[], spellLevel: number): SlotRow | undefined {
  return rows
    .filter(r => r.used < r.max && (r.kind === 'arcanum' ? r.level === spellLevel : r.level >= spellLevel))
    .sort((a, b) => a.level - b.level || (a.kind === 'pact' ? -1 : b.kind === 'pact' ? 1 : 0))[0]
}

/** A long rest: every slot, pact slot and arcanum back. A short rest: the pact slots. */
export function restSlots(book: Spellbook | undefined, kind: 'short' | 'long') {
  if (!book) return
  if (book.pact) book.pact.used = 0
  if (kind === 'short') return
  for (const s of book.slots) s.used = 0
  delete book.arcanaUsed
}
