// Markdown rendering with [[id|label]] links, :::secret blocks, callout boxes (> [!note]) and images from the data folder.
// Text may hold HTML (a table, a <details>), but it comes from imported files and the DM's publishes too, so what's
// rendered is cleaned (DOMPurify): no scripts, event handlers (onerror=…), frames, forms or javascript: links.
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import { get, hiddenFromPlayers, playerMode, state } from './store'
import { hrefEntry } from './router'
import { SECRET_BLOCK } from './model/text'

const md = new MarkdownIt({ html: true, linkify: true, breaks: true })

// [[id]] / [[id|label]] / [[id\|label]] (inside tables)
md.inline.ruler.before('link', 'wikilink', (state, silent) => {
  const src = state.src, pos = state.pos
  if (src.charCodeAt(pos) !== 0x5b || src.charCodeAt(pos + 1) !== 0x5b) return false
  const end = src.indexOf(']]', pos + 2)
  if (end < 0) return false
  if (!silent) {
    const inner = src.slice(pos + 2, end)
    const [id, ...rest] = inner.split(/\\?\|/)
    const found = get(id.trim())
    // in player mode an entry players don't know isn't a link (just its words)
    const e = hiddenFromPlayers(found) ? undefined : found
    const label = rest.join('|') || found?.name || id
    if (found && !e) {
      state.push('text', '', 0).content = label
    } else if (e) {
      const open = state.push('link_open', 'a', 1)
      open.attrSet('href', hrefEntry(e.id))
      open.attrSet('class', 'wl')
      state.push('text', '', 0).content = label
      state.push('link_close', 'a', -1)
    } else {
      const open = state.push('span_open', 'span', 1)
      open.attrSet('class', 'wl missing')
      open.attrSet('title', 'No entry with this id')
      state.push('text', '', 0).content = label
      state.push('span_close', 'span', -1)
    }
  }
  state.pos = end + 2
  return true
})

// Checklist items ("- [ ] open", "- [x] done") become checkboxes, numbered in order (see checklist.ts); they can be
// ticked only where the page passes `tasks: true`.
md.core.ruler.after('inline', 'tasks', st => {
  const env = st.env as { tasks?: boolean; taskN?: number }
  const toks = st.tokens
  for (let i = 2; i < toks.length; i++) {
    const t = toks[i]
    if (t.type !== 'inline' || toks[i - 1].type !== 'paragraph_open' || toks[i - 2].type !== 'list_item_open') continue
    const first = t.children?.[0]
    const m = first?.type === 'text' ? first.content.match(/^\[([ xX])\](\s+|$)/) : null
    if (!m || !first) continue
    const n = env.taskN = (env.taskN ?? -1) + 1
    first.content = first.content.slice(m[0].length)
    const box = new st.Token('html_inline', '', 0)
    box.content = `<input type="checkbox" class="task" data-task="${n}"${m[1] === ' ' ? '' : ' checked'}${env.tasks ? '' : ' disabled'}>`
    t.children!.unshift(box)
    toks[i - 2].attrJoin('class', 'task-item')
    if (m[1] !== ' ') toks[i - 2].attrJoin('class', 'done')
  }
})

// Images and files inside the data folder are resolved after rendering (see MarkdownView).
const defaultImage = md.renderer.rules.image!
md.renderer.rules.image = (tokens, idx, opts, env, self) => {
  const t = tokens[idx]
  const src = String(t.attrGet('src') ?? '')
  if (/^(images|files)\//.test(src)) {
    t.attrSet('data-path', decodeURI(src))
    t.attrSet('src', '')
    t.attrSet('loading', 'lazy')
  }
  return defaultImage(tokens, idx, opts, env, self)
}
const defaultLink = md.renderer.rules.link_open ?? ((tokens, idx, opts, _env, self) => self.renderToken(tokens, idx, opts))
md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
  const t = tokens[idx]
  const href = String(t.attrGet('href') ?? '')
  if (/^files\//.test(href)) { t.attrSet('data-path', decodeURI(href)); t.attrSet('href', '#'); t.attrSet('class', 'file') }
  else if (/^https?:/.test(href)) t.attrSet('target', '_blank')
  return defaultLink(tokens, idx, opts, env, self)
}

/**
 * Headings with nothing under them (the next heading is the same level or higher, or the text ends) aren't shown:
 * an outline started and not filled in yet ("-" placeholders count as nothing). The text keeps them. Code blocks are left alone.
 */
function dropEmptyHeadings(lines: string[], keepEnd = false): string[] {
  const level = (l: string) => l.match(/^(#{1,6})\s/)?.[1].length ?? 0
  const fence: boolean[] = []
  let inFence = false
  for (const l of lines) { if (/^\s*(```|~~~)/.test(l)) inFence = !inFence; fence.push(inFence) }
  // a lone "-" (an outline's placeholder, an empty bullet) counts as nothing and isn't shown
  const blank = (i: number) => !fence[i] && /^\s*[-–—*]?\s*$/.test(lines[i])
  return lines.filter((l, i) => {
    const n = level(l)
    if (fence[i]) return true
    if (!n) return !(l.trim() && blank(i))
    let j = i + 1
    while (j < lines.length && blank(j)) j++
    if (j >= lines.length) return keepEnd
    const next = fence[j] ? 0 : level(lines[j])
    return !(next && next <= n)
  })
}

/** Turn callout boxes ("> [!tip] Title", foldable with + or -) and :::secret blocks into HTML before parsing. */
function preprocess(src: string, keepEnd = false): string {
  // Player mode never shows DM-only text.
  src = src.replace(SECRET_BLOCK, (_, inner) => playerMode.value ? '' : `<div class="secret"><span class="secret-tag">DM only</span>\n\n${inner}\n\n</div>`)
  // "- 24. August 892" is a date, not a list numbered from 24
  const months = state.db?.meta.calendar?.months.map(m => m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) ?? []
  if (months.length) src = src.replace(new RegExp(`^(\\s*(?:[-*+]\\s+)?)(\\d+)\\.(?=[ \\t]+(?:${months.join('|')})\\b)`, 'gm'), '$1$2\\.')
  const lines = dropEmptyHeadings(src.split('\n'), keepEnd)
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^>\s*\[!([\w-]+)\]([+-]?)\s*(.*)$/)
    if (!m) { out.push(lines[i]); continue }
    const body: string[] = []
    let j = i + 1
    while (j < lines.length && lines[j].startsWith('>')) { body.push(lines[j].replace(/^>\s?/, '')); j++ }
    const kind = m[1].toLowerCase(), title = m[3] || kind[0].toUpperCase() + kind.slice(1)
    const tag = m[2] ? 'details' : 'div'
    const head = m[2] ? `<summary>${md.renderInline(title)}</summary>` : `<div class="callout-title">${md.renderInline(title)}</div>`
    out.push(`<${tag} class="callout callout-${kind}"${m[2] === '+' ? ' open' : ''}>${head}\n\n${body.join('\n')}\n\n</${tag}>`)
    i = j - 1
  }
  return out.join('\n')
}

/** Rendered HTML without anything that runs code; links may still open in a new window (target), pictures load lazily. */
const clean = (html: string) => DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'loading'], FORBID_TAGS: ['style', 'form', 'button', 'textarea', 'select'] })
export const renderMarkdown = (src: string, opts: { tasks?: boolean; keepEnd?: boolean } = {}) => clean(md.render(preprocess(src || '', !!opts.keepEnd), { tasks: !!opts.tasks }))
export const renderInline = (src: string) => clean(md.renderInline(src || ''))
