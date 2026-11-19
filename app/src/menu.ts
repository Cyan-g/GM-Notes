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

function entriesOf(t: EntryType, only?: (e: Entry) => boolean): MenuNode[] {
  const list = [...(byType.value.get(t) ?? [])].filter(e => !only || only(e))
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

/** The table a type opens: its dashboard view where it has one (richer columns, views as tabs), else its list page. */
const TYPE_TABLE: Partial<Record<EntryType, [string, string?]>> = {
  npc: ['people', 'All NPCs'], pc: ['people', 'Player characters'], organization: ['people', 'Organizations'],
  spell: ['spells'], item: ['armory'],
}
export const hrefTable = (t: EntryType) => { const d = TYPE_TABLE[t]; return d ? hrefDashboard(d[0], d[1]) : hrefList(t) }

/** A type: click it for its table; its submenu has "New …" and the entries (`only` narrows them). */
function typeNode(t: EntryType, only?: (e: Entry) => boolean): MenuNode {
  const s = info(t)
  const n = byType.value.get(t)?.length ?? 0
  return {
    label: s.plural, typeIcon: t, href: hrefTable(t), hint: String(n),
    children: () => [
      { label: `New ${s.label.toLowerCase()}…`, action: () => newEntry(t) },
      ...(n ? [SEP, ...entriesOf(t, only)] : []),
    ],
  }
}

/** `owns` says whether the open page belongs to this menu, so its title can be marked. */
/** `home`: the menu's own dashboard, opened by clicking the title (hovering shows the menu). */
/** `player`: shown in player mode too; `playerOnly`: shown only there. */
export interface TopMenu { title: string; items: () => MenuNode[]; owns: (r: Route) => boolean; home?: string; player?: boolean; playerOnly?: boolean }

/** The item kinds that belong to crafting (their own menu; Archive › Items leaves them out). */
const CRAFT_KINDS = ['Ingredient', 'Potion', 'Poison', 'Scroll']

/** The spellbook and recipes in use (the current character's or the world's), for the menu hints; never creates them. */
const charSheet = () => currentPc.value?.fields.sheet
const bookNow = () => (currentPc.value ? charSheet()?.spellbook : state.db?.spellbook)
const benchKnown = () => (currentPc.value ? charSheet()?.crafting?.known.length : state.db?.crafting?.known.length)
const typeOf = (r: Route) => (r.name === 'list' ? r.type : r.name === 'entry' ? get(r.id)?.type : undefined)
const dashOf = (r: Route) => (r.name === 'dashboard' ? r.id : undefined)
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
    // The world's places, cascading by "Located in" (Eldoria › Ardenvale › Desolation), then the table of places and the events.
    items: () => [{ label: 'Atlas', icon: '🗺', href: '#/atlas' }, { label: 'Timeline', icon: '⏳', href: '#/atlas/timeline' }, { label: 'Calendar', icon: '📅', href: '#/calendar' }, SEP,
      ...entriesOf('place'),
      { label: 'New place…', icon: '＋', action: () => newEntry('place') }, SEP,
      { label: 'All places', typeIcon: 'place', href: hrefList('place'), hint: String(byType.value.get('place')?.length ?? 0) },
      typeNode('event')],
  },
  {
    title: 'People',
    home: '#/organizations',
    owns: r => r.name === 'orgs' || dashOf(r) === 'people' || ['npc', 'organization'].includes(typeOf(r) ?? ''),
    // The overview, then NPCs and organizations (cascading by "Part of"); each opens its table. Characters are in
    // the Campaign menu.
    items: () => [{ label: 'Overview', icon: '👥', href: '#/organizations' }, SEP, typeNode('npc'), typeNode('organization')],
  },
  {
    title: 'Spells',
    home: '#/spellbook',
    owns: r => typeOf(r) === 'spell' || dashOf(r) === 'spells' || r.name === 'spellbook',
    // The spellbook and the spell tables (one link: Cantrips and Leveled are its tabs), then every spell by level.
    items: () => [
      { label: 'Spellbook', icon: '📖', href: '#/spellbook', hint: bookNow() ? `${bookNow()!.prepared.length} prepared` : undefined },
      { label: 'All spells', typeIcon: 'spell', href: hrefTable('spell'), hint: String(byType.value.get('spell')?.length ?? 0) },
      SEP,
      { label: 'New spell…', icon: '＋', action: () => newEntry('spell') },
      ...entriesOf('spell'),
    ],
  },
  {
    title: 'Crafting',
    home: '#/crafting',
    owns: r => dashOf(r) === 'crafting' || r.name === 'crafting' || (r.name === 'entry' && CRAFT_KINDS.includes(String(get(r.id)?.fields.kind ?? ''))),
    items: () => [
      { label: 'Workbench', icon: '⚗️', href: '#/crafting', hint: benchKnown() != null ? `${benchKnown()} recipes` : undefined },
      { label: 'Recipes & ingredients', icon: '📋', href: hrefDashboard('crafting') },
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
    // Items (opening the armory tables; crafting kinds are in the Crafting menu), every kind of entry kept for reference,
    // and the dropdown lists.
    items: () => [typeNode('item', e => !CRAFT_KINDS.includes(String(e.fields.kind ?? ''))),
      ...(['creature', 'deity', 'race', 'feat', 'subclass', 'writing', 'note'] as EntryType[]).map(t => typeNode(t)), SEP,
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
      { label: 'All characters', typeIcon: 'pc', href: hrefTable('pc'), hint: String((byType.value.get('pc') ?? []).length) },
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
