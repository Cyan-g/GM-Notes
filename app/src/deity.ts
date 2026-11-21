// Deities: the cleric domain subclasses their domains point to, the places their realm and plane name, the
// holidays that are their holy days, the subclasses they're patrons of, and what their text names but doesn't link
// yet (an order under "Orders & Followers", a friend under "Relations"), offered as one-click links.
import type { Entry, RelationKind } from './model/types'
import { byType, db, get, relationsOf } from './store'

export const ALIGNMENTS = ['lawful good', 'neutral good', 'chaotic good', 'lawful neutral', 'neutral', 'chaotic neutral', 'lawful evil', 'neutral evil', 'chaotic evil', 'unaligned']

/** The world's subclass for a cleric domain ("Life" → Life Domain), if there is one. */
export function domainSubclass(domain: string): Entry | undefined {
  const n = domain.trim().toLowerCase()
  return (byType.value.get('subclass') ?? []).find(s => { const m = s.name.toLowerCase(); return m === `${n} domain` || m === n && String(s.fields.class ?? '').toLowerCase() === 'cleric' })
}
/** A place of that name (a realm or a plane written as text). */
export const placeNamed = (name?: string) => {
  const n = (name ?? '').trim().toLowerCase()
  return n ? (byType.value.get('place') ?? []).find(p => p.name.toLowerCase() === n || p.aliases.some(a => a.toLowerCase() === n)) : undefined
}
/** The calendar's holidays, for picking holy days. */
export const holidays = () => db().meta.calendar.holidays ?? []
/** The deities a holiday is a holy day of. */
export const holidayGods = (name: string) => (byType.value.get('deity') ?? []).filter(d => ((d.fields.holyDays as string[] | undefined) ?? []).includes(name))
/** The deities that are patrons of a subclass. */
export const patronsOf = (subclass: string) => (byType.value.get('deity') ?? []).filter(d => ((d.fields.patronOf as string[] | undefined) ?? []).includes(subclass))

/** The entries linked under the headings that match (each [[id]] or [[id|label]] once). */
function linksUnder(body: string, heading: RegExp): string[] {
  const out: string[] = []
  let inside = false
  for (const line of body.split('\n')) {
    const h = line.match(/^#{1,6}\s+(.*)$/)
    if (h) { inside = heading.test(h[1].trim()); continue }
    if (!inside) continue
    for (const m of line.matchAll(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g)) { const id = m[1].trim(); if (!out.includes(id)) out.push(id) }
  }
  return out
}
export interface LinkSuggestion { id: string; why: string; kinds: { kind: RelationKind; label: string; a: string; b: string }[] }
/**
 * What a deity's text names but its relations don't have yet: an order or a person under the followers' heading
 * (offered as "worships"), a being under "Relations" (offered as ally or rival). Already related ones are left out.
 */
export function linkSuggestions(d: Entry): LinkSuggestion[] {
  const related = new Set((relationsOf.value.get(d.id) ?? []).map(r => (r.a === d.id ? r.b : r.a)))
  const out: LinkSuggestion[] = []
  const seen = new Set<string>()
  for (const id of linksUnder(d.body, /order|follower|worship|faith|church|clergy/i)) {
    const x = get(id)
    if (!x || x.id === d.id || related.has(id) || seen.has(id) || !['organization', 'npc', 'pc', 'race', 'creature'].includes(x.type)) continue
    seen.add(id)
    out.push({ id, why: 'named among the followers', kinds: [{ kind: 'worships', label: `worships ${d.name}`, a: id, b: d.id }] })
  }
  for (const id of linksUnder(d.body, /relation|all(y|ies)|friend|rival|enem|family|pantheon/i)) {
    const x = get(id)
    if (!x || x.id === d.id || related.has(id) || seen.has(id) || !['deity', 'npc', 'pc', 'creature', 'organization'].includes(x.type)) continue
    seen.add(id)
    out.push({
      id, why: 'named under its relations',
      kinds: [
        { kind: 'ally', label: 'ally', a: d.id, b: id },
        { kind: 'rival', label: 'rival', a: d.id, b: id },
        ...(x.type !== 'organization' ? [{ kind: 'parent' as RelationKind, label: `${d.name}'s child`, a: d.id, b: id }] : []),
      ],
    })
  }
  return out
}
