// Organizations: who leads them, the rank a renown earns and the next one up, a character's standing with each,
// and the organizations at a place (its seat, or present there).
import type { Entry, Id, RankLine } from './model/types'
import { byType, get, relationsWith } from './store'
import { sheetOf } from './sheetData'

/** Roles that lead an organization ("Queen", "High Priest", "Captain"…). The one list every page goes by. */
export const LEADER = /\b(leader|head|chief|chieftain|duke|duchess|king|queen|abbess|abbot|master|grandmaster|captain|high[- ]?priest(ess)?|archbishop|archmage|vizier|matriarch|patriarch|lord|lady|commander|general|elder|sage|saint)\b/i

export const ranksOf = (org: Entry) => ((org.fields.ranks as RankLine[] | undefined) ?? []).filter(r => r.title.trim())
/** The current members (their "member of" links). */
export const membersOf = (org: Entry) => relationsWith(org.id, 'member', 'in', { current: true })
/** Whether a member's role leads the organization: a leader's role, or its top rank's title. */
export function leads(org: Entry, role?: string): boolean {
  const r = role?.trim().toLowerCase()
  return !!r && (LEADER.test(r) || r === ranksOf(org)[0]?.title.trim().toLowerCase())
}
/** Its leaders: current members whose role leads it, the holders of its top rank first. */
export function leadersOf(org: Entry): Id[] {
  const top = ranksOf(org)[0]?.title.trim().toLowerCase()
  const m = membersOf(org).filter(r => leads(org, r.role))
  const isTop = (role?: string) => role?.trim().toLowerCase() === top
  return [...m.filter(r => isTop(r.role)), ...m.filter(r => !isTop(r.role))].map(r => r.a)
}

/** The rank a renown earns (the highest one it reaches; appointed ranks, without a number, aren't earned) and the next. */
export function rankForRenown(org: Entry, renown: number): { rank?: RankLine; next?: RankLine } {
  const earned = ranksOf(org).filter(r => r.renown != null).sort((a, b) => (a.renown ?? 0) - (b.renown ?? 0))
  let rank: RankLine | undefined, next: RankLine | undefined
  for (const r of earned) { if ((r.renown ?? 0) <= renown) rank = r; else { next = r; break } }
  return { rank, next }
}
/** A character's renown with an organization, if the DM has given any. */
export const renownOf = (pc: Entry, org: Id): number | undefined => sheetOf(pc)?.renown?.[org]
/** A character's standing: every organization they have renown with or belong to. */
export function standingOf(pc: Entry): { org: Entry; renown?: number; role?: string }[] {
  const out = new Map<Id, { org: Entry; renown?: number; role?: string }>()
  for (const [id, n] of Object.entries(sheetOf(pc)?.renown ?? {})) { const o = get(id); if (o) out.set(id, { org: o, renown: n }) }
  for (const r of relationsWith(pc.id, 'member', 'out', { current: true })) {
    const o = get(r.b)
    if (o) out.set(o.id, { ...(out.get(o.id) ?? { org: o }), role: r.role })
  }
  return [...out.values()].sort((a, b) => a.org.name.localeCompare(b.org.name))
}
/** The organizations at a place: seated there, or present there. */
export const orgsAt = (place: Id) => (byType.value.get('organization') ?? []).filter(o => o.fields.seat === place || ((o.fields.presence as Id[] | undefined) ?? []).includes(place))
