// What the top menu bar shows: links to pages and tables only, never single entries (those are reached from their
// tables, search and links). The one exception is the Campaign menu's "Latest session" shortcut.
import { nextSessionNo, sessionsOf } from './sessions'
import { SCHEMA } from './model/schema'
import type { Entry, EntryType } from './model/types'
import { computed } from 'vue'
import { byType, get, playerMode, state } from './store'
import { currentPc } from './sheet'
import { hrefDashboard, hrefEntry, hrefList, type Route } from './router'
import { SPELL_LEVEL_TABS } from './dashboards'
import { newEntry } from './ui'
import type { UiIcon } from './icons/ui'

export interface MenuNode {
  label: string
  icon?: string
  /** An entry type whose icon is shown (instead of `icon`). */
  typeIcon?: EntryType
  /** An app icon (game-icons.net) shown instead of `icon`. */
  uiIcon?: UiIcon
  href?: string
  action?: () => void
  /** Shown greyed on the right (a count, a shortcut). */
  hint?: string
  children?: () => MenuNode[]
  separator?: boolean
}

const SEP: MenuNode = { label: '', separator: true }
const info = (t: EntryType) => SCHEMA.find(s => s.type === t)!
const count = (t: EntryType, only?: (e: Entry) => boolean) => String((byType.value.get(t) ?? []).filter(e => !only || only(e)).length)

/** The table a type opens: its dashboard view where it has one (richer columns, views as tabs), else its list page. */
const TYPE_TABLE: Partial<Record<EntryType, [string, string?]>> = {
  npc: ['people', 'All NPCs'], pc: ['people', 'Player characters'], organization: ['people', 'Organizations'],
  spell: ['spells'], item: ['armory'],
}
export const hrefTable = (t: EntryType) => { const d = TYPE_TABLE[t]; return d ? hrefDashboard(d[0], d[1]) : hrefList(t) }

/** A type's table, as a menu link. */
const typeLink = (t: EntryType): MenuNode => ({ label: info(t).plural, typeIcon: t, href: hrefTable(t), hint: count(t) })
/** A dashboard view, as a menu link. */
const viewLink = (dash: string, view: string, uiIcon: UiIcon, hint?: string): MenuNode => ({ label: view, uiIcon, href: hrefDashboard(dash, view), hint })
const kindCount = (...k: string[]) => count('item', e => k.includes(String(e.fields.kind ?? '')))

/** `owns` says whether the open page belongs to this menu, so its title can be marked. */
/** `home`: the menu's own dashboard, opened by clicking the title (hovering shows the menu). */
/** `player`: shown in player mode too; `playerOnly`: shown only there. */
export interface TopMenu { title: string; items: () => MenuNode[]; owns: (r: Route) => boolean; home?: string; player?: boolean; playerOnly?: boolean }

/** The item kinds that belong to crafting (their own menu; the Archive's item tables leave them out). */
const CRAFT_KINDS = ['Ingredient', 'Potion', 'Poison', 'Scroll']

/** The spellbook and recipes in use (the current character's or the world's), for the menu hints; never creates them. */
const charSheet = () => currentPc.value?.fields.sheet
const bookNow = () => (currentPc.value ? charSheet()?.spellbook : state.db?.spellbook)
const benchKnown = () => (currentPc.value ? charSheet()?.crafting?.known.length : state.db?.crafting?.known.length)
const typeOf = (r: Route) => (r.name === 'list' ? r.type : r.name === 'entry' ? get(r.id)?.type : undefined)
const dashOf = (r: Route) => (r.name === 'dashboard' ? r.id : undefined)

