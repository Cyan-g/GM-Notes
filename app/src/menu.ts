// What the top menu bar shows. Children are built lazily, only when a submenu opens.
import { SCHEMA } from './model/schema'
import type { Entry, EntryType } from './model/types'
import { byType, childrenOf, get, state } from './store'
import { hrefDashboard, hrefEntry, hrefList, type Route } from './router'
import { newEntry } from './ui'
import { DASHBOARDS } from './dashboards'

export interface MenuNode {
  label: string
  icon?: string
  href?: string
  action?: () => void
  /** Shown greyed on the right (a count, a shortcut). */
  hint?: string
  children?: () => MenuNode[]
  separator?: boolean
}

const SEP: MenuNode = { label: '', separator: true }
const info = (t: EntryType) => SCHEMA.find(s => s.type === t)!
const byName = (a: Entry, b: Entry) => a.name.localeCompare(b.name)

function entryNode(e: Entry, sub?: () => MenuNode[]): MenuNode {
  return { label: e.name, href: hrefEntry(e.id), children: sub }
}

/** Places and organizations: nested by their "parent" field. */
function treeNode(e: Entry): MenuNode {
  const kids = (childrenOf.value.get(e.id) ?? []).filter(c => c.type === e.type)
  return entryNode(e, kids.length ? () => kids.map(treeNode) : undefined)
}

/** Split a long list into submenus, keeping the groups in the given order. */
function grouped(list: Entry[], key: (e: Entry) => string, order?: string[], sort: (a: Entry, b: Entry) => number = byName): MenuNode[] {
  const groups = new Map<string, Entry[]>()
  for (const e of list) {
    const k = key(e) || 'Other'
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(e)
  }
  // Known groups in their given order, then the rest alphabetically, "Other" last.
  const rank = (n: string) => (n === 'Other' ? 1e9 : order?.includes(n) ? order.indexOf(n) : 1e6)
  const names = [...groups.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  if (names.length < 2) return list.sort(sort).map(e => entryNode(e))
  return names.map(n => {
    const g = groups.get(n)!
    return { label: n, hint: String(g.length), children: () => g.sort(sort).map(e => entryNode(e)) }
  })
}

const refName = (e: Entry, key: string) => get(e.fields[key] as string)?.name ?? ''
const bySession = (a: Entry, b: Entry) => (Number(a.fields.number) || 0) - (Number(b.fields.number) || 0) || byName(a, b)

function entriesOf(t: EntryType): MenuNode[] {
  const list = [...(byType.value.get(t) ?? [])]
  switch (t) {
    case 'place':
      return list.filter(e => get(e.fields.parent as string)?.type !== t).sort(byName).map(treeNode)
    case 'session':
      return grouped(list, e => refName(e, 'campaign'), undefined, bySession)
    case 'encounter':
    case 'note':
      return grouped(list, e => refName(e, 'campaign'))
    case 'item':
      return grouped(list, e => String(e.fields.kind ?? ''), SCHEMA.find(s => s.type === 'item')!.fields.find(f => f.key === 'kind')!.options)
    case 'spell':
      return grouped(list, e => (e.fields.level === 'Cantrip' ? 'Cantrips' : e.fields.level ? `Level ${e.fields.level}` : ''), ['Cantrips', ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `Level ${n}`)])
    case 'subclass':
      return grouped(list, e => String(e.fields.class ?? ''))
    default:
      return list.sort(byName).map(e => entryNode(e))
  }
}

function typeNode(t: EntryType): MenuNode {
  const s = info(t)
  const n = byType.value.get(t)?.length ?? 0
  return {
    label: s.plural, icon: s.icon, href: hrefList(t), hint: String(n),
    children: () => [
      { label: `All ${s.plural.toLowerCase()}`, href: hrefList(t), hint: String(n) },
      { label: `New ${s.label.toLowerCase()}…`, action: () => newEntry(t) },
      ...(n ? [SEP, ...entriesOf(t)] : []),
    ],
  }
}

/** `owns` says whether the open page belongs to this menu, so its title can be marked. */
export interface TopMenu { title: string; items: () => MenuNode[]; owns: (r: Route) => boolean }

/** Dashboards that have a top menu of their own, and the item kinds that belong to crafting. */
const OWN_MENU = ['spells', 'crafting']
const CRAFT_KINDS = ['Ingredient', 'Potion', 'Poison', 'Scroll']

