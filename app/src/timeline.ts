// Everything that happened at a known time: events, dated relations, sessions marked for the timeline, writings.
import { computed } from 'vue'
import type { Entry, Id, Relation, WorldDate } from './model/types'
import { RELATION_KINDS } from './model/schema'
import { db, entries, get, placePath, relationsOf, state } from './store'

export type ItemKind = 'event' | 'relation' | 'session' | 'writing'

export interface TItem {
  key: string
  kind: ItemKind
  /** Event category, or the relation's wording ("member of"). */
  category: string
  start?: WorldDate
  end?: WorldDate
  /** The entry this item is (event, session, writing). Relations have none. */
  entry?: Id
  rel?: Relation
  /** Everyone and everything involved: people, organizations, places. */
  involved: Id[]
  places: Id[]
}

/** Years as a continuous number, so months and days land between years. */
export const yearPos = (d: WorldDate) => {
  const cal = state.db?.meta.calendar
  const len = cal ? cal.months.reduce((s, m) => s + m.days, 0) : 365
  let days = 0
  if (d.month && cal) for (let i = 0; i < d.month - 1; i++) days += cal.months[i]?.days ?? 30
  return d.year + (days + (d.day ? d.day - 1 : 0)) / len
}

const eventLike = (e: Entry): TItem | null => {
  const f = e.fields
  const date = f.date as WorldDate | undefined
  if (!date) return null
  if (e.type === 'session' && !e.tags.includes('timeline')) return null
  const involved = (relationsOf.value.get(e.id) ?? []).filter(r => r.kind === 'involved').map(r => (r.a === e.id ? r.b : r.a))
  const places = [...((f.places as Id[]) ?? [])]
  if (e.type === 'writing' && f.author) involved.push(f.author as Id)
  return {
    key: e.id, kind: e.type as ItemKind, entry: e.id,
    category: e.type === 'event' ? String(f.category ?? 'Event') : e.type === 'session' ? 'Session' : 'Writing',
    start: date, end: f.endDate as WorldDate | undefined, involved, places,
  }
}

export const allItems = computed<TItem[]>(() => {
  if (!state.db) return []
  const out: TItem[] = []
  for (const e of entries.value) {
    if (e.type === 'event' || e.type === 'session' || e.type === 'writing') {
      const it = eventLike(e)
      if (it) out.push(it)
    }
  }
  for (const r of db().relations) {
    if (!r.from && !r.to) continue
    if (!RELATION_KINDS[r.kind].dated) continue
    const places = [r.a, r.b].filter(id => get(id)?.type === 'place')
    out.push({ key: r.id, kind: 'relation', category: RELATION_KINDS[r.kind].forward, start: r.from, end: r.to, rel: r, involved: [r.a, r.b], places })
  }
  return out.sort((a, b) => sortKey(a) - sortKey(b))
})

export const sortKey = (it: TItem) => yearPos(it.start ?? it.end ?? { year: 0 })

export interface TimelineFilter {
  type?: 'all' | ItemKind | string
  person?: Id | null
  org?: Id | null
  place?: Id | null
  from?: number | null
  to?: number | null
  /** Only items involving this entry (entry pages). */
  focus?: Id | null
}

/** Is `id` this place or somewhere inside it? */
function within(id: Id, place: Id) {
  return placePath(id).some(p => p.id === place)
}

export function filterItems(items: TItem[], f: TimelineFilter): TItem[] {
  return items.filter(it => {
    if (f.type && f.type !== 'all') {
      if (['event', 'relation', 'session', 'writing'].includes(f.type)) { if (it.kind !== f.type) return false }
      else if (it.category !== f.type) return false
    }
    for (const id of [f.person, f.org, f.focus]) {
      if (!id) continue
      if (!it.involved.includes(id) && !it.places.includes(id)) {
        // An event at a place inside the focused place still counts.
        if (!(get(id)?.type === 'place' && [...it.places, ...it.involved].some(p => get(p)?.type === 'place' && within(p, id)))) return false
      }
    }
    if (f.place && ![...it.places, ...it.involved].some(p => get(p)?.type === 'place' && within(p, f.place!))) return false
    const s = it.start?.year ?? -Infinity, e = it.end?.year ?? (it.kind === 'relation' ? Infinity : s)
    if (f.from != null && e < f.from) return false
    if (f.to != null && s > f.to) return false
    return true
  })
}

/** What an item says, for lists: the event name, or "Corin Westmarch — member of Clan Westmarch (Duke)". */
export function itemTitle(it: TItem): { lead?: Id; text: string; target?: Id } {
  if (it.entry) return { lead: it.entry, text: '' }
  const r = it.rel!
  return { lead: r.a, text: RELATION_KINDS[r.kind].forward, target: r.b }
}

export const today = () => db().meta.today
