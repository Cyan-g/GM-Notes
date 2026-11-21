// Describes every entry type: its label, fields and dropdown options.
// Forms and pages are generated from this, so adding a field here is enough.
import type {
  Abilities, AbilityBonus, CharacterSheet, ClassBasics, Equipment, Regain, SpellArea, Speeds, ClassLine, Copper, GearEffect, ItemSpell, SpellRoll, Trait, MapRoute, MapScale, Requirements, EncounterLine, EntryType, Id, Pin, RankLine, RecipeLine, RelationKind, Statblock, StockLine, WorldDate,
} from './types'
import { CONDITIONS } from './dnd'

export type FieldKind =
  | 'text' | 'longtext' | 'number' | 'bool' | 'select' | 'list' | 'money' | 'weight'
  | 'ref' | 'refs' | 'date' | 'recipe' | 'stock' | 'statblock' | 'abilities' | 'combatants' | 'pins' | 'ranks' | 'sheet' | 'classes' | 'effects' | 'itemSpells' | 'requires' | 'mapData' | 'speciesTraits' | 'abilityBonus' | 'skills' | 'equipment' | 'spellRolls' | 'classBasics' | 'speeds' | 'regain' | 'spellArea'
  // A picture in the data folder (its path), copied along when the entry is exported or published.
  | 'image'

