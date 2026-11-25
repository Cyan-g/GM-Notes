// Sessions in play order: by their number, or, without one, the number in their name ("Session 12 - The fog").
import type { Entry, Id } from './model/types'
import { computed } from 'vue'
import { byType, get, state, touch } from './store'
import { createEntry } from './edit'
import { carryOver } from './checklist'
import { go, hrefEntry } from './router'

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
/** The campaign being played: the one made current, else the one with the most sessions (as Home has always shown),
 * else (a player's world, where the DM's campaign has no sessions) the current character's, or the only one. */
export const currentCampaign = computed<Entry | undefined>(() => {
  const set = get(state.db?.meta.currentCampaign)
  if (set?.type === 'campaign') return set
  const all = byType.value.get('campaign') ?? []
  const count = (id: Id) => sessionsOf(id).length
  const top = [...all].sort((a, b) => count(b.id) - count(a.id))[0]
  if (top && count(top.id)) return top
  const mine = ((get(state.db?.meta.currentCharacter)?.fields.campaigns as Id[] | undefined) ?? []).map(id => get(id)).find(c => c?.type === 'campaign')
  return mine ?? (all.length === 1 ? all[0] : undefined)
})
/** Make a campaign the current one (or none). */
export function setCurrentCampaign(id: Id | undefined) {
  const m = state.db?.meta
  if (!m) return
  if (id) m.currentCampaign = id; else delete m.currentCampaign
  touch()
}
/** Colours for campaigns' sessions on the calendar, one each, in the order the campaigns were made. */
const CAMPAIGN_COLORS = ['#7b5ea7', '#2f7f8f', '#b5651d', '#4c8a3f', '#a33b5b', '#5a6fb0', '#8a7a2c', '#6d6d6d']
/** A campaign's colour: its own (set on its page), else one of the palette's by its place among the campaigns. */
export function campaignColor(id: Id | undefined): string | undefined {
  const c = get(id)
  if (!c || c.type !== 'campaign') return undefined
  if (typeof c.fields.color === 'string' && c.fields.color) return c.fields.color
  const all = [...(byType.value.get('campaign') ?? [])].sort((a, b) => a.created.localeCompare(b.created))
  return CAMPAIGN_COLORS[Math.max(0, all.findIndex(x => x.id === id)) % CAMPAIGN_COLORS.length]
}
/** A campaign's characters: those whose Campaigns name it, and those added on the campaign's page (a player's shared one). */
export function membersOf(campaign: Id): Entry[] {
  const extra = new Set((get(campaign)?.fields.members as Id[] | undefined) ?? [])
  return (byType.value.get('pc') ?? []).filter(p => ((p.fields.campaigns as Id[] | undefined) ?? []).includes(campaign) || extra.has(p.id))
}

/**
 * A campaign's next session as the New entry dialog starts it, wherever it's made (the campaign page, Home, the
 * Campaign menu): numbered after the last, dated today in the world, with the campaign's characters present.
 */
export function nextSessionFields(campaign: Id): Record<string, unknown> {
  const party = membersOf(campaign).map(p => p.id)
  const today = state.db?.meta.today
  return { campaign, number: nextSessionNo(campaign), ...(today ? { date: { ...today } } : {}), ...(party.length ? { players: party } : {}) }
}
/**
 * A campaign's next session made in one click ("＋ Session 64"): named and numbered after the last, its fields as
 * above (`extra` on top, a date picked in the calendar), the last session's headings and open checklist items as its
 * text, then open in edit mode.
 */
/** `open`: where it opens: its Edit page (default), or its page (in the campaign's journal, to write in). */
export function createSession(campaign: Id, extra: Record<string, unknown> = {}, open: 'edit' | 'page' = 'edit'): Entry {
  const fields = { ...nextSessionFields(campaign), ...extra }
  const e = createEntry('session', `Session ${fields.number}`, fields)
  const before = sessionsOf(campaign).filter(s => s.id !== e.id && sessionNo(s) < Number(fields.number)).at(-1)
  if (before?.body.trim()) e.body = carryOver(before.body)
  go(hrefEntry(e.id, open === 'edit'))
  return e
}
export const nextSessionNo = (campaign: Id) => Math.max(0, ...sessionsOf(campaign).map(sessionNo).filter(Number.isFinite)) + 1
