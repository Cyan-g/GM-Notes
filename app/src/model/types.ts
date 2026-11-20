// The whole campaign lives in one Database object while the app runs; it's stored in data/dndesk.sqlite (electron/db.cjs).

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
  fields: import('./schema').EntryFields
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
/**
 * One thing an item does to whoever wears, wields or attunes it (see gear.ts). `value` is added, or with `set` an
 * ability score is raised to it (Gauntlets of Ogre Power: STR 19), or with `force` it becomes that score even when
 * lower (a cursed ring: INT 6). `ability`, `skill`, `type` (a damage type, for resistance or extra damage) and
 * `text` (a feature) say what it applies to. `mode`: advantage or disadvantage (on a skill or a save, with an optional
 * `note` on when); `dice`: extra weapon damage ("2", "1d6"), only `proficient` if set; `sense` with `value` feet;
 * `condition`: a condition it makes the wearer immune to.
 */
export interface GearEffect {
  on: 'ac' | 'ability' | 'saves' | 'save' | 'attack' | 'damage' | 'spellAttack' | 'spellDC' | 'skill' | 'speed' | 'initiative' | 'maxHp' | 'resistance' | 'feature'
    | 'skillAdv' | 'saveAdv' | 'extraDamage' | 'sense' | 'immunity'
  value?: number
  set?: boolean
  force?: boolean
  ability?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'
  skill?: string
  type?: string
  text?: string
  mode?: 'adv' | 'dis'
  note?: string
  dice?: string
  proficient?: boolean
  sense?: string
  condition?: string
}
/**
 * What an item asks of whoever uses it (requirements.ts): minimum ability scores, one of some classes (or any
 * spellcaster), a race or a subrace of it, skill proficiencies, and a note for anything else.
 */
export interface Requirements {
  scores?: { ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'; min: number }[]
  classes?: string[]
  spellcaster?: boolean
  races?: Id[]
  skills?: string[]
  note?: string
}
/**
 * A spell an item lets its user cast while it's worn, wielded or attuned (gear.ts): for `cost` of the item's charges,
 * once per short or long rest or per day, at will, or `prepared` (added to the prepared spells, cast with the
 * character's own slots). `level`: cast at that level.
 */
export interface ItemSpell {
  spell: Id
  how: 'charges' | 'short' | 'long' | 'day' | 'atWill' | 'prepared'
  cost?: number
  level?: number
}
/** One of a character's classes: an option of the "class" list, its level, a subclass entry, a hit die for a class without a standard one. */
export interface ClassLine { class: string; level: number; subclass?: Id; die?: string }

/** One line of an encounter: a creature entry (or just a name) and how many. */
export interface EncounterLine { creature?: Id; name?: string; count: number; hp?: number; ac?: number; init?: number }

/** A pin on a place's map. x and y are 0–1 across and down the picture. */
export interface Pin { id: string; x: number; y: number; entry?: Id; label?: string; note?: string }
/**
 * A map's scale (travel.ts): two points (fractions of the map's width and height) `distance` miles or feet apart,
 * with the picture's size in pixels when it was set. `given`: the scale was set as a travel time ("3 days at a
 * normal pace"), turned into miles; kept to show it the way it was entered.
 */
export interface MapScale {
  a: { x: number; y: number }; b: { x: number; y: number }; distance: number; unit: 'mi' | 'ft'; w: number; h: number
  given?: { amount: number; unit: 'hours' | 'days'; mode: string }
}
/** A saved route on a map: its points, which legs (by number, from 0) are difficult terrain, and how it's travelled. */
export interface MapRoute { id: string; name: string; points: { x: number; y: number }[]; difficult?: number[]; mode?: string }

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
  /** The hit die of a character without classes (with classes, each class brings its own). */
  hitDie?: string
  /** Hit dice spent, by die ("d8": 2). */
  hitDiceSpent?: Record<string, number>
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
  /** Armor, weapons, tools and languages (see Proficiencies). */
  proficiencies?: Proficiencies
  /** The character's own spellbook (the Spellbook page shows it while they're the current character). */
  spellbook?: Spellbook
  /** Known recipes for the Workbench; the tools are in the proficiencies, the ingredients in the inventory. */
  crafting?: { known: Id[] }
}
/**
 * What a character is proficient with, by reference: option ids from the lists items use (armor types, weapon
 * categories or base weapons, languages) and Tool item ids; plus anything else as text.
 */
