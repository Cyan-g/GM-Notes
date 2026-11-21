// Organizations: who leads them, the rank a renown earns and the next one up, a character's standing with each,
// and the organizations at a place (its seat, or present there).
import type { Entry, Id, RankLine } from './model/types'
import { byType, get, isCurrent, relationsOf } from './store'
import { sheetOf } from './sheet'

/** Roles that lead an organization ("Queen", "High Priest", "Captain"…). */
export const LEADER = /\b(leader|head|chief|duke|duchess|king|queen|abbess|abbot|master|captain|high priest|high priestess|archbishop|matriarch|patriarch|lord|lady|commander|general|elder|sage|saint)\b/i

export const ranksOf = (org: Entry) => ((org.fields.ranks as RankLine[] | undefined) ?? []).filter(r => r.title.trim())
/** The current members (their "member of" links). */
export const membersOf = (org: Entry) => (relationsOf.value.get(org.id) ?? []).filter(r => r.kind === 'member' && r.b === org.id && isCurrent(r))
/** Its leaders: current members whose role is a leader's or its top rank's title. */
export function leadersOf(org: Entry): Id[] {
  const top = ranksOf(org)[0]?.title.toLowerCase()
  return membersOf(org).filter(r => r.role && (LEADER.test(r.role) || r.role.toLowerCase() === top)).map(r => r.a)
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
  for (const r of relationsOf.value.get(pc.id) ?? []) {
    if (r.kind !== 'member' || r.a !== pc.id || !isCurrent(r)) continue
    const o = get(r.b)
    if (o) out.set(o.id, { ...(out.get(o.id) ?? { org: o }), role: r.role })
  }
  return [...out.values()].sort((a, b) => a.org.name.localeCompare(b.org.name))
}
/** The organizations at a place: seated there, or present there. */
export const orgsAt = (place: Id) => (byType.value.get('organization') ?? []).filter(o => o.fields.seat === place || ((o.fields.presence as Id[] | undefined) ?? []).includes(place))
