// The few facts an entry's page shows right under its name (affiliations, home, rulers, leaders, as org.ts tells
// them), and how its relations read: ended or current, and from when to when.
import type { Entry, Relation, WorldDate } from './model/types'
import { dateKey, db, formatDate, relationsOf } from './store'
import { leads } from './org'

/** A relation that ended before the world's date. */
export const relationEnded = (r: Relation) => r.to && dateKey(r.to) < dateKey(db().meta.today)
/** When a relation held: "from – to", with "?" or "now" for an open end. */
export function dateRange(from?: WorldDate, to?: WorldDate): string {
  if (!from && !to) return ''
  return `${from ? formatDate(from) : '?'} – ${to ? formatDate(to) : 'now'}`
}

export interface FactLine { label: string; items: { id: string; note?: string; rel: string }[] }

/** The facts under an entry's name, from its current relations. */
export function factsOf(x: Entry): FactLine[] {
  const rs = (relationsOf.value.get(x.id) ?? []).filter(r => !relationEnded(r))
  const out: FactLine[] = []
  const add = (label: string, items: FactLine['items']) => { if (items.length) out.push({ label, items }) }
  if (x.type === 'npc' || x.type === 'pc') {
    add('Member of', rs.filter(r => r.kind === 'member' && r.a === x.id).map(r => ({ id: r.b, note: r.role, rel: r.id })))
    add('Lives in', rs.filter(r => r.kind === 'lives-in' && r.a === x.id).map(r => ({ id: r.b, rel: r.id })))
    add('Rules', rs.filter(r => r.kind === 'rules' && r.a === x.id).map(r => ({ id: r.b, rel: r.id })))
    add('Worships', rs.filter(r => r.kind === 'worships' && r.a === x.id).map(r => ({ id: r.b, rel: r.id })))
  } else if (x.type === 'organization') {
    add('Led by', rs.filter(r => r.kind === 'member' && r.b === x.id && leads(x, r.role)).map(r => ({ id: r.a, note: r.role, rel: r.id })))
  } else if (x.type === 'place') {
    add('Ruled by', rs.filter(r => r.kind === 'rules' && r.b === x.id).map(r => ({ id: r.a, note: r.role, rel: r.id })))
  }
  return out
}
/** The relations already in the facts line, left out of the side cards (ended ones still show there). */
export const factRelations = (x: Entry) => new Set(factsOf(x).flatMap(f => f.items.map(i => i.rel)))
