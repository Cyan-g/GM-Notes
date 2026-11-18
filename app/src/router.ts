// Tiny hash router: #/ , #/t/<type> , #/e/<id> , #/e/<id>/edit , #/atlas/timeline , #/d/<dashboard>/<view>
import { reactive } from 'vue'
import type { EntryType, Id } from './model/types'

export type Route =
  | { name: 'home' }
  | { name: 'list'; type: EntryType }
  | { name: 'entry'; id: Id; edit: boolean; tab?: 'family' }
  | { name: 'calendar'; year?: number; month?: number }
  | { name: 'tracker' }
  | { name: 'spellbook' }
  | { name: 'crafting' }
  | { name: 'atlas'; tab?: 'timeline' }
  | { name: 'orgs' }
  | { name: 'data' }
  | { name: 'lists' }
  | { name: 'map'; id: Id; pin?: string }
  | { name: 'dashboard'; id: string; view?: string }

function parse(): Route {
  const [, kind, arg, extra] = location.hash.replace(/^#/, '').split('/').map(decodeURIComponent)
  // The timeline lives on the Atlas now; old #/timeline links still land there.
  if (kind === 'timeline') return { name: 'atlas', tab: 'timeline' }
  if (kind === 'calendar') return { name: 'calendar', year: arg ? Number(arg) : undefined, month: extra ? Number(extra) : undefined }
  if (kind === 'tracker') return { name: 'tracker' }
  if (kind === 'spellbook') return { name: 'spellbook' }
  if (kind === 'crafting') return { name: 'crafting' }
  if (kind === 'atlas') return { name: 'atlas', tab: arg === 'timeline' ? 'timeline' : undefined }
  if (kind === 'organizations') return { name: 'orgs' }
  if (kind === 'data') return { name: 'data' }
  if (kind === 'lists') return { name: 'lists' }
  if (kind === 'map' && arg) return { name: 'map', id: arg, pin: extra }
  if (kind === 'd' && arg) return { name: 'dashboard', id: arg, view: extra }
  if (kind === 't' && arg) return { name: 'list', type: arg as EntryType }
  if (kind === 'e' && arg) return { name: 'entry', id: arg, edit: extra === 'edit', tab: extra === 'family' ? 'family' : undefined }
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
/** A person's family tree tab. */
export const hrefFamily = (id: Id) => `#/e/${encodeURIComponent(id)}/family`
export const hrefList = (type: EntryType) => `#/t/${type}`
export const go = (href: string) => { location.hash = href.replace(/^#/, '') }
export const hrefDashboard = (id: string, view?: string) => `#/d/${id}${view ? '/' + encodeURIComponent(view) : ''}`
export const hrefMap = (id: Id, pin?: string) => `#/map/${encodeURIComponent(id)}${pin ? '/' + pin : ''}`
