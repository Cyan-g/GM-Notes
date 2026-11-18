// Describes every entry type: its label, fields and dropdown options.
// Forms and pages are generated from this, so adding a field here is enough.
import type {
  Abilities, CharacterSheet, Copper, EncounterLine, EntryType, Id, Pin, RankLine, RecipeLine, RelationKind, Statblock, StockLine, WorldDate,
} from './types'

export type FieldKind =
  | 'text' | 'longtext' | 'number' | 'bool' | 'select' | 'list' | 'money' | 'weight'
  | 'ref' | 'refs' | 'date' | 'recipe' | 'stock' | 'statblock' | 'abilities' | 'combatants' | 'pins' | 'ranks' | 'sheet'

export interface FieldDef {
  key: string
  label: string
  kind: FieldKind
  options?: readonly string[]
  /** For ref/refs: which entry types may be picked. */
  to?: readonly EntryType[]
  /** Only show when another field has one of these values, e.g. weapon fields when kind = Weapon. */
  when?: { readonly field: string; readonly is: readonly string[] }
  group?: string
}

export interface TypeDef {
  type: EntryType
  label: string
  plural: string
  icon: string
  fields: readonly FieldDef[]
}

const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan']
const ABILITY = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']
const DAMAGE = ['Acid', 'Bludgeoning', 'Cold', 'Fire', 'Force', 'Lightning', 'Necrotic', 'Piercing', 'Poison', 'Psychic', 'Radiant', 'Slashing', 'Thunder']
const CLASSES = ['Artificer', 'Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard']

export const PLACE_KINDS = ['Shop', 'Tavern', 'Temple', 'Dungeon', 'Landmark', 'Plane']
export const ITEM_KINDS = ['Weapon', 'Armor', 'Potion', 'Poison', 'Ingredient', 'Scroll', 'Tome', 'Ring', 'Accessory', 'Instrument', 'Adventuring Gear', 'Flask', 'Other']

const W = { field: 'kind', is: ['Weapon'] }
const A = { field: 'kind', is: ['Armor'] }
const ING = { field: 'kind', is: ['Ingredient'] }
const CRAFT = { field: 'kind', is: ['Potion', 'Poison', 'Scroll', 'Other'] }

