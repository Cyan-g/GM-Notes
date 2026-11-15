// Describes every entry type: its label, fields and dropdown options.
// Forms and pages are generated from this, so adding a field here is enough.
import type { EntryType, RelationKind } from './types'

export type FieldKind =
  | 'text' | 'longtext' | 'number' | 'bool' | 'select' | 'list' | 'money' | 'weight'
  | 'ref' | 'refs' | 'date' | 'recipe' | 'stock' | 'statblock' | 'abilities' | 'combatants' | 'pins'

export interface FieldDef {
  key: string
  label: string
  kind: FieldKind
  options?: string[]
  /** For ref/refs: which entry types may be picked. */
  to?: EntryType[]
  /** Only show when another field has one of these values, e.g. weapon fields when kind = Weapon. */
  when?: { field: string; is: string[] }
  group?: string
}

export interface TypeDef {
  type: EntryType
  label: string
  plural: string
  icon: string
  fields: FieldDef[]
}

const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan']
const ABILITY = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']
const DAMAGE = ['Acid', 'Bludgeoning', 'Cold', 'Fire', 'Force', 'Lightning', 'Necrotic', 'Piercing', 'Poison', 'Psychic', 'Radiant', 'Slashing', 'Thunder']
const CLASSES = ['Artificer', 'Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard']

export const PLACE_KINDS = ['Shop', 'Tavern', 'Temple', 'Dungeon', 'Landmark', 'Plane']
/** Old size categories, removed from saved data when it's opened. */
export const OLD_PLACE_SIZES = ['World', 'Continent', 'Region', 'Settlement', 'District', 'Building', 'Other']
export const ITEM_KINDS = ['Weapon', 'Armor', 'Potion', 'Poison', 'Ingredient', 'Scroll', 'Tome', 'Ring', 'Accessory', 'Instrument', 'Adventuring Gear', 'Flask', 'Other']

const W = { field: 'kind', is: ['Weapon'] }
const A = { field: 'kind', is: ['Armor'] }
const ING = { field: 'kind', is: ['Ingredient'] }
const CRAFT = { field: 'kind', is: ['Potion', 'Poison', 'Scroll', 'Other'] }