/** The campaign being played (the one with the most sessions) and its latest session. */
function playing() {
  const sessions = byType.value.get('session') ?? []
  const camps = (byType.value.get('campaign') ?? []).map(c => ({ c, s: sessions.filter(x => x.fields.campaign === c.id) })).sort((a, b) => b.s.length - a.s.length)
  const top = camps[0]
  if (!top?.s.length) return undefined
  const latest = sessionsOf(top.c.id).at(-1)!
  return { campaign: top.c, latest, next: nextSessionNo(top.c.id) }
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
    // The latest session of the campaign being played and a new one, then the tables. Players keep only their
    // campaigns; their character has a menu of its own.
    items: () => playerMode.value ? [...sessionNodes(), typeLink('campaign')] : [
      ...sessionNodes(),
      typeLink('campaign'),
      { label: 'Combat', uiIcon: 'combat', href: '#/tracker', hint: state.db?.tracker?.round ? `R${state.db.tracker.round}` : undefined },
      typeLink('encounter'),
      typeLink('pc'),
    ],
  },
  {
    title: 'World',
    home: '#/atlas',
    player: true,
    owns: r => r.name === 'atlas' || r.name === 'calendar' || ['place', 'event'].includes(typeOf(r) ?? ''),
    items: () => [
      { label: 'Atlas', uiIcon: 'atlas', href: '#/atlas' },
      { label: 'Timeline', uiIcon: 'timeline', href: '#/atlas/timeline' },
      { label: 'Calendar', uiIcon: 'calendar', href: '#/calendar' },
      SEP, typeLink('place'), typeLink('event'),
    ],
  },
  {
    title: 'People',
    home: '#/organizations',
    // players keep track of the NPCs and organizations they meet, shared by the DM or their own
    player: true,
    owns: r => r.name === 'orgs' || dashOf(r) === 'people' || ['npc', 'organization'].includes(typeOf(r) ?? ''),
    // Characters are in the Campaign menu.
    items: () => [{ label: 'Overview', uiIcon: 'overview', href: '#/organizations' }, SEP, typeLink('npc'), typeLink('organization')],
  },
  {
    title: 'Spells',
    home: '#/spellbook',
    owns: r => typeOf(r) === 'spell' || dashOf(r) === 'spells' || r.name === 'spellbook',
    items: () => [
      { label: 'Spellbook', uiIcon: 'spellbook', href: '#/spellbook', hint: bookNow() ? `${bookNow()!.prepared.length} prepared` : undefined },
      SEP,
      { label: 'All spells', typeIcon: 'spell', href: hrefDashboard('spells', 'All spells'), hint: count('spell') },
      viewLink('spells', 'Cantrips', 'cantrips', count('spell', e => e.fields.level === 'Cantrip')),
      {
        label: 'By level', uiIcon: 'leveled', hint: count('spell', e => e.fields.level !== 'Cantrip'),
        children: () => SPELL_LEVEL_TABS.map((t, i) => ({ label: t, href: hrefDashboard('spells', t), hint: count('spell', e => e.fields.level === String(i + 1)) })),
      },
    ],
  },
  {
    title: 'Crafting',
    home: '#/crafting',
    owns: r => dashOf(r) === 'crafting' || r.name === 'crafting' || (r.name === 'entry' && CRAFT_KINDS.includes(String(get(r.id)?.fields.kind ?? ''))),
    items: () => [
      { label: 'Workbench', uiIcon: 'workbench', href: '#/crafting', hint: benchKnown() != null ? `${benchKnown()} recipes` : undefined },
      SEP,
      viewLink('crafting', 'Recipes', 'recipes', count('item', e => !!e.fields.recipe?.length)),
      viewLink('crafting', 'Ingredients', 'ingredients', kindCount('Ingredient')),
      viewLink('crafting', 'Potions & poisons', 'potions', kindCount('Potion', 'Poison')),
      viewLink('crafting', 'Scrolls', 'scrolls', kindCount('Scroll')),
    ],
  },
  {
    title: 'Archive',
    owns: r => dashOf(r) === 'armory' || r.name === 'lists' || (['item', 'creature', 'deity', 'race', 'feat', 'subclass', 'writing', 'note'].includes(typeOf(r) ?? '') && !(r.name === 'entry' && CRAFT_KINDS.includes(String(get(r.id)?.fields.kind ?? '')))),
    // The item tables (crafting kinds are in the Crafting menu), every kind of entry kept for reference, the dropdown lists.
    items: () => [
      viewLink('armory', 'Weapons', 'weapons', kindCount('Weapon')),
      viewLink('armory', 'Armor', 'armor', kindCount('Armor')),
      viewLink('armory', 'Tools', 'tools', kindCount('Tool')),
      viewLink('armory', 'Other items', 'otherItems'),
      SEP,
      ...(['creature', 'deity', 'race', 'feat', 'subclass', 'writing', 'note'] as EntryType[]).map(typeLink),
      SEP,
      { label: 'Lists', uiIcon: 'lists', href: '#/lists', hint: 'dropdown options' },
    ],
  },
  {
    // Player mode: the characters, each page being their sheet.
    title: 'Character',
    player: true,
    playerOnly: true,
    // Clicking the title opens the current character's sheet.
    get home() { return currentPc.value ? hrefEntry(currentPc.value.id) : undefined },
    owns: r => typeOf(r) === 'pc',
    items: () => [
      { label: 'New character…', icon: '＋', action: () => newEntry('pc') },
      { label: 'All characters', typeIcon: 'pc', href: hrefTable('pc'), hint: count('pc') },
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
