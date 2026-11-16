// Tiny hash router: #/ , #/t/<type> , #/e/<id> , #/e/<id>/edit , #/timeline , #/d/<dashboard>/<view>
import { reactive } from 'vue'
import type { EntryType, Id } from './model/types'

export type Route =
  | { name: 'home' }
  | { name: 'list'; type: EntryType }
  | { name: 'entry'; id: Id; edit: boolean }
  | { name: 'timeline' }
  | { name: 'calendar'; year?: number; month?: number }
  | { name: 'tracker' }
  | { name: 'spellbook' }
  | { name: 'crafting' }
  | { name: 'data' }
  | { name: 'map'; id: Id; pin?: string }
  | { name: 'dashboard'; id: string; view?: string }

function parse(): Route {
  const [, kind, arg, extra] = location.hash.replace(/^#/, '').split('/').map(decodeURIComponent)
  if (kind === 'timeline') return { name: 'timeline' }
  if (kind === 'calendar') return { name: 'calendar', year: arg ? Number(arg) : undefined, month: extra ? Number(extra) : undefined }
  if (kind === 'tracker') return { name: 'tracker' }
  if (kind === 'spellbook') return { name: 'spellbook' }
  if (kind === 'crafting') return { name: 'crafting' }
  if (kind === 'data') return { name: 'data' }
  if (kind === 'map' && arg) return { name: 'map', id: arg, pin: extra }
  if (kind === 'd' && arg) return { name: 'dashboard', id: arg, view: extra }
  if (kind === 't' && arg) return { name: 'list', type: arg as EntryType }
  if (kind === 'e' && arg) return { name: 'entry', id: arg, edit: extra === 'edit' }
  return { name: 'home' }
}

export const route = reactive({ current: parse() as Route })
window.addEventListener('hashchange', () => {
  const prev = route.current
  route.current = parse()
  const same = prev.name === 'entry' && route.current.name === 'entry' && prev.id === route.current.id
  if (!same) window.scrollTo(0, 0)
})

export const hrefEntry = (id: Id, edit = false) => `#/e/${encodeURIComponent(id)}${edit ? '/edit' : ''}`
export const hrefList = (type: EntryType) => `#/t/${type}`
export const go = (href: string) => { location.hash = href.replace(/^#/, '') }
export const hrefDashboard = (id: string, view?: string) => `#/d/${id}${view ? '/' + encodeURIComponent(view) : ''}`
export const hrefMap = (id: Id, pin?: string) => `#/map/${encodeURIComponent(id)}${pin ? '/' + pin : ''}`
