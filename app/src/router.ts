// Tiny hash router: #/ , #/t/<type> , #/e/<id> , #/e/<id>/edit , #/atlas/timeline , #/d/<dashboard>/<view>
import { reactive } from 'vue'
import type { EntryType, Id } from './model/types'

/** A person's second tabs: the family tree, and a character's spellbook and workbench. */
export type EntryTab = 'family' | 'inventory' | 'spellbook' | 'crafting'
const TABS: EntryTab[] = ['family', 'inventory', 'spellbook', 'crafting']
export type Route =
  | { name: 'home' }
  | { name: 'list'; type: EntryType }
  | { name: 'entry'; id: Id; edit: boolean; tab?: EntryTab }
  | { name: 'calendar'; year?: number; month?: number; edit?: boolean }
  | { name: 'tracker' }
  | { name: 'spellbook' }
  | { name: 'crafting' }
  | { name: 'atlas'; tab?: 'timeline' }
  | { name: 'orgs' }
  | { name: 'data' }
  | { name: 'lists' }
  | { name: 'rules' }
  | { name: 'wizard' }
  | { name: 'map'; id: Id; pin?: string }
  | { name: 'dashboard'; id: string; view?: string }

function parse(): Route {
  const [, kind, arg, extra] = location.hash.replace(/^#/, '').split('/').map(decodeURIComponent)
  // The timeline lives on the Atlas now; old #/timeline links still land there.
  if (kind === 'timeline') return { name: 'atlas', tab: 'timeline' }
  if (kind === 'calendar' && arg === 'edit') return { name: 'calendar', edit: true }
  if (kind === 'calendar') return { name: 'calendar', year: arg ? Number(arg) : undefined, month: extra ? Number(extra) : undefined }
  if (kind === 'tracker') return { name: 'tracker' }
  if (kind === 'spellbook') return { name: 'spellbook' }
  if (kind === 'crafting') return { name: 'crafting' }
  if (kind === 'atlas') return { name: 'atlas', tab: arg === 'timeline' ? 'timeline' : undefined }
  if (kind === 'organizations') return { name: 'orgs' }
  if (kind === 'data') return { name: 'data' }
  if (kind === 'lists') return { name: 'lists' }
  if (kind === 'rules') return { name: 'rules' }
  if (kind === 'new-character') return { name: 'wizard' }
  if (kind === 'map' && arg) return { name: 'map', id: arg, pin: extra }
  if (kind === 'd' && arg) return { name: 'dashboard', id: arg, view: extra }
  if (kind === 't' && arg) return { name: 'list', type: arg as EntryType }
  if (kind === 'e' && arg) return { name: 'entry', id: arg, edit: extra === 'edit', tab: TABS.includes(extra as EntryTab) ? (extra as EntryTab) : undefined }
  return { name: 'home' }
}

export const route = reactive({ current: parse() as Route })

// ---- going back: each page visited in this window is numbered in its history entry, so the app knows whether
// there is a page to go back to (the browser doesn't say) ----
const stepOf = () => (history.state as { step?: number } | null)?.step
if (stepOf() == null) history.replaceState({ ...(history.state ?? {}), step: 0 }, '')
let lastStep = stepOf() ?? 0
/** Whether there's an earlier page to go back to in this window. */
export const nav = reactive({ canBack: lastStep > 0 })
export const goBack = () => { if (nav.canBack) history.back() }
export const goForward = () => history.forward()

window.addEventListener('hashchange', () => {
  // a page reached by a link or by typing has no number yet: it comes one after the page it was opened from
  if (stepOf() == null) history.replaceState({ ...(history.state ?? {}), step: lastStep + 1 }, '')
  lastStep = stepOf() ?? 0
  nav.canBack = lastStep > 0
  const prev = route.current
  route.current = parse()
  const same = prev.name === 'entry' && route.current.name === 'entry' && prev.id === route.current.id
  if (!same) window.scrollTo(0, 0)
})

export const hrefEntry = (id: Id, edit = false) => `#/e/${encodeURIComponent(id)}${edit ? '/edit' : ''}`
/** A person's family tree tab. */
export const hrefFamily = (id: Id) => `#/e/${encodeURIComponent(id)}/family`
/** A character's Spellbook or Workbench tab. */
export const hrefTab = (id: Id, tab: EntryTab) => `#/e/${encodeURIComponent(id)}/${tab}`
export const hrefList = (type: EntryType) => `#/t/${type}`
/** The character creation wizard. */
export const hrefWizard = '#/new-character'
export const go = (href: string) => { location.hash = href.replace(/^#/, '') }
export const hrefDashboard = (id: string, view?: string) => `#/d/${id}${view ? '/' + encodeURIComponent(view) : ''}`
export const hrefMap = (id: Id, pin?: string) => `#/map/${encodeURIComponent(id)}${pin ? '/' + pin : ''}`
