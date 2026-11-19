// Sessions in play order: by their number, or, without one, the number in their name ("Session 12 - The fog").
import type { Entry, Id } from './model/types'
import { byType } from './store'

/** A session's number: its Number field, else the first number in "Session 12…"; Infinity when it has none. */
export function sessionNo(s: Entry): number {
  const n = Number(s.fields.number)
  if (s.fields.number != null && Number.isFinite(n)) return n
  const m = s.name.match(/session\s*#?\s*(\d+)/i) ?? s.name.match(/(\d+)/)
  return m ? Number(m[1]) : Infinity
}
/** For sort(): earlier sessions first, then by name (numbers in names in numeric order). */
export const bySessionNo = (a: Entry, b: Entry) =>
  sessionNo(a) - sessionNo(b) || a.name.localeCompare(b.name, undefined, { numeric: true }) || a.created.localeCompare(b.created)
/** A campaign's sessions in play order. */
export const sessionsOf = (campaign: Id) => (byType.value.get('session') ?? []).filter(s => s.fields.campaign === campaign).sort(bySessionNo)
/** The number a campaign's next session gets. */
export const nextSessionNo = (campaign: Id) => Math.max(0, ...sessionsOf(campaign).map(sessionNo).filter(Number.isFinite)) + 1
