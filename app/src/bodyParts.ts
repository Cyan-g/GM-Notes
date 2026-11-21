// An entry's text on its page, cut where data belongs inside it: an organization's ranks at the end of its
// "Structure" section (before another table there), and granted feats right under a "Feats" heading. What has no
// heading to go under is shown after the text instead. A ticked checklist box changes only its own part.
import type { Entry } from './model/types'
import { changed, isEmpty } from './edit'

export type BodyInsert = 'ranks' | 'feats'
/** A part of the text (its lines from `from` to `to`), or the place where data goes in. */
export interface BodyPart { md?: string; from?: number; to?: number; insert?: BodyInsert }

/** The text's parts in order, and which data found a heading to go under. `feats`: the entry grants feats. */
export function bodyParts(x: Entry, feats: boolean): { parts: BodyPart[]; placed: Set<BodyInsert> } {
  const lines = x.body.split('\n')
  const heading = (name: string) => lines.findIndex(l => new RegExp(`^#{1,6}\\s+${name}\\s*$`, 'i').test(l.trim()))
  const sectionEnd = (h: number) => {
    const level = lines[h].trim().match(/^#+/)![0].length
    const end = lines.findIndex((l, i) => i > h && /^#{1,6}\s/.test(l.trim()) && l.trim().match(/^#+/)![0].length <= level)
    return end < 0 ? lines.length : end
  }
  const cuts: { at: number; insert: BodyInsert }[] = []
  if (x.type === 'organization' && !isEmpty(x.fields.ranks)) {
    const h = heading('structure')
    if (h >= 0) {
      const end = sectionEnd(h)
      const table = lines.findIndex((l, i) => i > h && i < end && l.trim().startsWith('|'))
      cuts.push({ at: table > 0 ? table : end, insert: 'ranks' })
    }
  }
  if (feats) {
    const h = heading('feats?')
    if (h >= 0) cuts.push({ at: h + 1, insert: 'feats' })
  }
  cuts.sort((p, q) => p.at - q.at)
  const parts: BodyPart[] = []
  let from = 0
  for (const c of cuts) {
    const md = lines.slice(from, c.at).join('\n')
    if (md.trim()) parts.push({ md, from, to: c.at })
    parts.push({ insert: c.insert })
    from = c.at
  }
  const rest = lines.slice(from).join('\n')
  if (rest.trim()) parts.push({ md: rest, from, to: lines.length })
  return { parts, placed: new Set(cuts.map(c => c.insert)) }
}

/** A ticked box: its part of the text, changed, goes back in its place. */
export function setBodyPart(x: Entry, p: BodyPart, md: string) {
  if (p.from == null || p.to == null) return
  const lines = x.body.split('\n')
  x.body = [...lines.slice(0, p.from), md, ...lines.slice(p.to)].join('\n')
  changed(x)
}
