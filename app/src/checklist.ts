// Checklists in texts ("- [ ] open", "- [x] done"): ticking one in read mode, and carrying a session's open items
// into the next session. Items are counted in the order they appear, the same order the renderer numbers them.

/** A list item that starts with a box; quotes ("> ") and numbered lists count too. */
const TASK = /^(\s*(?:>\s?)*(?:[-*+]|\d+[.)])\s+)\[([ xX])\](?=\s|$)/

/** Calls `fn` for each checklist line outside fenced code, with its index among the checklist items. */
function eachTask(lines: string[], fn: (line: number, n: number, m: RegExpMatchArray) => void) {
  let fence = '', n = 0
  lines.forEach((l, i) => {
    const f = l.trim().match(/^(`{3,}|~{3,})/)
    if (f) { if (!fence) fence = f[1]; else if (l.trim().startsWith(fence)) fence = ''; return }
    if (fence) return
    const m = l.match(TASK)
    if (m) fn(i, n++, m)
  })
}

/** The text with checklist item `n` ticked or unticked. */
export function toggleTask(src: string, n: number, done: boolean): string {
  const lines = src.split('\n')
  eachTask(lines, (i, k, m) => {
    if (k === n) lines[i] = m[1] + (done ? '[x]' : '[ ]') + lines[i].slice(m[0].length)
  })
  return lines.join('\n')
}

const indentOf = (l: string) => l.match(/^\s*/)![0].replace(/\t/g, '    ').length

/**
 * A new session's text from the previous one: its headings, with the checklist items still open under them.
 * A ticked item goes with everything under it; other text (the log, notes, lists) is left behind.
 * Open items inside a :::secret block stay in one.
 */
export function carryOver(prev: string): string {
  const lines = prev.split('\n')
  const keep = new Set<number>()
  // the items above an item, by indentation: an item is kept only when it and each item above it are open
  let stack: { indent: number; kept: boolean }[] = []
  const tasks = new Map<number, boolean>()
  eachTask(lines, (i, _n, m) => tasks.set(i, m[2] === ' '))
  lines.forEach((l, i) => {
    if (/^#{1,6}\s/.test(l)) { stack = []; return }
    if (!/^\s*(?:[-*+]|\d+[.)])\s/.test(l)) return
    const indent = indentOf(l)
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
    const kept = (!stack.length || stack[stack.length - 1].kept) && tasks.get(i) === true
    stack.push({ indent, kept })
    if (kept) keep.add(i)
  })
  const out: string[] = []
  let secret: string[] | null = null
  const emit = (s: string) => (secret ? secret.push(s) : out.push(s))
  lines.forEach((l, i) => {
    if (/^:::secret\s*$/.test(l.trim())) { secret = []; return }
    if (secret && l.trim() === ':::') { if (secret.length) out.push(':::secret', ...secret, ':::', ''); secret = null; return }
    if (/^#{1,6}\s/.test(l)) {
      if (out.length && out[out.length - 1] !== '') out.push('')
      out.push(l.trimEnd(), '')
    } else if (keep.has(i)) emit(l.trimEnd())
  })
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}
