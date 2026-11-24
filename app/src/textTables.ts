// Markdown tables inside a text, for editing them as grids (TextWithTables, BodyEditor): the text is split into parts —
// plain text, and tables (a header row, the |---| row under it, and the rows after it) — and put back together. A
// table nobody changed keeps its own text (its spacing, its alignment row); a changed one is written out anew.
// No vue here: tests import it directly.

export interface Table { head: string[]; align: string[]; rows: string[][] }
export type Part = { kind: 'text'; text: string } | { kind: 'table'; raw: string; table: Table }

const SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/
const isRow = (l: string) => /\|/.test(l) && l.trim() !== ''
/** A row's cells: split on the pipes that aren't escaped ("\|") or in a link ("[[id|label]]"), without the pipes at its ends. */
export function cells(line: string): string[] {
  let t = line.trim()
  if (t.startsWith('|')) t = t.slice(1)
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1)
  const out: string[] = []
  let cur = ''
  let link = false
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '\\' && t[i + 1] === '|') { cur += '|'; i++; continue }
    if (t.startsWith('[[', i)) link = true
    else if (t.startsWith(']]', i)) link = false
    if (t[i] === '|' && !link) { out.push(cur.trim()); cur = ''; continue }
    cur += t[i]
  }
  out.push(cur.trim())
  return out
}
const fit = (row: string[], n: number) => Array.from({ length: n }, (_, i) => row[i] ?? '')

/** The text in parts: text, then each table with the text between. A table needs a header row and the |---| row. */
export function splitTables(text: string): Part[] {
  const lines = (text ?? '').replace(/\r\n/g, '\n').split('\n')
  const parts: Part[] = []
  let buf: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (isRow(lines[i]) && i + 1 < lines.length && SEP.test(lines[i + 1]) && /\|/.test(lines[i + 1])) {
      let j = i + 2
      while (j < lines.length && isRow(lines[j])) j++
      const head = cells(lines[i]), n = head.length
      const align = fit(cells(lines[i + 1]), n).map(a => a || '---')
      const rows = lines.slice(i + 2, j).map(l => fit(cells(l), n))
      if (buf.length) parts.push({ kind: 'text', text: buf.join('\n') })
      buf = []
      parts.push({ kind: 'table', raw: lines.slice(i, j).join('\n'), table: { head, align, rows } })
      i = j - 1
      continue
    }
    buf.push(lines[i])
  }
  if (buf.length || !parts.length) parts.push({ kind: 'text', text: buf.join('\n') })
  return parts
}

const esc = (c: string) => c.replace(/\|/g, '\\|').replace(/\n/g, ' ')
/** A table as markdown. */
export function tableText(t: Table): string {
  const row = (r: string[]) => `| ${r.map(esc).join(' | ')} |`
  return [row(t.head), `|${t.align.map(a => a || '---').join('|')}|`, ...t.rows.map(row)].join('\n')
}

/** The parts put back together: a blank line between a table and text right next to it. */
export function joinTables(parts: Part[]): string {
  const out: string[] = []
  parts.forEach((p, k) => {
    if (p.kind === 'table') {
      const before = out.length ? out[out.length - 1] : undefined
      if (before != null && before.trim() !== '') out.push('')
      out.push(p.raw)
      const next = parts[k + 1]
      if (next?.kind === 'text' && next.text !== '' && !next.text.startsWith('\n')) out.push('')
    } else if (p.text !== '' || (k > 0 && k < parts.length - 1)) {
      out.push(...p.text.split('\n'))
    }
  })
  return out.join('\n')
}

/** For editing: a text part before and after every table (empty ones are where text can be typed). */
export function editParts(text: string): Part[] {
  const parts = splitTables(text), out: Part[] = []
  parts.forEach(p => {
    if (p.kind === 'table' && out.at(-1)?.kind !== 'text') out.push({ kind: 'text', text: '' })
    out.push(p)
  })
  if (out.at(-1)?.kind === 'table') out.push({ kind: 'text', text: '' })
  return out
}
/** A new table to insert: two columns, one row. */
export const NEW_TABLE = '| Column | Column |\n|:--|:--|\n|  |  |'
