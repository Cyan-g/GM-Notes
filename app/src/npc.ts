// NPCs: their age worked out from a birth date, their status ("Dead since 86 AC"), and the values the world already
// uses for a field (hair colours, occupations), offered while typing so the same thing is written the same way.
import type { Entry, EntryType, WorldDate } from './model/types'
import { byKey } from './model/schema'
import { byType, db, formatDate } from './store'
import { yearsBetween } from './calendar'

/** The usual statuses; any other word can be typed too. No status counts as alive. */
export const STATUSES = ['Alive', 'Dead', 'Undead', 'Missing', 'Imprisoned', 'Unknown']
/** Quick picks for an age written as a word. */
export const AGES = ['child', 'young', 'adult', 'middle-aged', 'old', 'ancient']
export const ATTITUDES = ['Friendly', 'Indifferent', 'Hostile'] as const

const isDead = (e: Entry) => String(e.fields.status ?? '').toLowerCase() === 'dead'
/** The age from the birth date: on the world's date, or at death for the dead whose death has a date. */
export function ageOf(e: Entry): { years: number; atDeath: boolean } | undefined {
  const born = e.fields.born as WorldDate | undefined
  if (!born) return undefined
  const until = isDead(e) ? (e.fields.statusSince as WorldDate | undefined) : db().meta.today
  if (!until) return undefined
  const years = yearsBetween(born, until)
  return years >= 0 ? { years, atDeath: isDead(e) } : undefined
}
/** "34 years old", "died at 61", or the age as written ("ancient"). */
export function ageText(e: Entry): string {
  const a = ageOf(e)
  if (a) return a.atDeath ? `died at ${a.years}` : `${a.years} years old`
  return String(e.fields.age ?? '')
}
/** "Dead since 86 AC"; nothing for the living. */
export function statusText(e: Entry): string {
  const s = String(e.fields.status ?? '').trim()
  if (!s || s.toLowerCase() === 'alive') return ''
  const since = e.fields.statusSince as WorldDate | undefined
  return since ? `${s} since ${formatDate(since)}` : s
}

/** The values written for a field across these types, most used first (for suggestions while typing). */
export function usedValues(key: string, types: EntryType[] = ['npc', 'pc']): string[] {
  const n = new Map<string, number>()
  for (const t of types) for (const e of byType.value.get(t) ?? []) {
    const v = byKey(e.fields)[key]
    for (const x of Array.isArray(v) ? v : [v]) if (typeof x === 'string' && x.trim()) n.set(x.trim(), (n.get(x.trim()) ?? 0) + 1)
  }
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v)
}