export const SCHEMA = [
  {
    type: 'npc', label: 'NPC', plural: 'NPCs', icon: '👤', fields: [
      { key: 'race', label: 'Race', kind: 'ref', to: ['race'], group: 'Appearance' },
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
      { key: 'class', label: 'Class', kind: 'text' },
      { key: 'level', label: 'Level', kind: 'number' },
      { key: 'campaigns', label: 'Campaigns', kind: 'refs', to: ['campaign'] },
      // Filled in on the PC's page, which is the character sheet.
      { key: 'sheet', label: 'Character sheet', kind: 'sheet' },
    ],
  },
  {
    type: 'organization', label: 'Organization', plural: 'Organizations', icon: '⚑', fields: [
      { key: 'orgType', label: 'Type', kind: 'select', options: ['Clan', 'Family', 'Guild', 'Faith', 'Government', 'Military', 'Order', 'Tribe', 'Company', 'Crew', 'Cult', 'Other'] },
      { key: 'parent', label: 'Part of', kind: 'ref', to: ['organization'] },
      { key: 'seat', label: 'Seat', kind: 'ref', to: ['place'] },
      { key: 'ranks', label: 'Ranks', kind: 'ranks' },
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
      // A subrace is a race of its own that names its main race here (Hill Dwarf: Subrace of Dwarf).
      { key: 'parent', label: 'Subrace of', kind: 'ref', to: ['race'] },
      { key: 'size', label: 'Size', kind: 'select', options: SIZES },
      { key: 'speed', label: 'Speed', kind: 'text' },
      { key: 'abilityIncrease', label: 'Ability scores', kind: 'text' },
      { key: 'languages', label: 'Languages', kind: 'list' },
      { key: 'traits', label: 'Traits', kind: 'list' },
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
      { key: 'spell', label: 'Spell', kind: 'ref', to: ['spell'], when: { field: 'kind', is: ['Scroll'] } },
      { key: 'subtype', label: 'Subtype', kind: 'text' },
      { key: 'rarity', label: 'Rarity', kind: 'select', options: ['Common', 'Uncommon', 'Rare', 'Very rare', 'Legendary', 'Artifact'] },
      { key: 'magical', label: 'Magical', kind: 'bool' },
      { key: 'attunement', label: 'Requires attunement', kind: 'bool' },
      { key: 'value', label: 'Value', kind: 'money' },
      { key: 'weight', label: 'Weight', kind: 'weight' },
      { key: 'summary', label: 'Short description', kind: 'longtext' },
      { key: 'damage', label: 'Damage', kind: 'text', when: W, group: 'Weapon' },
      { key: 'damageType', label: 'Damage type', kind: 'list', options: DAMAGE, when: W, group: 'Weapon' },
      { key: 'range', label: 'Range', kind: 'text', when: W, group: 'Weapon' },
      { key: 'properties', label: 'Properties', kind: 'list', when: { field: 'kind', is: ['Weapon', 'Ingredient'] } },
      { key: 'bonus', label: 'Bonus', kind: 'text', when: { field: 'kind', is: ['Weapon', 'Armor'] } },
      { key: 'armorClass', label: 'Armor class', kind: 'text', when: A, group: 'Armor' },
      { key: 'slot', label: 'Slot', kind: 'select', options: ['Head', 'Chest', 'Cloak', 'Gloves', 'Boots', 'Shield'], when: A, group: 'Armor' },
      { key: 'category', label: 'Ingredient type', kind: 'select', options: ['Plant', 'Mineral', 'Body Part', 'Fluid', 'Other'], when: ING, group: 'Ingredient' },
      { key: 'craftingType', label: 'Crafted with', kind: 'select', options: ["Alchemist's Supplies", "Herbalism Kit", "Poisoner's Kit", "Calligrapher's Supplies", 'Other'], when: CRAFT, group: 'Crafting' },
      { key: 'effect', label: 'Effect', kind: 'longtext', when: { field: 'kind', is: ['Potion', 'Poison', 'Other'] }, group: 'Crafting' },
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
  {
    type: 'feat', label: 'Feat', plural: 'Feats', icon: '🎖️', fields: [
      { key: 'category', label: 'Kind', kind: 'select', options: ['Origin Feat', 'General Feat', 'Fighting Style', 'Epic Boon', 'Other'] },
      { key: 'level', label: 'Level needed', kind: 'number' },
      { key: 'requires', label: 'Needs feats', kind: 'refs', to: ['feat'] },
      { key: 'prerequisite', label: 'Other prerequisite', kind: 'text' },
      { key: 'abilityIncrease', label: 'Ability score increase', kind: 'text' },
      { key: 'source', label: 'Granted by', kind: 'ref', to: ['organization', 'race', 'subclass', 'deity', 'place', 'item'] },
      { key: 'summary', label: 'Description', kind: 'longtext' },
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
      { key: 'party', label: 'Party', kind: 'refs', to: ['pc'] },
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
] as const satisfies readonly TypeDef[]

export const TYPES = Object.fromEntries(SCHEMA.map(t => [t.type, t])) as unknown as Record<EntryType, TypeDef>

// ---------- the fields' types, worked out from the schema above ----------

/** What a value of each field kind looks like in the data. */
export interface KindValue {
  text: string; longtext: string; number: number; bool: boolean; select: string; list: string[]
  money: Copper; weight: number; ref: Id; refs: Id[]; date: WorldDate
  recipe: RecipeLine[]; stock: StockLine[]; statblock: Statblock; abilities: Abilities
  combatants: EncounterLine[]; pins: Pin[]; ranks: RankLine[]; sheet: CharacterSheet
}
type Defs = (typeof SCHEMA)[number]['fields'][number]
/** A field key used by any type. */
export type FieldKey = Defs['key']
/**
 * The fields of an entry: every key any type has, with the value its kind stores. A key two types share with
 * different kinds (a spell's level is a choice, a feat's a number) takes either. Typos don't compile.
 */
export type EntryFields = { [K in FieldKey]?: KindValue[Extract<Defs, { key: K }>['kind']] }
/** The fields looked up by a key only known while running (a column, a form field): untyped on purpose. */
export const byKey = (fields: EntryFields) => fields as Record<string, unknown>
/** The fields of one type only. */
export type FieldsOf<T extends EntryType> = {
  [F in Extract<(typeof SCHEMA)[number], { type: T }>['fields'][number] as F['key']]?: KindValue[F['kind']]
}

/**
 * How each relation kind reads. `forward` is from a's side, `reverse` is the heading on b's page,
 * `verb` is how b's side reads in the editor. Symmetric kinds read the same from both sides.
 */
// Who can be on each side of a relation (left out = anything). The relation editor only offers
// the kinds that fit the entry, so an item isn't asked whether it's a "member of" something.
const PEOPLE: EntryType[] = ['npc', 'pc']
const BEINGS: EntryType[] = ['npc', 'pc', 'deity', 'creature']
export const RELATION_KINDS: Record<RelationKind, { forward: string; reverse: string; verb: string; symmetric?: boolean; dated: boolean; a?: EntryType[]; b?: EntryType[] }> = {
  member: { forward: 'member of', reverse: 'members', verb: 'has member', dated: true, a: [...BEINGS, 'organization'], b: ['organization'] },
  parent: { forward: 'parent of', reverse: 'child of', verb: 'child of', dated: false, a: BEINGS, b: BEINGS },
  sibling: { forward: 'sibling of', reverse: 'sibling of', verb: 'sibling of', symmetric: true, dated: false, a: BEINGS, b: BEINGS },
  spouse: { forward: 'spouse of', reverse: 'spouse of', verb: 'spouse of', symmetric: true, dated: true, a: BEINGS, b: BEINGS },
  ally: { forward: 'ally of', reverse: 'ally of', verb: 'ally of', symmetric: true, dated: true, a: [...BEINGS, 'organization'], b: [...BEINGS, 'organization'] },
  rival: { forward: 'rival of', reverse: 'rival of', verb: 'rival of', symmetric: true, dated: true, a: [...BEINGS, 'organization'], b: [...BEINGS, 'organization'] },
  mentor: { forward: 'mentor of', reverse: 'student of', verb: 'student of', dated: true, a: BEINGS, b: BEINGS },
  'lives-in': { forward: 'lives in', reverse: 'residents', verb: 'home of', dated: true, a: [...BEINGS, 'organization', 'race'], b: ['place'] },
  rules: { forward: 'rules', reverse: 'ruled by', verb: 'ruled by', dated: true, a: [...BEINGS, 'organization'], b: ['place', 'organization'] },
  owns: { forward: 'owns', reverse: 'owned by', verb: 'owned by', dated: true, a: [...PEOPLE, 'organization', 'deity', 'creature'], b: ['item', 'place', 'creature'] },
  worships: { forward: 'worships', reverse: 'worshipped by', verb: 'worshipped by', dated: true, a: [...PEOPLE, 'organization', 'race', 'creature'], b: ['deity'] },
  involved: { forward: 'involved in', reverse: 'involved', verb: 'involves', dated: false, b: ['event', 'session', 'campaign', 'encounter'] },
  related: { forward: 'related to', reverse: 'related to', verb: 'related to', symmetric: true, dated: false },
}
