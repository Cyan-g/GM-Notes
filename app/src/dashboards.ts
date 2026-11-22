// Dashboards: named tables over entries, each with a few views. Add or change views here.
import type { Entry, EntryType } from './model/types'

/** The Spells table's tab for each spell level (1st…9th). */
export const SPELL_LEVEL_TABS = ['1st level', '2nd level', '3rd level', '4th level', '5th level', '6th level', '7th level', '8th level', '9th level']

export interface DashView {
  name: string
  filter: (e: Entry) => boolean
  cols: string[]
  facets?: string[]
  sort?: { key: string; dir: 1 | -1 }
  limit?: number
  /** Type the "New" button creates in this view, and the fields it starts with (Weapons: kind Weapon). */
  creates?: EntryType
  createFields?: Record<string, unknown>
}
export interface Dashboard {
  id: string; title: string; icon: string; views: DashView[]
  /** Shown in place of the emoji: an app icon or an entry type's icon (game-icons.net). */
  uiIcon?: import('./icons/ui').UiIcon; typeIcon?: EntryType
}

const is = (type: EntryType) => (e: Entry) => e.type === type
const kind = (...k: string[]) => (e: Entry) => e.type === 'item' && k.includes(String(e.fields.kind ?? ''))
const CRAFTED = ['Potion', 'Poison', 'Scroll', 'Other']

export const DASHBOARDS: Dashboard[] = [
  {
    id: 'spells', title: 'Spells', icon: '🔮', typeIcon: 'spell', views: [
      { name: 'All spells', filter: is('spell'), cols: ['@spellLevel', 'school', 'castingTime', '@attackSave', 'range', 'duration', '@concRitual', 'classes'], facets: ['level', 'school', '@attackSave', 'classes', 'concentration', 'ritual'], sort: { key: '@spellLevel', dir: 1 }, creates: 'spell' },
      { name: 'Cantrips', filter: e => e.type === 'spell' && e.fields.level === 'Cantrip', cols: ['school', 'castingTime', '@attackSave', 'range', 'duration', '@concRitual', 'classes'], facets: ['school', '@attackSave', 'classes', 'concentration'], creates: 'spell' },
      // a tab per spell level; within one level the level column and filter would say nothing
      ...SPELL_LEVEL_TABS.map((name, i) => ({ name, filter: (e: Entry) => e.type === 'spell' && e.fields.level === String(i + 1), cols: ['school', 'castingTime', '@attackSave', 'range', 'duration', '@concRitual', 'classes'], facets: ['school', '@attackSave', 'classes', 'concentration', 'ritual'], creates: 'spell' as const })),
    ],
  },
  {
    id: 'armory', title: 'Armory', icon: '⚔️', uiIcon: 'weapons', views: [
      { name: 'Weapons', filter: kind('Weapon'), cols: ['weaponCategory', 'subtype', 'damage', 'damageType', 'properties', 'magical', 'value'], facets: ['weaponCategory', 'damageType', 'magical'], sort: { key: 'subtype', dir: 1 }, creates: 'item', createFields: { kind: 'Weapon' } },
      { name: 'Armor', filter: kind('Armor'), cols: ['armorType', 'slot', 'subtype', '@armorClass', 'magical', 'value', 'summary'], facets: ['armorType', 'slot', 'magical'], sort: { key: 'slot', dir: 1 }, creates: 'item', createFields: { kind: 'Armor' } },
      { name: 'Tools', filter: kind('Tool'), cols: ['tool', 'value', 'weight', 'summary'], facets: ['tool'], sort: { key: 'tool', dir: 1 }, creates: 'item', createFields: { kind: 'Tool' } },
      { name: 'Other items', filter: e => e.type === 'item' && !['Weapon', 'Armor', 'Tool', 'Ingredient', 'Potion', 'Poison', 'Scroll'].includes(String(e.fields.kind ?? '')), cols: ['kind', 'subtype', 'magical', 'value', 'summary'], facets: ['kind', 'magical'], sort: { key: 'kind', dir: 1 }, creates: 'item' },
      { name: 'Everything by value', filter: is('item'), cols: ['kind', 'subtype', 'value'], facets: ['kind'], sort: { key: 'value', dir: -1 } },
    ],
  },
  {
    id: 'crafting', title: 'Crafting', icon: '⚗️', uiIcon: 'recipes', views: [
      { name: 'Recipes', filter: e => kind(...CRAFTED)(e) && !!(e.fields.recipe)?.length, cols: ['kind', 'craftingType', '@recipeCost', 'value', '@margin', '@craftTime', 'effect'], facets: ['kind', 'craftingType'], sort: { key: 'craftingType', dir: 1 }, creates: 'item' },
      { name: 'Ingredients', filter: kind('Ingredient'), cols: ['category', 'value', '@usedIn', 'traits', 'summary'], facets: ['category', 'traits'], sort: { key: 'category', dir: 1 }, creates: 'item' },
      { name: 'Potions & poisons', filter: kind('Potion', 'Poison'), cols: ['kind', 'craftingType', 'value', 'effect'], facets: ['kind', 'craftingType'], creates: 'item' },
      { name: 'Scrolls', filter: kind('Scroll'), cols: ['spell', 'rarity', 'value', 'summary'], facets: ['rarity'], creates: 'item' },
    ],
  },
  {
    id: 'people', title: 'People', icon: '👥', uiIcon: 'overview', views: [
      { name: 'All NPCs', filter: is('npc'), cols: ['race', '@lives-in', '@member', '@aliases'], facets: ['race', '@lives-in', '@member'], creates: 'npc' },
      { name: 'Player characters', filter: is('pc'), cols: ['player', '@classes', '@level', '@ac', '@maxHp', '@passives', '@spellDc', 'campaigns'], facets: ['campaigns'], creates: 'pc' },
      { name: 'Organizations', filter: is('organization'), cols: ['orgType', 'parent', 'seat', '@members'], facets: ['orgType'], creates: 'organization' },
    ],
  },
  {
    id: 'recent', title: 'Recently edited', icon: '🕘', uiIcon: 'history', views: [
      { name: 'Last 50 changes', filter: () => true, cols: ['@type', '@updated'], facets: ['@type'], sort: { key: '@updated', dir: 1 }, limit: 50 },
    ],
  },
]
