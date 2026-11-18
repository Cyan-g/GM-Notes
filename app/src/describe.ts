// One-line descriptions and short excerpts of entries, for headers, previews and search.
import type { Entry, Statblock, WorldDate } from './model/types'
import { TYPES } from './model/schema'
import { formatDate, get } from './store'

const name = (id: unknown) => get(id as string)?.name
const join = (...parts: unknown[]) => parts.filter(p => p != null && p !== '' && p !== false).join(' · ')
const ord = (n: string) => ({ '1': '1st', '2': '2nd', '3': '3rd' } as Record<string, string>)[n] ?? `${n}th`

/** `parent: false` leaves out where the entry sits (the entry page shows that in its breadcrumbs). */
export function describe(e: Entry, { parent = true } = {}): string {
  const f = e.fields
  switch (e.type) {
    case 'npc': return join(name(f.race), f.gender, f.age)
    case 'pc': return join(name(f.race), [f.class, f.level && `level ${f.level}`].filter(Boolean).join(' '), f.player && `played by ${f.player}`)
    case 'organization': return join(f.orgType, parent && f.parent && `part of ${name(f.parent)}`, f.seat && `seat: ${name(f.seat)}`)
    case 'place': return join(f.placeType, parent && f.parent && `in ${name(f.parent)}`)
    case 'item': return join([f.rarity, f.magical && !f.rarity ? 'magical' : '', f.subtype || f.kind].filter(Boolean).join(' '), f.attunement && 'requires attunement')
    case 'spell': return f.level === 'Cantrip' ? join(`${f.school ?? ''} cantrip`.trim()) : join(f.level ? `${ord(String(f.level))}-level ${String(f.school ?? '').toLowerCase()}`.trim() : f.school)
    case 'creature': {
      const sb = f.statblock as Statblock | undefined
      return join([sb?.size, f.creatureType ?? sb?.creatureType].filter(Boolean).join(' '), sb?.cr && `CR ${sb.cr}`)
    }
    case 'deity': return join(f.rank, (f.domains as string[] | undefined)?.join(', '), f.alignment)
    case 'feat': return join(f.category, f.level && `level ${f.level}+`, name(f.source) && `from ${name(f.source)}`)
    case 'race': return join(f.parent ? `subrace of ${name(f.parent)}` : '', f.size, f.speed && `speed ${f.speed}`, f.abilityIncrease)
    case 'event': return join(formatDate(f.date as WorldDate), f.category)
    case 'session': return join(name(f.campaign), f.number != null && `session ${f.number}`, formatDate(f.date as WorldDate))
    case 'campaign': return join(f.status)
    case 'writing': return join(f.writingType, f.author && `by ${name(f.author)}`, formatDate(f.date as WorldDate))
    default: return join(f.category)
  }
}

/** A plain-text taste of the entry: its short description, or the first paragraph of its text. */
export function excerpt(e: Entry, max = 260): string {
  const f = e.fields
  const own = f.summary ?? f.effect
  if (own) return cut(own, max)
  const para = e.body
    .replace(/:::secret[\s\S]*?:::/g, '')
    .replace(/^#{1,6}\s.*$/gm, '')
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .find(p => p && !/^(#|\||!\[|>|```|-{3,})/.test(p))
  if (!para) return ''
  const plain = para
    .replace(/\[\[([^\]|]+)(?:\\?\|([^\]]*))?\]\]/g, (_, id, label) => label || get(id)?.name || id)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
  return cut(plain, max)
}
const cut = (s: string, max: number) => (s.length > max ? s.slice(0, max).replace(/\s+\S*$/, '') + '…' : s)

export const typeLabel = (e: Entry) => TYPES[e.type].label