export interface FieldDef {
  key: string
  label: string
  kind: FieldKind
  /** A choice field's starting options (see lists.ts: the world's lists are managed on the Lists page). */
  options?: readonly string[]
  /** The list it picks from, when several fields share one; otherwise "<type>.<key>". */
  list?: string
  /** Options the app relies on: they can be renamed but not removed. */
  fixed?: readonly string[]
  /** For ref/refs: which entry types may be picked. */
  to?: readonly EntryType[]
  /** For ref: only entries whose field has one of these values, e.g. Tool items. */
  pick?: { readonly field: string; readonly is: readonly string[] }
  /** Only show when another field has one of these values, e.g. weapon fields when kind = Weapon. */
  when?: { readonly field: string; readonly is: readonly string[] }
  group?: string
  /** Only for the DM: left out of exports and publishes without DM-only text, and kept on import when a file has none. */
  dmOnly?: true
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
export const DAMAGE = ['Acid', 'Bludgeoning', 'Cold', 'Fire', 'Force', 'Lightning', 'Necrotic', 'Piercing', 'Poison', 'Psychic', 'Radiant', 'Slashing', 'Thunder']
const SPELL_LEVELS = ['Cantrip', '1', '2', '3', '4', '5', '6', '7', '8', '9']
const CLASSES = ['Artificer', 'Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard']

export const PLACE_KINDS = ['Shop', 'Tavern', 'Temple', 'Dungeon', 'Landmark', 'Plane']
export const ITEM_KINDS = ['Weapon', 'Armor', 'Tool', 'Potion', 'Poison', 'Ingredient', 'Scroll', 'Tome', 'Ring', 'Accessory', 'Instrument', 'Adventuring Gear', 'Flask', 'Other']

// What a character can be proficient with. An item says which of these it is (a weapon's category and base
// weapon, an armor's type; a Tool item is the tool), and the sheet's proficiencies pick from the same lists.
const WEAPON_CATEGORIES = ['Simple', 'Martial']
const ARMOR_TYPES = ['Light', 'Medium', 'Heavy', 'Shield', 'Clothing']
/** The standard weapons and their category, so a weapon's category can be told from its base weapon. */
export const SIMPLE_WEAPONS = ['Club', 'Dagger', 'Greatclub', 'Handaxe', 'Javelin', 'Light Hammer', 'Mace', 'Quarterstaff', 'Sickle', 'Spear', 'Dart', 'Light Crossbow', 'Shortbow', 'Sling']
/** The standard weapon properties (the Weapon properties list starts with them; more can be added there). */
/** The weapon masteries (2024): what a character who masters a weapon can do with it (notes on the Lists page). */
export const MASTERIES = ['Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow', 'Topple', 'Vex']
/** Each base weapon's mastery, as in the SRD; a weapon item can name another. */
export const MASTERY_OF: Record<string, string> = {
  Club: 'Slow', Dagger: 'Nick', Greatclub: 'Push', Handaxe: 'Vex', Javelin: 'Slow', 'Light Hammer': 'Nick', Mace: 'Sap', Quarterstaff: 'Topple',
  Sickle: 'Nick', Spear: 'Sap', Dart: 'Vex', 'Light Crossbow': 'Slow', Shortbow: 'Vex', Sling: 'Slow',
  Battleaxe: 'Topple', Flail: 'Sap', Glaive: 'Graze', Greataxe: 'Cleave', Greatsword: 'Graze', Halberd: 'Cleave', Lance: 'Topple', Longsword: 'Sap',
  Maul: 'Topple', Morningstar: 'Sap', Pike: 'Push', Rapier: 'Vex', Scimitar: 'Nick', Shortsword: 'Vex', Trident: 'Topple', 'War Pick': 'Sap',
  Warhammer: 'Push', Whip: 'Slow', Blowgun: 'Vex', 'Hand Crossbow': 'Vex', 'Heavy Crossbow': 'Push', Longbow: 'Slow',
}
export const WEAPON_PROPERTIES = ['Ammunition', 'Finesse', 'Heavy', 'Light', 'Loading', 'Reach', 'Special', 'Thrown', 'Two-Handed', 'Versatile']
export const MARTIAL_WEAPONS = ['Battleaxe', 'Flail', 'Glaive', 'Greataxe', 'Greatsword', 'Halberd', 'Lance', 'Longsword', 'Maul', 'Morningstar', 'Pike', 'Rapier', 'Scimitar', 'Shortsword', 'Trident', 'War Pick', 'Warhammer', 'Whip', 'Blowgun', 'Hand Crossbow', 'Heavy Crossbow', 'Longbow', 'Net']

const W = { field: 'kind', is: ['Weapon'] }
/** Kinds of item worn, wielded or carried for what they do (not consumables and ingredients). */
const GEAR = { field: 'kind', is: ['Weapon', 'Armor', 'Tool', 'Tome', 'Ring', 'Accessory', 'Instrument', 'Adventuring Gear', 'Flask', 'Other'] }
const A = { field: 'kind', is: ['Armor'] }
const ING = { field: 'kind', is: ['Ingredient'] }
const CRAFT = { field: 'kind', is: ['Potion', 'Poison', 'Scroll', 'Other'] }

export const SCHEMA = [
  {
    type: 'npc', label: 'NPC', plural: 'NPCs', icon: '👤', fields: [
      // Who they are, under the name (NpcForm): what they do, how they stand with the party, alive or not.
      { key: 'occupation', label: 'Occupation', kind: 'text' },
      { key: 'attitude', label: 'Attitude', kind: 'select', options: ['Friendly', 'Indifferent', 'Hostile'], dmOnly: true },
      { key: 'status', label: 'Status', kind: 'text' },
      { key: 'statusSince', label: 'Since', kind: 'date' },
      { key: 'race', label: 'Race', kind: 'ref', to: ['race'], group: 'Appearance' },
      { key: 'gender', label: 'Gender', kind: 'text', group: 'Appearance' },
      { key: 'age', label: 'Age', kind: 'text', group: 'Appearance' },
      // The age is worked out from it and the world's date.
      { key: 'born', label: 'Born', kind: 'date', group: 'Appearance' },
      { key: 'hair', label: 'Hair', kind: 'text', group: 'Appearance' },
      { key: 'eyes', label: 'Eyes', kind: 'text', group: 'Appearance' },
      { key: 'skin', label: 'Skin', kind: 'text', group: 'Appearance' },
      { key: 'clothing', label: 'Clothing', kind: 'text', group: 'Appearance' },
      // How to play them; each part is there once added. The secret never reaches the players.
      { key: 'personality', label: 'Traits', kind: 'list', group: 'Roleplay' },
      { key: 'ideals', label: 'Ideals', kind: 'longtext', group: 'Roleplay' },
      { key: 'bonds', label: 'Bonds', kind: 'longtext', group: 'Roleplay' },
      { key: 'flaws', label: 'Flaws', kind: 'longtext', group: 'Roleplay' },
      { key: 'voice', label: 'Voice & mannerisms', kind: 'longtext', group: 'Roleplay' },
      { key: 'wants', label: 'Wants', kind: 'longtext', group: 'Roleplay' },
      { key: 'secret', label: 'Secret', kind: 'longtext', group: 'Roleplay', dmOnly: true },
      { key: 'statblock', label: 'Stats', kind: 'statblock', group: 'Stats' },
    ],
  },
  {
    type: 'pc', label: 'Player character', plural: 'Player characters', icon: '🛡️', fields: [
      { key: 'player', label: 'Player', kind: 'text' },
      // Classes and their levels are set on the sheet (Edit page); the level is the sum, or this one without a class.
      { key: 'classLevels', label: 'Classes', kind: 'classes' },
      { key: 'level', label: 'Level', kind: 'number' },
      { key: 'campaigns', label: 'Campaigns', kind: 'refs', to: ['campaign'] },
      // Its skills, tool and features count on the sheet (species.ts); the player can swap any of them.
      { key: 'background', label: 'Background', kind: 'ref', to: ['background'] },
      // The same appearance as an NPC's (edited with NpcAppearance).
      { key: 'race', label: 'Race', kind: 'ref', to: ['race'], group: 'Appearance' },
      { key: 'gender', label: 'Gender', kind: 'text', group: 'Appearance' },
      { key: 'age', label: 'Age', kind: 'text', group: 'Appearance' },
      { key: 'born', label: 'Born', kind: 'date', group: 'Appearance' },
      { key: 'hair', label: 'Hair', kind: 'text', group: 'Appearance' },
      { key: 'eyes', label: 'Eyes', kind: 'text', group: 'Appearance' },
      { key: 'skin', label: 'Skin', kind: 'text', group: 'Appearance' },
      { key: 'clothing', label: 'Clothing', kind: 'text', group: 'Appearance' },
      // Filled in on the PC's page, which is the character sheet.
      { key: 'sheet', label: 'Character sheet', kind: 'sheet' },
    ],
  },
  {
    type: 'organization', label: 'Organization', plural: 'Organizations', icon: '⚑', fields: [
      { key: 'orgType', label: 'Type', kind: 'select', options: ['Clan', 'Family', 'Guild', 'Faith', 'Government', 'Military', 'Order', 'Tribe', 'Company', 'Crew', 'Cult', 'Other'] },
      { key: 'parent', label: 'Part of', kind: 'ref', to: ['organization'] },
      { key: 'seat', label: 'Seat', kind: 'ref', to: ['place'] },
      // Edited with OrgForm: where else it is, how it stands with the party, what it's after, what joining gives.
      { key: 'presence', label: 'Present in', kind: 'refs', to: ['place'] },
      { key: 'attitude', label: 'Attitude', kind: 'select', options: ['Friendly', 'Indifferent', 'Hostile'], dmOnly: true },
      { key: 'goals', label: 'Goals', kind: 'longtext' },
      { key: 'secret', label: 'Secret', kind: 'longtext', dmOnly: true },
      { key: 'teaches', label: 'Membership offers', kind: 'refs', to: ['subclass', 'spell', 'feat', 'item'] },
      { key: 'ranks', label: 'Ranks', kind: 'ranks' },
    ],
  },
  {
    type: 'place', label: 'Place', plural: 'Places', icon: '📍', fields: [
      // No size categories (world, region, city…): places nest freely, "Located in" is what matters.
      // A kind is only for places that behave differently (shops have stock) or are worth filtering by.
      { key: 'placeType', label: 'Kind', kind: 'select', options: PLACE_KINDS, fixed: ['Shop', 'Tavern'] },
      { key: 'parent', label: 'Located in', kind: 'ref', to: ['place'] },
      { key: 'markup', label: 'Price markup', kind: 'number', when: { field: 'placeType', is: ['Shop', 'Tavern'] }, group: 'Shop' },
      { key: 'shopkeeper', label: 'Keeper', kind: 'ref', to: ['npc'], when: { field: 'placeType', is: ['Shop', 'Tavern'] }, group: 'Shop' },
      { key: 'stock', label: 'Stock', kind: 'stock', when: { field: 'placeType', is: ['Shop', 'Tavern'] }, group: 'Shop' },
      { key: 'map', label: 'Map image', kind: 'image', group: 'Map' },
      { key: 'pins', label: 'Pins', kind: 'pins', group: 'Map' },
      // Set and drawn on the map itself (travel.ts), not in the form.
      { key: 'mapScale', label: 'Map scale', kind: 'mapData', group: 'Map' },
      { key: 'routes', label: 'Routes', kind: 'mapData', group: 'Map' },
    ],
  },
  {
    type: 'race', label: 'Race', plural: 'Races', icon: '🧬', fields: [
      // A subrace is a race of its own that names its main race here (Hill Dwarf: Subrace of Dwarf).
      { key: 'parent', label: 'Subrace of', kind: 'ref', to: ['race'] },
      // Left out of the character wizard (a monster race, a lost people); a main race takes its subraces with it.
      { key: 'notPlayable', label: 'Not playable', kind: 'bool' },
      { key: 'size', label: 'Size', kind: 'select', options: SIZES, list: 'size' },
      // Sizes the player may pick instead (a "Medium or Small" species); the pick is on the character's sheet.
      { key: 'otherSizes', label: 'Or size', kind: 'list', options: SIZES, list: 'size' },
      { key: 'creatureType', label: 'Creature type', kind: 'select', options: ['Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon', 'Elemental', 'Fey', 'Fiend', 'Giant', 'Humanoid', 'Monstrosity', 'Ooze', 'Plant', 'Undead'], list: 'creature.creatureType' },
      // Walking, swimming, flying, climbing and burrowing speeds in feet (data version 30; it was text before).
      { key: 'speeds', label: 'Speed', kind: 'speeds' },
      // What the race may add to ability scores; not added on its own (abilityBonus.ts).
      { key: 'abilityIncrease', label: 'Ability scores', kind: 'abilityBonus' },
      // Languages of the language list (data version 31; names before), and how many more the player picks.
      { key: 'languages', label: 'Languages', kind: 'list', options: [], list: 'language' },
      { key: 'languageChoices', label: 'Languages of choice', kind: 'number' },
      // What the species gives a character (species.ts): effects, proficiencies, spells, uses, choices.
      { key: 'speciesTraits', label: 'Traits', kind: 'speciesTraits' },
    ],
  },
  {
    // A character's background (2024 rules): what it may add to ability scores and its starting equipment are kept
    // for the character creation wizard; its skills, tool and features count on the sheet (species.ts).
    type: 'background', label: 'Background', plural: 'Backgrounds', icon: '🎒', fields: [
      { key: 'abilityIncrease', label: 'Ability scores', kind: 'abilityBonus' },
      { key: 'originFeat', label: 'Origin feat', kind: 'ref', to: ['feat'] },
      // Which version of the feat, if it has several ("Cleric" for Magic Initiate).
      { key: 'originFeatNote', label: 'Feat option', kind: 'text' },
      { key: 'skillProfs', label: 'Skills', kind: 'skills' },
      // One Tool item is granted; with several, the player picks one of them (one kind of gaming set).
      { key: 'toolProfs', label: 'Tool', kind: 'refs', to: ['item'], pick: { field: 'kind', is: ['Tool'] } },
      // With several tools: it gives all of them (instead of the player picking one).
      { key: 'toolsAll', label: 'All tools', kind: 'bool' },
      { key: 'equipment', label: 'Equipment', kind: 'equipment' },
      // Anything else it gives, as species traits: features, effects, more proficiencies, spells, uses, choices.
      { key: 'speciesTraits', label: 'Features', kind: 'speciesTraits' },
    ],
  },
  {
    type: 'deity', label: 'Deity', plural: 'Deities', icon: '✨', fields: [
      // Edited with DeityForm, shown with DeityGlance; the deity list is the pantheon table.
      { key: 'rank', label: 'Rank', kind: 'select', options: ['Greater deity', 'Lesser deity', 'Demigod', 'Primordial', 'Other'], fixed: ['Greater deity', 'Lesser deity'] },
      { key: 'epithet', label: 'Epithet', kind: 'text' },
      // the cleric domains it offers (a domain's subclass is linked where the world has one)
      { key: 'domains', label: 'Domains', kind: 'list', options: ['Arcana', 'Death', 'Forge', 'Grave', 'Knowledge', 'Life', 'Light', 'Nature', 'Order', 'Peace', 'Tempest', 'Trickery', 'Twilight', 'War'] },
      { key: 'portfolio', label: 'Portfolio', kind: 'list' },
      { key: 'alignment', label: 'Alignment', kind: 'text' },
      // where it dwells: its realm (Brightwater) on a plane (the Outlands); linked when a place has the name
      { key: 'realm', label: 'Realm', kind: 'text' },
      { key: 'plane', label: 'Home plane', kind: 'text' },
      { key: 'worshippers', label: 'Typical worshippers', kind: 'text' },
      { key: 'symbol', label: 'Symbol', kind: 'text' },
      { key: 'symbolImage', label: 'Symbol picture', kind: 'image' },
      // the calendar's holidays that are its holy days (by name)
      { key: 'holyDays', label: 'Holy days', kind: 'list' },
      // the subclasses it is the patron of (a warlock's patron)
      { key: 'patronOf', label: 'Patron of', kind: 'refs', to: ['subclass'] },
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
      { key: 'kind', label: 'Kind', kind: 'select', options: ITEM_KINDS, fixed: ['Weapon', 'Armor', 'Tool', 'Potion', 'Poison', 'Ingredient', 'Scroll', 'Other'] },
      { key: 'spell', label: 'Spell', kind: 'ref', to: ['spell'], when: { field: 'kind', is: ['Scroll'] } },
      { key: 'subtype', label: 'Subtype', kind: 'text' },
      { key: 'rarity', label: 'Rarity', kind: 'select', options: ['Common', 'Uncommon', 'Rare', 'Very rare', 'Legendary', 'Artifact'] },
      { key: 'magical', label: 'Magical', kind: 'bool' },
      { key: 'attunement', label: 'Requires attunement', kind: 'bool' },
      { key: 'value', label: 'Value', kind: 'money' },
      { key: 'weight', label: 'Weight', kind: 'weight' },
      { key: 'summary', label: 'Short description', kind: 'longtext' },
      { key: 'weaponCategory', label: 'Weapon category', kind: 'select', options: WEAPON_CATEGORIES, fixed: WEAPON_CATEGORIES, when: W, group: 'Weapon' },
      { key: 'baseWeapon', label: 'Base weapon', kind: 'select', options: [...SIMPLE_WEAPONS, ...MARTIAL_WEAPONS].sort(), when: W, group: 'Weapon' },
      { key: 'damage', label: 'Damage', kind: 'text', when: W, group: 'Weapon' },
      { key: 'damageType', label: 'Damage type', kind: 'list', options: DAMAGE, when: W, group: 'Weapon' },
      { key: 'range', label: 'Range', kind: 'text', when: W, group: 'Weapon' },
      { key: 'properties', label: 'Properties', kind: 'list', options: WEAPON_PROPERTIES, list: 'weaponProperty', when: W, group: 'Weapon' },
      // Its mastery, if not its base weapon's (MASTERY_OF); used by a character who masters it.
      { key: 'mastery', label: 'Mastery', kind: 'select', options: MASTERIES, list: 'weaponMastery', when: W, group: 'Weapon' },
      { key: 'traits', label: 'Properties', kind: 'list', options: [], list: 'ingredientProperty', when: ING, group: 'Ingredient' },
      { key: 'armorType', label: 'Armor type', kind: 'select', options: ARMOR_TYPES, fixed: ARMOR_TYPES, when: A, group: 'Armor' },
      // A number (data version 31; text before): body armor's base AC, to which the armor type adds Dex (light: all,
      // medium: up to 2, heavy: none), or what a shield adds.
      { key: 'armorClass', label: 'Armor class', kind: 'number', when: A, group: 'Armor' },
      { key: 'slot', label: 'Slot', kind: 'select', options: ['Head', 'Chest', 'Cloak', 'Gloves', 'Boots', 'Shield'], when: A, group: 'Armor' },
      // Heavy armor's (and some medium armor's) disadvantage on Stealth while worn.
      { key: 'stealthDis', label: 'Stealth disadvantage', kind: 'bool', when: A, group: 'Armor' },
      // What it does to whoever wears, wields or attunes it (items.ts, effects.ts); not for consumables and ingredients.
      // Who can use it (requirements.ts): checked when it's equipped, or attuned if it needs attunement.
      { key: 'requirements', label: 'Requirements', kind: 'requires', when: GEAR },
      { key: 'effects', label: 'Effects', kind: 'effects', when: GEAR },
      // Spells it lets its user cast, and the charges they cost (items.ts).
      { key: 'charges', label: 'Charges', kind: 'number', when: GEAR },
      { key: 'recharge', label: 'Regains', kind: 'text', when: GEAR },
      // How many charges come back, and when (the sheet gives a number back on that rest, or asks for the dice roll).
      { key: 'regain', label: 'Regains', kind: 'regain', when: GEAR },
      // When its effects and features count: carried, equipped or attuned (by default: attuned if it needs
      // attunement, equipped if it can be, else carried).
      { key: 'worksWhile', label: 'Works while', kind: 'select', options: ['carried', 'equipped', 'attuned'], when: GEAR },
      { key: 'spells', label: 'Spells', kind: 'itemSpells', to: ['spell'], when: GEAR },
      // Its rules as features, like a feat's (species.ts): counted while it's in use, or while carried if it can't be
      // equipped or attuned (a flask, a pearl); listed on the sheet in play with uses, choices and spells.
      { key: 'speciesTraits', label: 'Features', kind: 'speciesTraits', when: GEAR },
      { key: 'category', label: 'Ingredient type', kind: 'select', options: ['Plant', 'Mineral', 'Body Part', 'Fluid', 'Other'], when: ING, group: 'Ingredient' },
      // The Tool item a recipe is crafted with (proficiency in it is what the Workbench checks).
      { key: 'craftingType', label: 'Crafted with', kind: 'ref', to: ['item'], pick: { field: 'kind', is: ['Tool'] }, when: CRAFT, group: 'Crafting' },
      { key: 'effect', label: 'Effect', kind: 'longtext', when: { field: 'kind', is: ['Potion', 'Poison', 'Other'] }, group: 'Crafting' },
      { key: 'recipe', label: 'Recipe', kind: 'recipe', when: CRAFT, group: 'Crafting' },
    ],
  },
  {
    type: 'spell', label: 'Spell', plural: 'Spells', icon: '🔮', fields: [
      { key: 'level', label: 'Level', kind: 'select', options: SPELL_LEVELS, fixed: SPELL_LEVELS },
      { key: 'school', label: 'School', kind: 'select', options: ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'] },
      { key: 'castingTime', label: 'Casting time', kind: 'text' },
      { key: 'range', label: 'Range', kind: 'text' },
      // Its area of effect: shape and size (20-foot-radius Sphere); shown with the range.
      { key: 'area', label: 'Area', kind: 'spellArea' },
      { key: 'duration', label: 'Duration', kind: 'text' },
      { key: 'concentration', label: 'Concentration', kind: 'bool' },
      { key: 'ritual', label: 'Ritual', kind: 'bool' },
      { key: 'verbal', label: 'Verbal', kind: 'bool', group: 'Components' },
      { key: 'somatic', label: 'Somatic', kind: 'bool', group: 'Components' },
      { key: 'material', label: 'Material', kind: 'text', group: 'Components' },
      { key: 'spellType', label: 'Type', kind: 'select', options: ['Attack', 'Saving throw', 'Healing', 'Buff', 'Debuff', 'Utility', 'Control', 'Summoning'], fixed: ['Attack', 'Saving throw'] },
      { key: 'savingThrow', label: 'Saving throw', kind: 'select', options: ABILITY, list: 'ability', fixed: ABILITY },
      { key: 'classes', label: 'Classes', kind: 'list', options: CLASSES, list: 'class' },
      { key: 'summary', label: 'Short description', kind: 'longtext' },
      // What it rolls (spells.ts): damage, healing, temporary hit points, with how it grows; shown in the Spellbook.
      { key: 'rolls', label: 'Damage & healing', kind: 'spellRolls' },
      // Conditions it can cause.
      { key: 'conditions', label: 'Conditions', kind: 'list', options: CONDITIONS },
      // What it does to a character while it lasts, counted on their sheet when they switch it on (effects.ts).
      { key: 'active', label: 'While active', kind: 'effects' },
    ],
  },
  {
    type: 'feat', label: 'Feat', plural: 'Feats', icon: '🎖️', fields: [
      { key: 'category', label: 'Kind', kind: 'select', options: ['Origin Feat', 'General Feat', 'Fighting Style', 'Epic Boon', 'Other'] },
      { key: 'level', label: 'Level needed', kind: 'number' },
      { key: 'requires', label: 'Needs feats', kind: 'refs', to: ['feat'] },
      { key: 'prerequisite', label: 'Prerequisite (as written)', kind: 'text' },
      // What the app checks before the feat can be taken (level-up greys it out): scores, spellcasting, a feature.
      { key: 'requirements', label: 'Prerequisites checked', kind: 'requires' },
      // It can be taken more than once (Ability Score Improvement, Magic Initiate with another spell list).
      { key: 'repeatable', label: 'Repeatable', kind: 'bool' },
      { key: 'abilityIncrease', label: 'Ability score increase', kind: 'abilityBonus' },
      { key: 'source', label: 'Granted by', kind: 'ref', to: ['organization', 'race', 'background', 'subclass', 'deity', 'place', 'item'] },
      { key: 'summary', label: 'Description', kind: 'longtext' },
      // What it does on a sheet that has it (species.ts), like a race's traits: effects, uses, choices, spells.
      { key: 'speciesTraits', label: 'Features', kind: 'speciesTraits' },
    ],
  },
  {
    // A class's features (species.ts applies them by the character's level in that class). `class` is the class it
    // describes, from the Classes list; one entry per class.
    type: 'class', label: 'Class', plural: 'Classes', icon: '⚔️', fields: [
      { key: 'class', label: 'Class', kind: 'select', options: CLASSES, list: 'class' },
      // Hit die, saves, proficiencies, spellcasting and the rest: what it sets wins over the built-in SRD values.
      { key: 'basics', label: 'Class basics', kind: 'classBasics' },
      { key: 'speciesTraits', label: 'Features', kind: 'speciesTraits' },
    ],
  },
  {
    type: 'subclass', label: 'Subclass', plural: 'Subclasses', icon: '📜', fields: [
      { key: 'class', label: 'Class', kind: 'select', options: CLASSES, list: 'class' },
      // A line under its name (the SRD's "Make a Deal with the Lower Planes"); the wizard shows it with the subclass.
      { key: 'tagline', label: 'Tagline', kind: 'text' },
      // Its features, by the character's level in the class.
      { key: 'speciesTraits', label: 'Features', kind: 'speciesTraits' },
    ],
  },
  {
    type: 'event', label: 'Event', plural: 'Events', icon: '⏳', fields: [
      { key: 'date', label: 'Date', kind: 'date' },
      { key: 'endDate', label: 'Until', kind: 'date' },
      { key: 'category', label: 'Category', kind: 'select', options: ['Historical Events', 'Miscellaneous Events', 'Holidays'], fixed: ['Historical Events'] },
      { key: 'places', label: 'Where', kind: 'refs', to: ['place'] },
    ],
  },
  {
    type: 'campaign', label: 'Campaign', plural: 'Campaigns', icon: '🎲', fields: [
      { key: 'status', label: 'Status', kind: 'select', options: ['Planned', 'Running', 'Finished', 'One-shot'] },
      { key: 'summary', label: 'Summary', kind: 'longtext' },
      // where its party is now (set from the place's page)
      { key: 'partyAt', label: 'The party is at', kind: 'ref', to: ['place'] },
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
      { key: 'onTimeline', label: 'Show on the timeline', kind: 'bool' },
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
  combatants: EncounterLine[]; pins: Pin[]; ranks: RankLine[]; sheet: CharacterSheet; classes: ClassLine[]; effects: GearEffect[]; itemSpells: ItemSpell[]; requires: Requirements; mapData: MapScale | MapRoute[]
  speciesTraits: Trait[]; abilityBonus: AbilityBonus; skills: string[]; equipment: Equipment; spellRolls: SpellRoll[]; classBasics: ClassBasics; speeds: Speeds; regain: Regain; spellArea: SpellArea
  image: string
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

/** A type's name inside a sentence: lower case, but an abbreviation stays as it is ("New NPC", "New place"). */
export const typeWord = (t: EntryType) => TYPES[t].label.split(' ').map(w => (/^[A-Z]{2,}$/.test(w) ? w : w.toLowerCase())).join(' ')
