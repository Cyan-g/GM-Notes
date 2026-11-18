// The whole campaign lives in one Database object, saved as data/eldoria.json.

export type Id = string

/** An in-world date. Only `year` is required; month and day are 1-based. */
export interface WorldDate {
  year: number
  month?: number
  day?: number
}

export type Visibility = 'secret' | 'known'

export type EntryType =
  | 'npc' | 'pc' | 'organization' | 'place' | 'race' | 'deity' | 'creature'
  | 'item' | 'spell' | 'feat' | 'subclass' | 'event' | 'campaign' | 'session' | 'encounter' | 'writing' | 'note'

export interface Entry {
  id: Id
  type: EntryType
  name: string
  aliases: string[]
  tags: string[]
  /** Type-specific data, described by the schema (see schema.ts). */
  fields: Record<string, unknown>
  /** Markdown. Links are written [[id]] or [[id|label]]; `:::secret` blocks are DM-only. */
  body: string
  /** Whether the players know this entry exists. */
  visibility: Visibility
  /** Main picture, a path inside the data folder (images/...). */
  image?: string
  /** Attached files such as character sheet PDFs (files/...). */
  files?: string[]
  created: string
  updated: string
}

/**
 * Any connection between two entries, stored once and shown on both pages.
 * Direction matters for kinds like `parent` (a is parent of b) or `member` (a is member of b).
 */
export interface Relation {
  id: Id
  a: Id
  b: Id
  kind: RelationKind
  role?: string
  from?: WorldDate
  to?: WorldDate
  note?: string
  visibility: Visibility
}

export type RelationKind =
  | 'member' | 'parent' | 'sibling' | 'spouse' | 'ally' | 'rival' | 'mentor'
  | 'lives-in' | 'rules' | 'owns' | 'worships' | 'involved' | 'related'

// ---------- structured field values ----------

/** A money amount in copper pieces. Shown as gp/sp/cp. */
export type Copper = number

export interface RecipeLine { item: Id; amount: number }
/** One rank of an organization, highest first. `renown` is what it takes; none for a rank that is appointed. */
export interface RankLine { title: string; renown?: number; station?: string }

/** One line of an encounter: a creature entry (or just a name) and how many. */
export interface EncounterLine { creature?: Id; name?: string; count: number; hp?: number; ac?: number; init?: number }

/** A pin on a place's map. x and y are 0–1 across and down the picture. */
export interface Pin { id: string; x: number; y: number; entry?: Id; label?: string; note?: string }

export interface StockLine { item: Id; price?: Copper; stock?: number }

export interface Abilities { str: number; dex: number; con: number; int: number; wis: number; cha: number }

export interface Feature { name: string; text: string }

/** A player character's sheet (a PC entry's `sheet` field). Everything that follows from the rules is worked out, not stored. */
export interface CharacterSheet {
  abilities: Abilities
  /** Saving throws the character is proficient in. */
  saves: (keyof Abilities)[]
  /** 1 = proficient, 2 = expertise. */
  skills: Record<string, 1 | 2>
  hp?: number
  maxHp?: number
  tempHp?: number
  /** e.g. "d8"; how many are spent. */
  hitDie?: string
  hitDiceUsed?: number
  speed?: string
  /** Armor class typed by hand, instead of the one worked out from what's worn. */
  acOverride?: number
  /** Extra AC from anything else (a ring, a feature). */
  acBonus?: number
  initBonus?: number
  inspiration?: boolean
  /** The casting ability, if not the one the class uses. */
  spellAbility?: keyof Abilities
  inventory: InventoryLine[]
  money?: Copper
  features: Feature[]
  /** Armor, weapons, tools and languages, as text. */
  proficiencies?: string
  /** The character's own spellbook (the Spellbook page shows it while they're the current character). */
  spellbook?: Spellbook
  /** Tool proficiencies and known recipes for the Workbench; the ingredients are in the inventory. */
  crafting?: { tools: string[]; known: Id[] }
}
/** An item carried: an item entry (so weapons and armor count) or just a name. */
export interface InventoryLine { item?: Id; name?: string; qty: number; equipped?: boolean; attuned?: boolean }