export interface Proficiencies {
  armor: string[]
  weapons: string[]
  /** Tool items. */
  tools: Id[]
  languages: string[]
  other?: string
}
/** An item carried: an item entry (so weapons and armor count) or just a name. */
export interface InventoryLine {
  item?: Id; name?: string; qty: number; equipped?: boolean; attuned?: boolean
  /** The item's charges left (its full Charges while unset). */
  charges?: number
  /** The item's spells (by their place in its list) already used since the last rest. */
  used?: number[]
}

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
  /** The first era (lowest fromYear) also covers every year before it. `short` is shown in dates (default: its initials). */
  eras: { name: string; short?: string; fromYear: number }[]
  /** Holidays that repeat every year. */
  holidays: { name: string; month: number; day: number; note?: string }[]
}

// ---------- spellbook ----------

/** One caster's spells and slots: a character's (sheet.spellbook), or the world's with no current character. */
export interface Spellbook {
  attackBonus?: number
  saveDC?: number
  /** How many spells may be prepared. */
  preparedMax?: number
  /**
   * Index 0 is 1st level … 8 is 9th level. A character with classes gets the count from the rules (slots.ts); `max`
   * counts only when typed in (`own`). Without classes (and for the world's book) `max` is always the count.
   */
  slots: { max: number; used: number; own?: boolean }[]
  /** Warlock pact slots spent, and a typed count instead of the rules' one. */
  pact?: { used: number; max?: number }
  /** Mystic Arcanum levels (6…9) used since the last long rest. */
  arcanaUsed?: number[]
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
  /** AC, HP and the initiative bonus of a player character with a sheet come from the sheet (see tracker.ts statsOf);
   * these are kept for everyone else, and for HP until the sheet has a max HP. */
  initMod: number
  hp?: number
  maxHp?: number
  tempHp?: number
  ac?: number
  conditions: string[]
  /** Rounds left on a condition, counting down at the end of this combatant's turn. */
  rounds?: Record<string, number>
  /** Concentration saves still to roll (their DCs), from damage taken while concentrating. */
  concChecks?: number[]
  /** Death saving throws of a party member at 0 HP. */
  deathSaves?: { ok: number; fail: number }
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
    /** The dropdown lists as changed on the Lists page (model/lists.ts); a list never changed isn't stored. */
    lists?: Record<string, import('./lists').ListOption[]>
    /** When this world was last published for players (see sync.ts). */
    lastPublished?: string
    /** Paces and vehicles added for travel on maps (travel.ts); the 5e ones are built in. */
    travelModes?: import('../travel').TravelMode[]
    /** Colour theme and heading font (see theme.ts). */
    theme?: import('../theme').ThemeSettings
    /** How printed cards look (see cards.ts); not part of a publish, so players keep their own. */
    cardStyle?: import('../cards').CardStyle
  }
  entries: Record<Id, Entry>
  relations: Relation[]
  tracker?: Tracker
  spellbook?: Spellbook
  crafting?: Crafting
  /** A player's world that follows a DM's published world (see sync.ts). */
  follow?: Follow
  /** The player's own notes on entries shared by the DM, by entry id (a sync never touches them). */
  playerNotes?: Record<Id, string>
}

/** The published world this world follows, and what the last update brought. */
export interface Follow {
  worldId: string
  title: string
  /** When the update that's in this world was published. */
  published?: string
  /** The shared entries and connections (read-only here, replaced by every update). */
  ids: Id[]
  relations: string[]
  /** Pictures and files: data path → the file's name in the shared folder (by its content). */
  files: Record<string, string>
}
