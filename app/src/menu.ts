// What the top menu bar shows. Children are built lazily, only when a submenu opens.
import { SCHEMA, byKey } from './model/schema'
import { optionLabel, listOptions } from './store'
import type { Entry, EntryType } from './model/types'
import { computed } from 'vue'
import { byType, childrenOf, get, playerMode, state } from './store'
import { currentPc } from './sheet'
import type { CharacterSheet } from './model/types'
import { hrefDashboard, hrefEntry, hrefList, type Route } from './router'
import { newEntry } from './ui'
import { DASHBOARDS } from './dashboards'

export interface MenuNode {
  label: string
  icon?: string
  /** An entry type whose icon is shown (instead of `icon`). */
  typeIcon?: EntryType
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

const refName = (e: Entry, key: string) => get(byKey(e.fields)[key] as string)?.name ?? ''
const bySession = (a: Entry, b: Entry) => (Number(a.fields.number) || 0) - (Number(b.fields.number) || 0) || byName(a, b)

function entriesOf(t: EntryType): MenuNode[] {
  const list = [...(byType.value.get(t) ?? [])]
  switch (t) {
    case 'place':
    case 'organization':
    case 'race':
      return list.filter(e => get(e.fields.parent)?.type !== t).sort(byName).map(treeNode)
    case 'session':
      return grouped(list, e => refName(e, 'campaign'), undefined, bySession)
    case 'encounter':
    case 'note':
      return grouped(list, e => refName(e, 'campaign'))
    case 'item':
      return grouped(list, e => optionLabel('item.kind', e.fields.kind ?? ''), listOptions('item.kind').map(o => o.label))
    case 'spell':
      return grouped(list, e => (e.fields.level === 'Cantrip' ? 'Cantrips' : e.fields.level ? `Level ${e.fields.level}` : ''), ['Cantrips', ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `Level ${n}`)])
    case 'feat':
      return grouped(list, e => optionLabel('feat.category', e.fields.category ?? ''))
    case 'subclass':
      return grouped(list, e => optionLabel('class', e.fields.class ?? ''))
    default:
      return list.sort(byName).map(e => entryNode(e))
  }
}

function typeNode(t: EntryType): MenuNode {
  const s = info(t)
  const n = byType.value.get(t)?.length ?? 0
  return {
    label: s.plural, typeIcon: t, href: hrefList(t), hint: String(n),
    children: () => [
      { label: `All ${s.plural.toLowerCase()}`, href: hrefList(t), hint: String(n) },
      { label: `New ${s.label.toLowerCase()}…`, action: () => newEntry(t) },
      ...(n ? [SEP, ...entriesOf(t)] : []),
    ],
  }
}

/** `owns` says whether the open page belongs to this menu, so its title can be marked. */
/** `home`: the menu's own dashboard, opened by clicking the title (hovering shows the menu). */
/** `player`: shown in player mode too; `playerOnly`: shown only there. */
export interface TopMenu { title: string; items: () => MenuNode[]; owns: (r: Route) => boolean; home?: string; player?: boolean; playerOnly?: boolean }

/** Dashboards that have a top menu of their own, and the item kinds that belong to crafting. */
const OWN_MENU = ['spells', 'crafting', 'people', 'armory']
const CRAFT_KINDS = ['Ingredient', 'Potion', 'Poison', 'Scroll']

/** The spellbook and recipes in use (the current character's or the world's), for the menu hints; never creates them. */
const charSheet = () => currentPc.value?.fields.sheet
const bookNow = () => (currentPc.value ? charSheet()?.spellbook : state.db?.spellbook)
const benchKnown = () => (currentPc.value ? charSheet()?.crafting?.known.length : state.db?.crafting?.known.length)
const typeOf = (r: Route) => (r.name === 'list' ? r.type : r.name === 'entry' ? get(r.id)?.type : undefined)
const dashOf = (r: Route) => (r.name === 'dashboard' ? r.id : undefined)
const dashViews = (id: string, icon = '📋') => {
  const d = DASHBOARDS.find(x => x.id === id)!
  return d.views.map(v => ({ label: v.name, icon, href: hrefDashboard(d.id, v.name) }))
}
const itemsOfKind = (k: string) => (byType.value.get('item') ?? []).filter(e => e.fields.kind === k).sort(byName)
const kindNode = (k: string, plural: string): MenuNode => {
  const list = itemsOfKind(k)
  return { label: plural, hint: String(list.length), children: () => [{ label: `New ${k.toLowerCase()}…`, action: () => newEntry('item', { kind: k }) }, ...(list.length ? [SEP, ...list.map(e => entryNode(e))] : [])] }
}

/** The campaign being played (the one with the most sessions) and its latest session. */
function playing() {
  const sessions = byType.value.get('session') ?? []
  const camps = (byType.value.get('campaign') ?? []).map(c => ({ c, s: sessions.filter(x => x.fields.campaign === c.id) })).sort((a, b) => b.s.length - a.s.length)
  const top = camps[0]
  if (!top?.s.length) return undefined
  const latest = [...top.s].sort((a, b) => (Number(b.fields.number) || 0) - (Number(a.fields.number) || 0))[0]
  return { campaign: top.c, latest, next: (Number(latest.fields.number) || 0) + 1 }
}
/** The latest session and a new one, at the top of the Campaign menu. */
function sessionNodes(): MenuNode[] {
  const p = playing()
  if (!p) return []
  return [
    { label: 'Latest session', typeIcon: 'session', href: hrefEntry(p.latest.id), hint: p.latest.name },
    { label: 'New session…', icon: '＋', hint: p.campaign.name, action: () => newEntry('session', { campaign: p.campaign.id, number: p.next, date: { ...state.db!.meta.today } }) },
    SEP,
  ]
}

