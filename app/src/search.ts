import type { Entry } from './model/types'
import { entries } from './store'

const wordStart = (s: string, n: string) => s.split(/[^a-z0-9]+/).some(w => w.startsWith(n))
const norm = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Name and alias search: exact start beats word start beats anywhere. */
export function search(q: string, limit = 30, filter?: (e: Entry) => boolean): Entry[] {
  const n = norm(q.trim())
  if (!n) return []
  const scored: [number, Entry][] = []
  for (const e of entries.value) {
    if (filter && !filter(e)) continue
    let best = 0
    for (const name of [e.name, ...e.aliases]) {
      const s = norm(name)
      const sc = s === n ? 100 : s.startsWith(n) ? 80 : wordStart(s, n) ? 60 : s.includes(n) ? 40 : 0
      if (sc && name !== e.name) best = Math.max(best, sc - 5)
      else best = Math.max(best, sc)
    }
    if (best) scored.push([best, e])
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name)).slice(0, limit).map(x => x[1])
}

/** Full-text search in names and bodies, for the search page. */
export function fullText(q: string, limit = 100): { e: Entry; snippet: string }[] {
  const n = norm(q.trim())
  if (n.length < 2) return []
  const out: { e: Entry; snippet: string }[] = []
  for (const e of entries.value) {
    const body = e.body
    const i = norm(body).indexOf(n)
    if (i >= 0 || norm(e.name).includes(n)) {
      const plain = i >= 0 ? body.slice(Math.max(0, i - 60), i + n.length + 80).replace(/\[\[[^\]|]+\|?([^\]]*)\]\]/g, '$1') : ''
      out.push({ e, snippet: plain })
      if (out.length >= limit) break
    }
  }
  return out
}
