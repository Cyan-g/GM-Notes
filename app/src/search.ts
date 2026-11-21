import type { Entry } from './model/types'
import { entries, playerMode } from './store'
import { norm as normName, stripSecrets } from './model/text'

/** Lower case, no accents, no apostrophes ("Mariner's" = "mariners"), other punctuation as spaces. */
const norm = (s: string) => normName(s, ' ')
const words = (s: string) => s.split(' ').filter(Boolean)

/** At most one letter added, dropped, changed or two swapped ("aldn" ~ "alden", "lighthosue" ~ "lighthouse"). */
function oneOff(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2))
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1)
}

/** How well a name matches: exact, start, a word start, every word starting a word, anywhere, close to a word. */
function score(name: string, n: string): number {
  const s = norm(name)
  if (!s) return 0
  if (s === n) return 100
  if (s.startsWith(n)) return 80
  const ws = words(s)
  if (ws.some(w => w.startsWith(n))) return 60
  const qs = words(n)
  if (qs.length > 1 && qs.every(q => ws.some(w => w.startsWith(q)))) return 55
  if (s.includes(n)) return 40
  // a typo: each typed word close to a word of the name (or to its start, while still typing)
  const near = (q: string) => (q.length < 4 ? ws.some(w => w.startsWith(q)) : ws.some(w => oneOff(q, w) || oneOff(q, w.slice(0, q.length))))
  if (n.length >= 4 && qs.every(near)) return 20
  return 0
}

/** Name and alias search: exact start beats word start beats anywhere beats a near miss. */
export function search(q: string, limit = 30, filter?: (e: Entry) => boolean): Entry[] {
  const n = norm(q)
  if (!n) return []
  const scored: [number, Entry][] = []
  for (const e of entries.value) {
    if (filter && !filter(e)) continue
    let best = score(e.name, n)
    for (const a of e.aliases) best = Math.max(best, score(a, n) - 5)
    if (best > 0) scored.push([best, e])
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name)).slice(0, limit).map(x => x[1])
}

export interface TextHit { e: Entry; before: string; hit: string; after: string }

/** The text an entry shows, as plain text: in player mode without DM-only blocks; links as their labels. */
function plainBody(e: Entry): string {
  const body = playerMode.value ? stripSecrets(e.body) : e.body
  return body
    .replace(/\[\[([^\]|]+?)\\?\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, (_, id: string) => id.replace(/-/g, ' '))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ').replace(/:::\w*/g, ' ').replace(/^[#>\-*+\s]+|[*_`~]|\[[ xX]\]/gm, '').replace(/\s+/g, ' ')
}

/** Entries whose text holds every typed word (from 3 letters on), the exact phrase first, with an excerpt around it. */
export function fullText(q: string, limit = 8, filter?: (e: Entry) => boolean): TextHit[] {
  const qs = words(norm(q))
  if (norm(q).length < 3 || !qs.length) return []
  const phrase = qs.join(' ')
  const hits: (TextHit & { exact: boolean })[] = []
  for (const e of entries.value) {
    if (!e.body || (filter && !filter(e))) continue
    const text = plainBody(e)
    // compare in lower case without accents and apostrophes, other punctuation as spaces, keeping a map back to the text
    const keep: number[] = []
    let flat = ''
    for (let i = 0; i < text.length; i++) {
      const c = text[i].normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      if (/['\u2019\u2018`\u00b4]/.test(c)) continue
      for (const ch of c) { flat += /[a-z0-9]/.test(ch) ? ch : ' '; keep.push(i) }
    }
    if (!qs.every(w => flat.includes(w))) continue
    const exact = qs.length > 1 && flat.includes(phrase)
    const what = exact ? phrase : qs[0]
    const at = flat.indexOf(what)
    const from = keep[at], to = keep[at + what.length - 1] + 1
    const start = Math.max(0, from - 50)
    hits.push({ e, exact, before: (start ? '\u2026' : '') + text.slice(start, from), hit: text.slice(from, to), after: text.slice(to, to + 70) + (to + 70 < text.length ? '\u2026' : '') })
  }
  return hits.sort((a, b) => Number(b.exact) - Number(a.exact)).slice(0, limit)
}