const typeOf = (r: Route) => (r.name === 'list' ? r.type : r.name === 'entry' ? get(r.id)?.type : undefined)
const dashOf = (r: Route) => (r.name === 'dashboard' ? r.id : undefined)
const dashViews = (id: string, icon = '📋') => {
  const d = DASHBOARDS.find(x => x.id === id)!
  return d.views.map(v => ({ label: v.name, icon, href: hrefDashboard(d.id, v.name) }))
}
const itemsOfKind = (k: string) => (byType.value.get('item') ?? []).filter(e => e.fields.kind === k).sort(byName)
const kindNode = (k: string, plural: string): MenuNode => {
  const list = itemsOfKind(k)
  return { label: plural, hint: String(list.length), children: list.length ? () => list.map(e => entryNode(e)) : undefined }
}

export const MENUS: TopMenu[] = [
  {
    title: 'Dashboards',
    owns: r => ['calendar', 'tracker', 'timeline'].includes(r.name) || (!!dashOf(r) && !OWN_MENU.includes(dashOf(r)!)),
    items: () => [
      { label: 'Calendar', icon: '📅', href: '#/calendar' },
      { label: 'Initiative', icon: '⚔', href: '#/tracker', hint: state.db?.tracker?.round ? `R${state.db.tracker.round}` : undefined },
      { label: 'Timeline', icon: '⏳', href: '#/timeline' },
      {
        label: 'Favourites', icon: '★', href: '#/', hint: String(state.db?.meta.favourites?.length ?? 0),
        children: state.db?.meta.favourites?.length
          ? () => (state.db!.meta.favourites ?? []).map(id => get(id)).filter(e => !!e).map(e => ({ label: e!.name, icon: SCHEMA.find(s => s.type === e!.type)!.icon, href: hrefEntry(e!.id) }))
          : undefined,
      },
      SEP,
      ...DASHBOARDS.filter(d => !OWN_MENU.includes(d.id)).map(d => ({
        label: d.title, icon: d.icon, href: hrefDashboard(d.id),
        children: d.views.length > 1 ? () => d.views.map(v => ({ label: v.name, href: hrefDashboard(d.id, v.name) })) : undefined,
      })),
    ],
  },
  {
    title: 'Campaign',
    owns: r => ['campaign', 'session', 'encounter', 'pc'].includes(typeOf(r) ?? ''),
    items: () => (['campaign', 'session', 'encounter', 'pc'] as EntryType[]).map(typeNode),
  },
  {
    title: 'World',
    owns: r => ['place', 'npc', 'organization', 'event', 'deity', 'race'].includes(typeOf(r) ?? ''),
    // The world's places first, cascading by "Located in" (Eldoria › Ardenvale › Desolation), then the lists.
    items: () => [...entriesOf('place'), SEP, ...(['place', 'npc', 'organization', 'event', 'deity', 'race'] as EntryType[]).map(typeNode)],
  },
  {
    title: 'Spells',
    owns: r => typeOf(r) === 'spell' || dashOf(r) === 'spells' || r.name === 'spellbook',
    // The spell tables first, then every spell by level.
    items: () => [
      { label: 'Spellbook', icon: '📖', href: '#/spellbook', hint: state.db?.spellbook ? `${(state.db.spellbook.prepared.length)} prepared` : undefined },
      SEP,
      ...dashViews('spells'),
      SEP,
      ...entriesOf('spell'),
      SEP,
      { label: 'New spell…', action: () => newEntry('spell') },
    ],
  },
  {
    title: 'Crafting',
    owns: r => dashOf(r) === 'crafting' || (r.name === 'entry' && CRAFT_KINDS.includes(String(get(r.id)?.fields.kind ?? ''))),
    items: () => [
      ...dashViews('crafting'),
      SEP,
      kindNode('Ingredient', 'Ingredients'),
      kindNode('Potion', 'Potions'),
      kindNode('Poison', 'Poisons'),
      kindNode('Scroll', 'Scrolls'),
      SEP,
      { label: 'New ingredient…', action: () => newEntry('item', { kind: 'Ingredient' }) },
      { label: 'New potion…', action: () => newEntry('item', { kind: 'Potion' }) },
    ],
  },
  {
    title: 'Archive',
    owns: r => ['item', 'creature', 'subclass', 'writing', 'note'].includes(typeOf(r) ?? '') && !(r.name === 'entry' && CRAFT_KINDS.includes(String(get(r.id)?.fields.kind ?? ''))),
    items: () => (['item', 'creature', 'subclass', 'writing', 'note'] as EntryType[]).map(typeNode),
  },
]
