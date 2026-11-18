// Markdown rendering with [[id|label]] links, :::secret blocks, callouts and images from the data folder.
import MarkdownIt from 'markdown-it'
import { get, playerMode } from './store'
import { hrefEntry } from './router'

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
    const e = get(id.trim())
    const label = rest.join('|') || e?.name || id
    if (e) {
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

/** Turn Obsidian-style callouts and :::secret blocks into HTML before parsing. */
function preprocess(src: string): string {
  // Player mode never shows DM-only text.
  src = src.replace(/^:::secret\s*\n([\s\S]*?)\n:::\s*$/gm, (_, inner) => playerMode.value ? '' : `<div class="secret"><span class="secret-tag">DM only</span>\n\n${inner}\n\n</div>`)
  const lines = src.split('\n')
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

export const renderMarkdown = (src: string) => md.render(preprocess(src || ''))
export const renderInline = (src: string) => md.renderInline(src || '')
