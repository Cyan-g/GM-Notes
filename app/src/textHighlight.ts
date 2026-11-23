// Links and secrets in text being written, as LinkTextarea draws them behind the text: [[entry]] links (missing ones
// apart), web links ([text](https://…) and bare addresses) and :::secret blocks; and what the link at the caret is.
import { get } from './store'
import { entryByName } from './lookup'
import { SECRET_BLOCK } from './model/text'
import type { Entry } from './model/types'

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
/** [[id]] or [[id|label]]; [text](url), not a picture's ![](…); a bare web address (not the full stop after it). */
const LINK = /\[\[([^\]\n]*)\]\]|(?<!!)\[[^\]\n]*\]\((?:https?:\/\/|mailto:)[^)\s]*\)|https?:\/\/[^\s<>()[\]]*[^\s<>()[\].,;:!?'\x22]/g

/** The entry an [[…]] link's inside points to: its id (as the [[ suggestions write it), else a name typed by hand. */
export function linkTarget(inner: string): Entry | undefined {
  const id = inner.split(/\\?\|/)[0].trim()
  return id ? get(id) ?? entryByName(id) : undefined
}

function inline(s: string): string {
  let out = '', last = 0
  for (const m of s.matchAll(LINK)) {
    out += esc(s.slice(last, m.index))
    const cls = m[1] != null ? (linkTarget(m[1]) ? 'lt-link' : 'lt-link missing') : 'lt-web'
    out += `<span class="${cls}">${esc(m[0])}</span>`
    last = m.index! + m[0].length
  }
  return out + esc(s.slice(last))
}

/** The text as HTML with its links and secret blocks marked (the same characters, so it lines up with the textarea). */
export function highlightHtml(text: string): string {
  let out = '', last = 0
  for (const m of text.matchAll(SECRET_BLOCK)) {
    out += inline(text.slice(last, m.index))
    out += `<span class="lt-secret">${inline(m[0])}</span>`
    last = m.index! + m[0].length
  }
  out += inline(text.slice(last))
  // a last empty line still takes its height
  return text.endsWith('\n') || !text ? out + ' ' : out
}

/** The link the caret is in (or right after): an entry link with its entry (none: points to nothing), or a web link. */
export function linkAt(text: string, pos: number): { entry: true; inner: string; e?: Entry } | { entry: false; url: string } | undefined {
  if (pos < 0) return undefined
  for (const m of text.matchAll(LINK)) {
    const a = m.index!, b = a + m[0].length
    if (a > pos) break
    if (pos > b || pos === a) continue
    if (m[1] != null) return { entry: true, inner: m[1], e: linkTarget(m[1]) }
    return { entry: false, url: m[0].match(/\((\S+)\)$/)?.[1] ?? m[0] }
  }
  return undefined
}