export interface Statblock {
  /** Name of an SRD monster to take the stats from, when the block isn't written out. */
  srd?: string
  size?: string
  creatureType?: string
  alignment?: string
  ac?: number
  acNote?: string
  hp?: number
  hitDice?: string
  speed?: string
  abilities?: Abilities
  saves?: string
  skills?: string
  resistances?: string
  immunities?: string
  conditionImmunities?: string
  senses?: string
  languages?: string
  cr?: string
  traits?: Feature[]
  actions?: Feature[]
  bonusActions?: Feature[]
  reactions?: Feature[]
  legendary?: Feature[]
}

// ---------- calendar ----------

export interface Calendar {
  name: string
  months: { name: string; days: number }[]
  weekdays: string[]
  /** Gregorian-style leap rule: every 4 years, except 100, except 400. Adds a day to `leapMonth`. */
  leapMonth?: number
  /** Weekday (index into weekdays) of 1 January, year 1. */
  firstWeekDay: number
  moons: { name: string; cycle: number; offset: number }[]
  eras: { name: string; fromYear: number }[]
  /** Holidays that repeat every year. */
  holidays: { name: string; month: number; day: number; note?: string }[]
}

// ---------- spellbook ----------

/** One caster's spells and slots (what the Obsidian "Spell Tome" note did). */
export interface Spellbook {
  /** The character whose sheet gives the spell attack and save DC (instead of the typed numbers). */
  caster?: Id
  attackBonus?: number
  saveDC?: number
  /** How many spells may be prepared. */
  preparedMax?: number
  /** Index 0 is 1st level … 8 is 9th level. */
  slots: { max: number; used: number }[]
  /** Every spell in the book. `prepared` and `always` are taken from these. */
  known: Id[]
  prepared: Id[]
  /** Prepared without counting against the limit (cantrips, domain spells, …). */
  always: Id[]
}

// ---------- crafting ----------

/** The crafter's tools, known recipes, ingredient pouch and what they've made. */
export interface Crafting {
  /** Tool proficiencies, as written in an item's "Crafted with". */
  tools: string[]
  /** Items whose recipe is known. */
  known: Id[]
  pouch: { item: Id; qty: number }[]
  made: { item: Id; qty: number }[]
}

// ---------- initiative tracker ----------

export interface Combatant {
  id: string
  name: string
  entry?: Id
  isPlayer: boolean
  /** Which column it stands in; players are party and everyone else an enemy unless set. */
  side?: 'party' | 'enemy'
  init: number | null
  initMod: number
  hp?: number
  maxHp?: number
  tempHp?: number
  ac?: number
  conditions: string[]
  note?: string
}

export interface Tracker {
  encounter?: Id
  round: number
  /** Index into the sorted combatants; -1 before combat starts. */
  turn: number
  combatants: Combatant[]
}

export interface Database {
  /** Data format version; upgrade() in store.ts brings older files up to date. */
  version: number
  meta: {
    title: string
    today: WorldDate
    calendar: Calendar
    eventCategories: { id: string; name: string; color: string }[]
    /** When the world data was last saved with a change (shown on the Data page). */
    edited?: string
    /** When the data folder was last copied somewhere else with the Back up button. */
    externalBackup?: string
    /** Starred entries, in the order they were starred; shown on the home page. */
    favourites?: Id[]
    /** Web links kept on the home page (a watch-together room, a soundboard …). */
    links?: { label: string; url: string }[]
    /** The character whose spellbook, recipes and inventory the Spellbook and Workbench use. */
    currentCharacter?: Id
    /** Who this world is for. Player mode trims the app to spells, crafting and maps and hides DM-only text. */
    mode?: 'dm' | 'player'
    /** Colour theme and heading font (see theme.ts). */
    theme?: import('../theme').ThemeSettings
  }
  entries: Record<Id, Entry>
  relations: Relation[]
  tracker?: Tracker
  spellbook?: Spellbook
  crafting?: Crafting
}
