// Dashboards: named tables over entries, each with a few views. Add or change views here.
import type { Entry, EntryType } from './model/types'

export interface DashView {
  name: string
  filter: (e: Entry) => boolean
  cols: string[]
  facets?: string[]
  sort?: { key: string; dir: 1 | -1 }
  limit?: number
  /** Type the "New" button creates in this view. */
  creates?: EntryType
}
export interface Dashboard { id: string; title: string; icon: string; views: DashView[] }

const is = (type: EntryType) => (e: Entry) => e.type === type
const kind = (...k: string[]) => (e: Entry) => e.type === 'item' && k.includes(String(e.fields.kind ?? ''))
const CRAFTED = ['Potion', 'Poison', 'Scroll', 'Other']

export const DASHBOARDS: Dashboard[] = [
  {
    id: 'spells', title: 'Spells', icon: '🔮', views: [
      { name: 'All spells', filter: is('spell'), cols: ['level', 'school', 'castingTime', 'spellType', 'savingThrow', 'range', 'duration', 'concentration', 'classes'], facets: ['level', 'school', 'spellType', 'classes', 'concentration'], sort: { key: 'level', dir: 1 }, creates: 'spell' },
      { name: 'Cantrips', filter: e => e.type === 'spell' && e.fields.level === 'Cantrip', cols: ['school', 'spellType', 'savingThrow', 'range', 'classes'], facets: ['school', 'classes'], creates: 'spell' },
      { name: 'Leveled spells', filter: e => e.type === 'spell' && e.fields.level !== 'Cantrip', cols: ['level', 'school', 'castingTime', 'spellType', 'savingThrow', 'concentration', 'classes'], facets: ['level', 'school', 'classes'], sort: { key: 'level', dir: 1 }, creates: 'spell' },
    ],
  },
  {
    id: 'armory', title: 'Armory', icon: '⚔️', views: [
      { name: 'Weapons', filter: kind('Weapon'), cols: ['subtype', 'damage', 'damageType', 'properties', 'magical', 'value'], facets: ['damageType', 'magical'], sort: { key: 'subtype', dir: 1 }, creates: 'item' },
      { name: 'Armor', filter: kind('Armor'), cols: ['slot', 'subtype', 'armorClass', 'magical', 'value', 'summary'], facets: ['slot', 'magical'], sort: { key: 'slot', dir: 1 }, creates: 'item' },
      { name: 'Other items', filter: e => e.type === 'item' && !['Weapon', 'Armor', 'Ingredient', 'Potion', 'Poison'].includes(String(e.fields.kind ?? '')), cols: ['kind', 'subtype', 'magical', 'value', 'summary'], facets: ['kind', 'magical'], sort: { key: 'kind', dir: 1 }, creates: 'item' },
      { name: 'Everything by value', filter: is('item'), cols: ['kind', 'subtype', 'value'], facets: ['kind'], sort: { key: 'value', dir: -1 } },
    ],
  },
  {
    id: 'crafting', title: 'Crafting', icon: '⚗️', views: [
      { name: 'Recipes', filter: e => kind(...CRAFTED)(e) && !!(e.fields.recipe as unknown[] | undefined)?.length, cols: ['kind', 'craftingType', '@recipeCost', 'value', '@margin', 'effect'], facets: ['kind', 'craftingType'], sort: { key: 'craftingType', dir: 1 }, creates: 'item' },
      { name: 'Ingredients', filter: kind('Ingredient'), cols: ['category', 'value', '@usedIn', 'properties', 'summary'], facets: ['category', 'properties'], sort: { key: 'category', dir: 1 }, creates: 'item' },
      { name: 'Potions & poisons', filter: kind('Potion', 'Poison'), cols: ['kind', 'craftingType', 'value', 'effect'], facets: ['kind', 'craftingType'], creates: 'item' },
    ],
  },
  {
    id: 'people', title: 'People', icon: '👥', views: [
      { name: 'All NPCs', filter: is('npc'), cols: ['race', 'subrace', '@lives-in', '@member', '@aliases'], facets: ['race', '@lives-in', '@member'], creates: 'npc' },
      { name: 'Player characters', filter: is('pc'), cols: ['player', 'race', 'class', 'level', 'campaigns'], creates: 'pc' },
      { name: 'Organizations', filter: is('organization'), cols: ['orgType', 'parent', 'seat', '@members'], facets: ['orgType'], creates: 'organization' },
    ],
  },
  {
    id: 'recent', title: 'Recently edited', icon: '🕘', views: [
      { name: 'Last 50 changes', filter: () => true, cols: ['@type', '@updated'], facets: ['@type'], sort: { key: '@updated', dir: 1 }, limit: 50 },
    ],
  },
]