export const MENUS: TopMenu[] = [
  {
    title: 'Campaign',
    player: true,
    owns: r => r.name === 'tracker' || ['campaign', 'session', 'encounter', 'pc'].includes(typeOf(r) ?? ''),
    // The latest session of the campaign being played and a new one come first; every session is on its campaign's page.
    // The fight that's running, next to the encounters it's started from. Players keep only their campaigns
    // (and the session notes on them); their character has a menu of its own.
    items: () => playerMode.value ? [...sessionNodes(), typeNode('campaign')] : [
      ...sessionNodes(),
      typeNode('campaign'),
      { label: 'Combat', icon: '⚔', href: '#/tracker', hint: state.db?.tracker?.round ? `R${state.db.tracker.round}` : undefined },
      typeNode('encounter'),
      typeNode('pc'),
    ],
  },
  {
    title: 'World',
    home: '#/atlas',
    player: true,
    owns: r => r.name === 'atlas' || r.name === 'calendar' || ['place', 'event'].includes(typeOf(r) ?? ''),
    // The world's places first, cascading by "Located in" (Eldoria › Ardenvale › Desolation), then the lists.
    items: () => [{ label: 'Atlas', icon: '🗺', href: '#/atlas' }, { label: 'Timeline', icon: '⏳', href: '#/atlas/timeline' }, { label: 'Calendar', icon: '📅', href: '#/calendar' }, SEP, ...entriesOf('place'), SEP, ...(['place', 'event'] as EntryType[]).map(typeNode)],
  },
  {
    title: 'People',
    home: '#/organizations',
    owns: r => r.name === 'orgs' || dashOf(r) === 'people' || ['npc', 'organization'].includes(typeOf(r) ?? ''),
    // The people tables, then NPCs, organizations (cascading by "Part of") and the peoples of the world.
    // (A table named like one of the lists below is left out: the list has its own "All …" link.)
    items: () => {
      const types = ['npc', 'organization'] as EntryType[]
      const plurals: string[] = types.map(t => info(t).plural)
      return [{ label: 'Overview', typeIcon: 'organization', href: '#/organizations', hint: String(state.db ? (byType.value.get('organization')?.length ?? 0) : '') }, SEP,
        ...dashViews('people', '👥').filter(v => !plurals.includes(v.label)), SEP, ...types.map(typeNode)]
    },
  },
  {
    title: 'Spells',
    home: '#/spellbook',
    owns: r => typeOf(r) === 'spell' || dashOf(r) === 'spells' || r.name === 'spellbook',
    // The spell tables first, then every spell by level.
    items: () => [
      { label: 'Spellbook', icon: '📖', href: '#/spellbook', hint: bookNow() ? `${bookNow()!.prepared.length} prepared` : undefined },
      SEP,
      ...dashViews('spells'),
      SEP,
      { label: 'New spell…', action: () => newEntry('spell') },
      ...entriesOf('spell'),
    ],
  },
  {
    title: 'Crafting',
    home: '#/crafting',
    owns: r => dashOf(r) === 'crafting' || r.name === 'crafting' || (r.name === 'entry' && CRAFT_KINDS.includes(String(get(r.id)?.fields.kind ?? ''))),
    items: () => [
      { label: 'Workbench', icon: '⚗️', href: '#/crafting', hint: benchKnown() != null ? `${benchKnown()} recipes` : undefined },
      SEP,
      ...dashViews('crafting'),
      SEP,
      kindNode('Ingredient', 'Ingredients'),
      kindNode('Potion', 'Potions'),
      kindNode('Poison', 'Poisons'),
      kindNode('Scroll', 'Scrolls'),
    ],
  },
  {
    title: 'Archive',
    owns: r => dashOf(r) === 'armory' || r.name === 'lists' || (['item', 'creature', 'deity', 'race', 'feat', 'subclass', 'writing', 'note'].includes(typeOf(r) ?? '') && !(r.name === 'entry' && CRAFT_KINDS.includes(String(get(r.id)?.fields.kind ?? '')))),
    // The armory tables (weapons, armor, other items), every kind of entry kept for reference, and the dropdown lists.
    items: () => [{ label: 'Armory', icon: '⚔️', href: hrefDashboard('armory'), children: () => dashViews('armory') }, SEP,
      ...(['item', 'creature', 'deity', 'race', 'feat', 'subclass', 'writing', 'note'] as EntryType[]).map(typeNode), SEP,
      { label: 'Lists', icon: '☰', href: '#/lists', hint: 'dropdown options' }],
  },
  {
    // Player mode: the characters, each page being their sheet.
    title: 'Character',
    player: true,
    playerOnly: true,
    // Clicking the title opens the current character's sheet.
    get home() { return currentPc.value ? hrefEntry(currentPc.value.id) : undefined },
    owns: r => typeOf(r) === 'pc',
    // Hovering offers only a new character and the list of them all, not every character.
    items: () => [
      { label: 'New character…', icon: '＋', action: () => newEntry('pc') },
      { label: 'All characters', typeIcon: 'pc', href: hrefList('pc'), hint: String((byType.value.get('pc') ?? []).length) },
    ],
  },
]

/** The menus for the current mode. */
export const visibleMenus = computed(() => {
  if (!playerMode.value) return MENUS.filter(m => !m.playerOnly)
  // A player's own character comes first.
  const list = MENUS.filter(m => m.player)
  return [...list.filter(m => m.title === 'Character'), ...list.filter(m => m.title !== 'Character')]
})
