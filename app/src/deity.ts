// Deities (and what an entry's text names, for deities and organizations): the cleric domain subclasses their domains point to, the places their realm and plane name, the
// holidays that are their holy days, the subclasses they're patrons of, and what their text names but doesn't link
// yet (an order under "Orders & Followers", a friend under "Relations"), offered as one-click links.
import type { Entry, RelationKind } from './model/types'
import { byType, db, get, relatedIds } from './store'
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

/** The entries linked under the headings that match (each [[id]] or [[id|label]] once). */
function linksUnder(body: string, heading: RegExp, all = false): string[] {
  const out: string[] = []
  let inside = all
  for (const line of body.split('\n')) {
    const h = line.match(/^#{1,6}\s+(.*)$/)
    if (h) { inside = all || heading.test(h[1].trim()); continue }
    if (!inside) continue
    for (const m of line.matchAll(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g)) { const id = m[1].trim(); if (!out.includes(id)) out.push(id) }
  }
  return out
}
export interface LinkAction { label: string; rel?: { kind: RelationKind; a: string; b: string }; presence?: string }
export interface LinkSuggestion { id: string; why: string; kinds: LinkAction[] }
const PEOPLE_ISH = ['npc', 'pc', 'creature']
/**
 * What an entry's text names but its relations don't have yet, as one-click links (nothing is linked without
 * that click). A deity: an order or a person under the followers' heading ("worships"), a being under "Relations"
 * (ally, rival or child). An organization: a deity anywhere in its text ("worships"), a place ("present in"),
 * a person ("member").
 */
export function linkSuggestions(d: Entry): LinkSuggestion[] {
  const related = new Set(relatedIds(d.id))
  const out: LinkSuggestion[] = []
  const seen = new Set<string>([d.id])
  const fresh = (id: string) => { const x = get(id); if (!x || related.has(id) || seen.has(id)) return undefined; return x }
  if (d.type === 'organization') {
    const present = new Set([d.fields.seat as string | undefined, d.fields.parent as string | undefined, ...((d.fields.presence as string[] | undefined) ?? [])].filter(Boolean) as string[])
    for (const id of linksUnder(d.body, /.*/, true)) {
      const x = fresh(id)
      if (!x) continue
      if (x.type === 'deity') out.push({ id, why: 'named in the text', kinds: [{ label: `${d.name} worships`, rel: { kind: 'worships', a: d.id, b: id } }] })
      else if (x.type === 'place' && !present.has(id)) out.push({ id, why: 'a place in the text', kinds: [{ label: 'present in', presence: id }] })
      else if (PEOPLE_ISH.includes(x.type)) out.push({ id, why: 'named in the text', kinds: [{ label: 'member', rel: { kind: 'member', a: id, b: d.id } }] })
      else continue
      seen.add(id)
    }
    return out
  }
  for (const id of linksUnder(d.body, /order|follower|worship|faith|church|clergy/i)) {
    const x = fresh(id)
    if (!x || !['organization', 'npc', 'pc', 'race', 'creature'].includes(x.type)) continue
    seen.add(id)
    out.push({ id, why: 'named among the followers', kinds: [{ label: `worships ${d.name}`, rel: { kind: 'worships', a: id, b: d.id } }] })
  }
  for (const id of linksUnder(d.body, /relation|all(y|ies)|friend|rival|enem|family|pantheon/i)) {
    const x = fresh(id)
    if (!x || !['deity', 'npc', 'pc', 'creature', 'organization'].includes(x.type)) continue
    seen.add(id)
    out.push({
      id, why: 'named under its relations',
      kinds: [
        { label: 'ally', rel: { kind: 'ally', a: d.id, b: id } },
        { label: 'rival', rel: { kind: 'rival', a: d.id, b: id } },
        ...(x.type !== 'organization' ? [{ label: `${d.name}'s child`, rel: { kind: 'parent' as RelationKind, a: d.id, b: id } }] : []),
      ],
    })
  }
  return out
}