export const SCHEMA: TypeDef[] = [
  {
    type: 'npc', label: 'NPC', plural: 'NPCs', icon: '👤', fields: [
      { key: 'race', label: 'Race', kind: 'ref', to: ['race'], group: 'Appearance' },
      { key: 'subrace', label: 'Subrace', kind: 'text', group: 'Appearance' },
      { key: 'gender', label: 'Gender', kind: 'text', group: 'Appearance' },
      { key: 'age', label: 'Age', kind: 'text', group: 'Appearance' },
      { key: 'hair', label: 'Hair', kind: 'text', group: 'Appearance' },
      { key: 'eyes', label: 'Eyes', kind: 'text', group: 'Appearance' },
      { key: 'skin', label: 'Skin', kind: 'text', group: 'Appearance' },
      { key: 'clothing', label: 'Clothing', kind: 'text', group: 'Appearance' },
      { key: 'personality', label: 'Personality', kind: 'list', group: 'Personality' },
      { key: 'statblock', label: 'Stats', kind: 'statblock', group: 'Stats' },
    ],
  },
  {
    type: 'pc', label: 'Player character', plural: 'Player characters', icon: '🛡️', fields: [
      { key: 'player', label: 'Player', kind: 'text' },
      { key: 'race', label: 'Race', kind: 'ref', to: ['race'] },
      { key: 'subrace', label: 'Subrace', kind: 'text' },
      { key: 'class', label: 'Class', kind: 'text' },
      { key: 'level', label: 'Level', kind: 'number' },
      { key: 'campaigns', label: 'Campaigns', kind: 'refs', to: ['campaign'] },
      { key: 'statblock', label: 'Stats', kind: 'statblock', group: 'Stats' },
    ],
  },
  {
    type: 'organization', label: 'Organization', plural: 'Organizations', icon: '⚑', fields: [
      { key: 'orgType', label: 'Type', kind: 'select', options: ['Clan', 'Family', 'Guild', 'Faith', 'Government', 'Military', 'Order', 'Tribe', 'Company', 'Crew', 'Cult', 'Other'] },
      { key: 'parent', label: 'Part of', kind: 'ref', to: ['organization'] },
      { key: 'seat', label: 'Seat', kind: 'ref', to: ['place'] },
    ],
  },
  {
    type: 'place', label: 'Place', plural: 'Places', icon: '📍', fields: [
      // No size categories (world, region, city…): places nest freely, "Located in" is what matters.
      // A kind is only for places that behave differently (shops have stock) or are worth filtering by.
      { key: 'placeType', label: 'Kind', kind: 'select', options: PLACE_KINDS },
      { key: 'parent', label: 'Located in', kind: 'ref', to: ['place'] },
      { key: 'markup', label: 'Price markup', kind: 'number', when: { field: 'placeType', is: ['Shop', 'Tavern'] }, group: 'Shop' },
      { key: 'stock', label: 'Stock', kind: 'stock', when: { field: 'placeType', is: ['Shop', 'Tavern'] }, group: 'Shop' },
      { key: 'map', label: 'Map image', kind: 'text', group: 'Map' },
      { key: 'pins', label: 'Pins', kind: 'pins', group: 'Map' },
    ],
  },
  {
    type: 'race', label: 'Race', plural: 'Races', icon: '🧬', fields: [
      { key: 'size', label: 'Size', kind: 'select', options: SIZES },
      { key: 'speed', label: 'Speed', kind: 'text' },
      { key: 'abilityIncrease', label: 'Ability scores', kind: 'text' },
      { key: 'languages', label: 'Languages', kind: 'list' },
      { key: 'traits', label: 'Traits', kind: 'list' },
      { key: 'subraces', label: 'Subraces', kind: 'list' },
    ],
  },
  {
    type: 'deity', label: 'Deity', plural: 'Deities', icon: '✨', fields: [
      { key: 'rank', label: 'Rank', kind: 'select', options: ['Greater deity', 'Lesser deity', 'Demigod', 'Other'] },
      { key: 'domains', label: 'Domains', kind: 'list' },
      { key: 'alignment', label: 'Alignment', kind: 'text' },
      { key: 'symbol', label: 'Symbol', kind: 'text' },
    ],
  },
  {
    type: 'creature', label: 'Creature', plural: 'Creatures', icon: '🐉', fields: [
      { key: 'creatureType', label: 'Type', kind: 'select', options: ['Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon', 'Elemental', 'Fey', 'Fiend', 'Giant', 'Humanoid', 'Monstrosity', 'Ooze', 'Plant', 'Undead'] },
      { key: 'statblock', label: 'Stats', kind: 'statblock', group: 'Stats' },
    ],
  },
  {
    type: 'item', label: 'Item', plural: 'Items', icon: '🗡️', fields: [
      { key: 'kind', label: 'Kind', kind: 'select', options: ITEM_KINDS },
      { key: 'subtype', label: 'Subtype', kind: 'text' },
      { key: 'rarity', label: 'Rarity', kind: 'select', options: ['Common', 'Uncommon', 'Rare', 'Very rare', 'Legendary', 'Artifact'] },
      { key: 'magical', label: 'Magical', kind: 'bool' },
      { key: 'attunement', label: 'Requires attunement', kind: 'bool' },
      { key: 'value', label: 'Value', kind: 'money' },
      { key: 'weight', label: 'Weight', kind: 'weight' },
      { key: 'summary', label: 'Short description', kind: 'longtext' },
      { key: 'damage', label: 'Damage', kind: 'text', when: W, group: 'Weapon' },
      { key: 'damageType', label: 'Damage type', kind: 'select', options: DAMAGE, when: W, group: 'Weapon' },
      { key: 'range', label: 'Range', kind: 'text', when: W, group: 'Weapon' },
      { key: 'properties', label: 'Properties', kind: 'list', when: { field: 'kind', is: ['Weapon', 'Ingredient'] } },
      { key: 'bonus', label: 'Bonus', kind: 'text', when: { field: 'kind', is: ['Weapon', 'Armor'] } },
      { key: 'armorClass', label: 'Armor class', kind: 'text', when: A, group: 'Armor' },
      { key: 'slot', label: 'Slot', kind: 'select', options: ['Head', 'Chest', 'Cloak', 'Gloves', 'Boots', 'Shield'], when: A, group: 'Armor' },
      { key: 'category', label: 'Ingredient type', kind: 'select', options: ['Plant', 'Mineral', 'Body Part', 'Fluid', 'Other'], when: ING, group: 'Ingredient' },
      { key: 'craftingType', label: 'Crafted with', kind: 'select', options: ["Alchemist's Supplies", "Herbalism Kit", "Poisoner's Kit", "Calligrapher's Supplies", 'Other'], when: CRAFT, group: 'Crafting' },
      { key: 'effect', label: 'Effect', kind: 'longtext', when: CRAFT, group: 'Crafting' },
      { key: 'recipe', label: 'Recipe', kind: 'recipe', when: CRAFT, group: 'Crafting' },
    ],
  },
  {
    type: 'spell', label: 'Spell', plural: 'Spells', icon: '🔮', fields: [
      { key: 'level', label: 'Level', kind: 'select', options: ['Cantrip', '1', '2', '3', '4', '5', '6', '7', '8', '9'] },
      { key: 'school', label: 'School', kind: 'select', options: ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'] },
      { key: 'castingTime', label: 'Casting time', kind: 'text' },
      { key: 'range', label: 'Range', kind: 'text' },
      { key: 'duration', label: 'Duration', kind: 'text' },
      { key: 'concentration', label: 'Concentration', kind: 'bool' },
      { key: 'ritual', label: 'Ritual', kind: 'bool' },
      { key: 'verbal', label: 'Verbal', kind: 'bool', group: 'Components' },
      { key: 'somatic', label: 'Somatic', kind: 'bool', group: 'Components' },
      { key: 'material', label: 'Material', kind: 'text', group: 'Components' },
      { key: 'spellType', label: 'Type', kind: 'select', options: ['Attack', 'Saving throw', 'Healing', 'Buff', 'Debuff', 'Utility', 'Control', 'Summoning'] },
      { key: 'savingThrow', label: 'Saving throw', kind: 'select', options: ABILITY },
      { key: 'classes', label: 'Classes', kind: 'list', options: CLASSES },
      { key: 'summary', label: 'Short description', kind: 'longtext' },
    ],
  },
  { type: 'subclass', label: 'Subclass', plural: 'Subclasses', icon: '📜', fields: [{ key: 'class', label: 'Class', kind: 'select', options: CLASSES }] },
  {
    type: 'event', label: 'Event', plural: 'Events', icon: '⏳', fields: [
      { key: 'date', label: 'Date', kind: 'date' },
      { key: 'endDate', label: 'Until', kind: 'date' },
      { key: 'category', label: 'Category', kind: 'select', options: ['Historical Events', 'Miscellaneous Events', 'Holidays'] },
      { key: 'places', label: 'Where', kind: 'refs', to: ['place'] },
    ],
  },
  {
    type: 'campaign', label: 'Campaign', plural: 'Campaigns', icon: '🎲', fields: [
      { key: 'status', label: 'Status', kind: 'select', options: ['Planned', 'Running', 'Finished', 'One-shot'] },
      { key: 'summary', label: 'Summary', kind: 'longtext' },
    ],
  },
  {
    type: 'session', label: 'Session', plural: 'Sessions', icon: '📅', fields: [
      { key: 'campaign', label: 'Campaign', kind: 'ref', to: ['campaign'] },
      { key: 'number', label: 'Number', kind: 'number' },
      { key: 'playedOn', label: 'Played on', kind: 'text' },
      { key: 'date', label: 'In-world date', kind: 'date' },
      { key: 'players', label: 'Characters present', kind: 'refs', to: ['pc'] },
      { key: 'featured', label: 'Featured', kind: 'refs' },
      { key: 'loot', label: 'Loot', kind: 'refs', to: ['item'] },
    ],
  },
  {
    type: 'encounter', label: 'Encounter', plural: 'Encounters', icon: '⚔', fields: [
      { key: 'campaign', label: 'Campaign', kind: 'ref', to: ['campaign'] },
      { key: 'session', label: 'Session', kind: 'ref', to: ['session'] },
      { key: 'location', label: 'Where', kind: 'ref', to: ['place'] },
      { key: 'creatures', label: 'Creatures', kind: 'combatants', group: 'Creatures' },
    ],
  },
  {
    type: 'writing', label: 'Writing', plural: 'Writings', icon: '📖', fields: [
      { key: 'writingType', label: 'Type', kind: 'select', options: ['Book', 'Diary', 'Letter', 'Spoken record', 'Inscription', 'Other'] },
      { key: 'category', label: 'Category', kind: 'text' },
      { key: 'author', label: 'Author', kind: 'ref', to: ['npc', 'pc', 'organization', 'deity'] },
      { key: 'date', label: 'Written', kind: 'date' },
      { key: 'language', label: 'Language', kind: 'text' },
    ],
  },
  {
    type: 'note', label: 'Note', plural: 'Notes', icon: '🗒️', fields: [
      { key: 'category', label: 'Category', kind: 'text' },
      { key: 'campaign', label: 'Campaign', kind: 'ref', to: ['campaign'] },
    ],
  },
]

export const TYPES = Object.fromEntries(SCHEMA.map(t => [t.type, t])) as Record<EntryType, TypeDef>

/**
 * How each relation kind reads. `forward` is from a's side, `reverse` is the heading on b's page,
 * `verb` is how b's side reads in the editor. Symmetric kinds read the same from both sides.
 */
export const RELATION_KINDS: Record<RelationKind, { forward: string; reverse: string; verb: string; symmetric?: boolean; dated: boolean }> = {
  member: { forward: 'member of', reverse: 'members', verb: 'has member', dated: true },
  parent: { forward: 'parent of', reverse: 'child of', verb: 'child of', dated: false },
  sibling: { forward: 'sibling of', reverse: 'sibling of', verb: 'sibling of', symmetric: true, dated: false },
  spouse: { forward: 'spouse of', reverse: 'spouse of', verb: 'spouse of', symmetric: true, dated: true },
  ally: { forward: 'ally of', reverse: 'ally of', verb: 'ally of', symmetric: true, dated: true },
  rival: { forward: 'rival of', reverse: 'rival of', verb: 'rival of', symmetric: true, dated: true },
  mentor: { forward: 'mentor of', reverse: 'student of', verb: 'student of', dated: true },
  'lives-in': { forward: 'lives in', reverse: 'residents', verb: 'home of', dated: true },
  rules: { forward: 'rules', reverse: 'ruled by', verb: 'ruled by', dated: true },
  owns: { forward: 'owns', reverse: 'owned by', verb: 'owned by', dated: true },
  worships: { forward: 'worships', reverse: 'worshipped by', verb: 'worshipped by', dated: true },
  involved: { forward: 'involved in', reverse: 'involved', verb: 'involves', dated: false },
  related: { forward: 'related to', reverse: 'related to', verb: 'related to', symmetric: true, dated: false },
}
