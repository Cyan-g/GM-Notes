// What an entry's text names but its relations don't have yet (for deities and organizations): an order under
// "Orders & Followers", a friend under "Relations", a place an organization is in, offered as one-click links.
import type { Entry, RelationKind } from './model/types'
import { get, relatedIds } from './store'

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
