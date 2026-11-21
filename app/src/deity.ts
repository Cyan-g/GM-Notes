// Deities: the cleric domain subclasses their domains point to, the places their realm and plane name, the holidays
// that are their holy days and the subclasses they're patrons of. What their text names but doesn't link yet is in
// textLinks.ts.
import type { Entry } from './model/types'
import { byType, db } from './store'
import { entryNamed } from './lookup'

export const ALIGNMENTS = ['lawful good', 'neutral good', 'chaotic good', 'lawful neutral', 'neutral', 'chaotic neutral', 'lawful evil', 'neutral evil', 'chaotic evil', 'unaligned']

/** The world's subclass for a cleric domain ("Life" → Life Domain), if there is one. */
export function domainSubclass(domain: string): Entry | undefined {
  const n = domain.trim().toLowerCase()
  return (byType.value.get('subclass') ?? []).find(s => { const m = s.name.toLowerCase(); return m === `${n} domain` || m === n && String(s.fields.class ?? '').toLowerCase() === 'cleric' })
}
/** A place of that name (a realm or a plane written as text). */
export const placeNamed = (name?: string) => entryNamed('place', name, { aliases: true })
/** The calendar's holidays, for picking holy days. */
export const holidays = () => db().meta.calendar.holidays ?? []
/** The deities a holiday is a holy day of. */
export const holidayGods = (name: string) => (byType.value.get('deity') ?? []).filter(d => ((d.fields.holyDays as string[] | undefined) ?? []).includes(name))
/** The deities that are patrons of a subclass. */
export const patronsOf = (subclass: string) => (byType.value.get('deity') ?? []).filter(d => ((d.fields.patronOf as string[] | undefined) ?? []).includes(subclass))
