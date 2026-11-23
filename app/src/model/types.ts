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
  | 'npc' | 'pc' | 'organization' | 'place' | 'race' | 'background' | 'class' | 'deity' | 'creature'
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

/** A money amount: a number of the world's smallest coin (copper as standard), shown in its coins (money.ts). */
export type Copper = number

export interface RecipeLine { item: Id; amount: number }
/** One rank of an organization, highest first. `renown` is what it takes; none for a rank that is appointed. */
export interface RankLine { title: string; renown?: number; station?: string }
/**
 * One thing an item does to whoever wears, wields or attunes it (see effects.ts). `value` is added, or with `set` an
 * ability score is raised to it (Gauntlets of Ogre Power: STR 19), or with `force` it becomes that score even when
 * lower (a cursed ring: INT 6). `ability`, `skill`, `type` (a damage type, for resistance or extra damage) and
 * `text` (a feature) say what it applies to. `mode`: advantage or disadvantage (on a skill or a save, with an optional
 * `note` on when); `dice`: extra weapon damage ("2", "1d6"), only `proficient` if set; `sense` with `value` feet;
 * `condition`: a condition it makes the wearer immune to.
 */
export interface GearEffect {
  on: 'ac' | 'ability' | 'saves' | 'save' | 'attack' | 'damage' | 'spellAttack' | 'spellDC' | 'skill' | 'speed' | 'initiative' | 'maxHp' | 'maxHpLevel' | 'resistance' | 'damageImmunity' | 'hitDice' | 'feature'
    | 'skillAdv' | 'saveAdv' | 'extraDamage' | 'sense' | 'immunity' | 'acBase' | 'acMin' | 'unarmed' | 'offhandMod'
    // Medium Armor Master (Dex up to `value` in medium armor with DEX 16+), a speed equal to the walking one (Athlete's
    // climb), any one-handed melee weapon for the off-hand attack (Dual Wielder), the butt-end attack (Polearm
    // Master), advantage on death saves (Durable), and save proficiency in the ability the feat raised (Resilient)
    | 'mediumArmorDex' | 'speedType' | 'offhandAny' | 'poleStrike' | 'deathSaveAdv' | 'saveFromIncrease'
    // half the proficiency bonus on skill checks without proficiency (Jack of All Trades); spell damage (a spell's, or
    // a damage type's: Agonizing Blast, Elemental Affinity); advantage on Initiative (Remarkable Athlete); more
    // cantrips (Magician); Heroic Inspiration on a long rest (Resourceful)
    | 'halfProf' | 'spellDamage' | 'initiativeAdv' | 'cantrips' | 'restInspiration'
    // weapon attacks score a critical hit on this roll or higher (Champion: 19, then 18)
    | 'critRange'
  value?: number
  set?: boolean
  force?: boolean
  ability?: Ability
  skill?: string
  type?: string
  text?: string
  mode?: 'adv' | 'dis'
  note?: string
  dice?: string
  proficient?: boolean
  /** Initiative: plus the proficiency bonus (Alert). */
  pb?: boolean
  sense?: string
  /** `speedType`: the kind of speed, equal to the walking speed. */
  speedType?: 'climb' | 'swim' | 'fly' | 'burrow'
  /** `unarmed`: the die while holding no weapon or shield (Unarmed Fighting: d8 instead of d6). */
  emptyDice?: string
  /** `spellDamage`: only this spell's damage (else every spell's of `type`, or every spell's). */
  spell?: Id
  /** `unarmed`: Monk weapons (Simple melee, Martial melee with Light) get it too, the die and STR or DEX, while no
   * armor or shield is worn and only such weapons are held (Martial Arts). */
  monkWeapons?: boolean
  condition?: string
  /** AC formula (`acBase`): the ability modifiers added to `value` (Unarmored Defense: DEX and CON). */
  abilities?: Ability[]
  /** AC formula: not with a shield (a monk's Unarmored Defense). */
  noShield?: boolean
  /**
   * Attack, damage, extra damage or AC: only for melee or ranged attacks, finesse-or-ranged ones, weapons with the Heavy
   * property, a melee weapon in one hand and no other weapon (Dueling), thrown weapons (when thrown), or in armor.
   */
  when?: 'melee' | 'ranged' | 'finesseOrRanged' | 'heavy' | 'oneHanded' | 'thrown' | 'armored' | 'unarmored'
  /** A feature's effect whose number or dice is the feature's scaling value (Rage Damage, Sneak Attack, Martial Arts). */
  fromScale?: boolean
}
/**
 * What an item asks of whoever uses it (requirements.ts): minimum ability scores, one of some classes (or any
 * spellcaster), a race or a subrace of it, skill proficiencies, and a note for anything else.
 */
export interface Requirements {
  scores?: { ability: Ability; min: number }[]
  classes?: string[]
  spellcaster?: boolean
  races?: Id[]
  skills?: string[]
  /** One of the scores is enough (Grappler: Strength or Dexterity 13). */
  anyScore?: boolean
  /** Features the character must have, by name (a feat's "Fighting Style feature"). */
  features?: string[]
  note?: string
}
/**
 * A spell an item lets its user cast while it's worn, wielded or attuned (items.ts): for `cost` of the item's charges,
 * once per short or long rest or per day, at will, or `prepared` (added to the prepared spells, cast with the
 * character's own slots). `level`: cast at that level.
 */
export interface ItemSpell {
  spell: Id
  how: 'charges' | 'short' | 'long' | 'day' | 'atWill' | 'prepared'
  cost?: number
  level?: number
}
/**
 * A roll a spell makes (spells.ts): damage of a type, healing or temporary hit points; `dice` like "2d10", plus the
 * caster's spellcasting modifier if `mod`. A cantrip's dice grow at levels 5, 11 and 17 (`cantrip`); `slot` is added
 * for each slot level above the spell's ("1d6"). `note`: when or to whom ("half on a save", "each target").
 */
export interface SpellRoll {
  kind: 'damage' | 'healing' | 'tempHp'
  dice: string
  type?: string
  mod?: boolean
  cantrip?: boolean
  slot?: string
  note?: string
}
/** One of a character's classes: an option of the "class" list, its level, a subclass entry, a hit die for a class without a standard one. */
export interface ClassLine { class: string; level: number; subclass?: Id; die?: string }

/** A spell's area of effect: its shape and size in feet (a line's width, a cylinder's height). */
export interface SpellArea { shape: 'sphere' | 'cone' | 'cube' | 'line' | 'cylinder' | 'emanation'; size: number; width?: number; height?: number }

/** An item's charges coming back: how many (a number, dice such as "1d6+1", or "all") and when. */
export interface Regain { amount?: string; when?: 'dawn' | 'long' | 'short' | 'never' }

/** A race's speeds in feet (walk is its speed); `note` keeps what an old text speed said that isn't a number. */
export interface Speeds { walk?: number; swim?: number; fly?: number; climb?: number; burrow?: number; hover?: boolean; note?: string }

/**
 * What a class entry sets about its class ("Class basics" on its Edit page): each one it sets wins over the app's
 * built-in SRD value (classRules.ts); a homebrew class fills them in to work in the wizard, level-up and spell slots.
 */
export interface ClassBasics {
  hitDie?: string
  /** Its spell slots: full, half or third caster, a warlock's pact magic, an artificer's, or none. */
  caster?: 'full' | 'half' | 'third' | 'pact' | 'artificer' | 'none'
  casting?: Ability
  saves?: Ability[]
  skills?: { count: number; from: string[] }
  armor?: string[]
  weapons?: string[]
  tools?: string[]
  /** Cantrips known and spells prepared by class level (index 0 is level 1). */
  cantrips?: number[]
  prepared?: number[]
  /** Spellbook spells at level 1 (two more each level after). */
  spellbook?: number
  /**
   * Where its spells are prepared from: its class list, changed after a long rest (Cleric, Druid, Paladin); its class
   * list, one swapped when it gains a level (Bard, Ranger, Sorcerer, Warlock); or a spellbook (Wizard).
   */
  spellSource?: 'list' | 'swap' | 'book'
  /** The spellcasting focus it can use instead of materials without a cost (items' Focus field; a Bard's instrument). */
  focus?: 'Arcane focus' | 'Druidic focus' | 'Holy symbol' | 'Instrument'
  /** Starting equipment: the options (A, B…), each items (the world's, or by name) and coins. */
  equipment?: Equipment[]
  featLevels?: number[]
  subclassLevel?: number
  multiclass?: { primary: Ability[]; any?: boolean; armor: string[]; weapons: string[]; tools: string[]; skills?: number; instruments?: number }
}

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
/** One of the six abilities, by its key. */
export type Ability = keyof Abilities

export interface Feature { name: string; text: string; /** A statblock action that's an attack: its line is written from this. */ attack?: StatAttack }

/** A player character's sheet (a PC entry's `sheet` field). Everything that follows from the rules is worked out, not stored. */
export interface CharacterSheet {
  abilities: Abilities
  /** Renown with organizations (by id), as the DM hands it out: member or not. */
  renown?: Record<Id, number>
  /** Saving throws the character is proficient in. */
  saves: Ability[]
  /** 1 = proficient, 2 = expertise. */
  skills: Record<string, 1 | 2>
  hp?: number
  maxHp?: number
  /** The CON modifier `maxHp` was set with: when CON changes (an ASI, an edit, an Amulet of Health), max HP follows by
   * the difference × the character's level (sheet.ts baseMaxHp). Set when max HP is typed, else on the first change. */
  hpCon?: number
  tempHp?: number
  /** The hit die of a character without classes (with classes, each class brings its own). */
  hitDie?: string
  /** Hit dice spent, by die ("d8": 2). */
  hitDiceSpent?: Record<string, number>
  /** Walking speed in feet typed by hand, instead of the species' (text before data version 31). */
  speed?: number
  /** Armor class typed by hand, instead of the one worked out from what's worn. */
  acOverride?: number
  /** Extra AC from anything else (a ring, a feature). */
  acBonus?: number
  initBonus?: number
  inspiration?: boolean
  /** The casting ability, if not the one the class uses. */
  spellAbility?: Ability
  inventory: InventoryLine[]
  money?: Copper
  features: Feature[]
  /** The Origin feat, when not the background's: another feat's id, or null for none (a DM's ruling, or a choice). */
  originFeat?: Id | null
  /** Armor, weapons, tools and languages (see Proficiencies). */
  proficiencies?: Proficiencies
  /** The character's own spellbook (the Spellbook page shows it while they're the current character). */
  spellbook?: Spellbook
  /** Experience points (when the ruleset uses them; rules.ts). */
  xp?: number
  /** The size the player picked, when the species offers more than one ("Medium or Small"). */
  size?: string
  /** Conditions the character has (conditions.ts), the same list as their combatants' in the combat tracker. */
  conditions?: string[]
  /** Their exhaustion level (1–6) while they have Exhaustion. */
  exhaustion?: number
  /** Death saving throws while at 0 HP (the combat tracker shows the same ones). */
  deathSaves?: DeathSaveState
  /** The spell the character concentrates on (with the Concentrating condition); a second one ends it. */
  concentrating?: Id
  /** Creatures linked to the character (a familiar, a steed, a summon), each with its own name and hit points. */
  companions?: Companion[]
  /** Spells switched on, whose "while active" effects count on the sheet (Bless, Shield of Faith); a long rest ends them. */
  activeSpells?: Id[]
  /** Known recipes for the Workbench; the tools are in the proficiencies, the ingredients in the inventory. */
  crafting?: { known: Id[] }
  /** When the parts the DM and the player both change last changed, and on which side (sharedParts.ts). */
  sync?: import('../sharedParts').SheetSync
  /** Wild Shape (wildShape.ts): the Beasts the Druid knows as forms, and the one they're in now. */
  wildShape?: { forms?: Id[]; form?: Id }
  /** What the player chose in their species' traits and the uses spent (species.ts), by trait key. */
  species?: SpeciesState
}
/** A character's species choices and spent uses. Keys are "<race id>.<trait id>" (spells: plus ".s<n>"). */
export interface SpeciesState {
  /** The picks of a trait's choice: skills, language or tool ids, or the id of the chosen option. */
  picks?: Record<string, string[]>
  /** Switchable features that are on (their keys; Rage while raging); a long rest switches them off. */
  on?: string[]
  /** Uses spent since the last rest. */
  used?: Record<string, number>
  /** Once-per-rest spells cast since the last rest. */
  spellsUsed?: string[]
  /** Granted proficiencies and spells the player swapped for another of the same kind: their key → the id taken instead. */
  swaps?: Record<string, string>
  /** The casting ability picked for a trait's spells (its castWith): trait key → ability. */
  abilities?: Record<string, Ability>
}

// ---------- ability score bonuses (races' and feats' abilityIncrease; abilityBonus.ts) ----------

/** +`amount` to `count` different scores (default 1), from `among` (default any); never one a fixed bonus or another pick already raised. */
export interface AbilityPick { amount: number; count?: number; among?: Ability[] }
/**
 * What a race or feat may add to ability scores. Kept as data, never added to a sheet on its own (the character
 * creation wizard offers it). `orPick` is an alternative to `pick` ("+2 to one score or +1 to two"); `max` caps the
 * raised score; `note` keeps text that didn't fit.
 */
export interface AbilityBonus {
  fixed?: Partial<Abilities>
  pick?: AbilityPick[]
  orPick?: AbilityPick[]
  max?: number
  note?: string
}

// ---------- backgrounds (background entries; species.ts applies their proficiencies and features) ----------

/** One thing a background's starting equipment has: an item from the world, or just its name; `amount` defaults to 1. */
/** `among`: the player picks one of these items for the line (Wayfarer's gaming set of their choice). */
export interface EquipmentLine { item?: Id; name?: string; amount?: number; among?: Id[] }
/** A background's starting equipment: the items and coins, or `instead` coins in their place. Kept for the creation wizard. */
export interface Equipment { items?: EquipmentLine[]; money?: Copper; instead?: Copper }

// ---------- species traits (race entries' speciesTraits; species.ts) ----------

/** A proficiency or language a trait grants: a skill name, or an option id / Tool item id as in Proficiencies. */
export interface TraitGrant { kind: 'skill' | 'armor' | 'weapon' | 'tool' | 'language'; id: string }
/** A spell a trait gives: from character level `from` (default 1), at will, once per short or long rest, or always prepared. */
export interface TraitSpell {
  spell: Id
  /** `list`: on the spell list of the class it comes from (learnable, Dusk Prince); `book`: in the spellbook for free, prepared as usual (Hemomancer). */
  how: 'atWill' | 'short' | 'long' | 'prepared' | 'list' | 'book'
  from?: number
  /** The ability it's cast with, if the trait says (attack and DC are shown with it); else the trait's `castWith`. */
  ability?: Ability
  /** Once per rest (`short` / `long`) and also always prepared, cast with slots too (Magic Initiate's level 1 spell). */
  prepared?: boolean
  /** The player may swap it for another spell of these classes' lists (any) and this level (the spell's own). */
  swap?: { classes?: string[]; level?: string }
}
/** What a trait (or one of a choice's options) does. */
export interface TraitOption {
  id: string
  name: string
  text?: string
  effects?: GearEffect[]
  grants?: TraitGrant[]
  spells?: TraitSpell[]
  /** Choices that come with this option once it's picked (Pact of the Tome: three cantrips, two rituals). Not options themselves. */
  choices?: TraitChoice[]
  /** What it takes to pick this option: a level (of the class it comes from, or the character's) and another option of
   * the same choice picked first (Thirsting Blade: Pact of the Blade). */
  needs?: { level?: number; option?: string }
}
/**
 * A choice the player makes on the sheet: `count` skills, languages or tools (only from `among`, if given), or one
 * of several `options` (a lineage, an ancestry), each with its own effects, grants and spells; or spells, from the
 * world's spells that match `spell`.
 */
export interface TraitChoice {
  kind: 'skill' | 'language' | 'tool' | 'skillTool' | 'option' | 'expertise' | 'feat' | 'mastery' | 'spell'
  /** What it's called when it comes with an option ("Cantrips"); the option's name goes before it. */
  label?: string
  /** For a spell choice: which spells (any class's list, if `classes` is empty), and how the picked ones are cast. */
  spell?: { classes?: string[]; level?: string; ritual?: boolean; /** Only spells of these schools (Fey Touched: Divination or Enchantment). */ schools?: string[]; how: TraitSpell['how']; ability?: TraitSpell['ability']; prepared?: boolean }
  count?: number
  /** A skill choice: a picked skill the character is already proficient in becomes Expertise (Keen Mind, Observant). */
  orExpertise?: boolean
  /** The count from a character level on, replacing `count` ([[2, 2], [9, 4]]: two from level 2, four from 9). */
  steps?: [number, number][]
  among?: string[]
  options?: TraitOption[]
  /** For a feat choice: only feats of this kind ("Fighting Style"). */
  category?: string
  /** For a weapon mastery choice: only melee weapons (Barbarian). */
  meleeOnly?: boolean
}
/** A value that grows with the level, shown with the trait ("Rage Damage +2", "Sneak Attack 3d6"). */
export interface TraitScale { label: string; steps: [number, string][] }
/** A species trait. `id` stays the same when traits are reordered, so a character's choices and uses stay with it. */
export interface Trait extends TraitOption {
  /** From this character level on (default 1). */
  level?: number
  /** A subrace's trait that takes the place of one of its main race's (its id): that one is left out for the subrace. */
  replaces?: string
  /**
   * Uses that come back on a rest: a number, the proficiency bonus, the level (of the class it comes from), or an
   * ability modifier (at least 1); `times` multiplies it (Lay on Hands: 5 × level), `steps` gives the count by level.
   * A long-rest use can give `shortBack` back on a short rest (Rage: one).
   */
  uses?: { count: number | 'pb' | 'level' | Ability; recharge: 'short' | 'long'; times?: number; steps?: [number, number][]; shortBack?: number
    /** From this level on (of the class it comes from) all uses come back on a short rest too (Font of Inspiration: 5). */
    shortFrom?: number }
  /** Switched off when the character is incapacitated (Rage). */
  endsIncapacitated?: boolean
  /** Spells a use of it casts without a slot (Divine Smite once per long rest; Favored Enemy's Hunter's Mark). */
  freeCast?: Id[]
  /** A save DC it shows on the sheet: 8 + proficiency bonus + this ability's modifier (Monk's Focus, Cunning Strike). */
  dc?: Ability
  scale?: TraitScale
  /**
   * Whether it's listed on the sheet in play: by default only when there's something to use or read there (uses, a
   * scaling value, picked options, or rules the sheet doesn't work out); one that only gives what the sheet already
   * counts (proficiencies, spells, numbers) is left out. 'show' or 'hide' decides it instead.
   */
  onSheet?: 'show' | 'hide'
  /** Switched on and off in play (Rage): its effects only count while it's on. */
  toggle?: boolean
  choice?: TraitChoice
  /** More classes' spell lists the class it comes from can take its spells from (Magical Secrets: Cleric, Druid, Wizard). */
  spellLists?: string[]
  /**
   * The ability its spells (and its picked option's) are cast with, where a spell doesn't name one: the player's pick
   * `among` these, or the one picked for another trait of the same entry (`sameAs`, that trait's id).
   */
  castWith?: { among?: Ability[]; sameAs?: string }
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
/** Death saving throws at 0 HP: successes and failures; three successes make the character Stable, and the boxes
 * start over (`stable`); damage while stable ends it. Three failures: dead. */
export interface DeathSaveState { ok: number; fail: number; stable?: boolean }

export interface InventoryLine {
  item?: Id; name?: string; qty: number; equipped?: boolean; attuned?: boolean
  /** The character's own name for their copy of an item ("Grandfather's Blade") and a note on it ("engraved"). */
  label?: string
  note?: string
  /** The item's charges left (its full Charges while unset). */
  charges?: number
  /** The item's spells (by their place in its list) already used since the last rest. */
  used?: number[]
}

export interface Statblock {
  /** Name of an SRD monster to take the stats from, when the block isn't written out. */
  srd?: string
  /** A creature of this world to take the stats from (an NPC based on a Mummy Lord); its own fields go on top. */
  base?: Id
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
  /** Damage vulnerabilities ("Cold"). */
  vulnerabilities?: string
  /** Its spellcasting (creatures.ts): the ability, and the spells by how often, as world spells. */
  spellcasting?: { ability: Ability; lists: { label: string; spells: Id[] }[]; noMaterial?: boolean }
  /** Legendary actions per round, and in its lair; Legendary Resistance per day (and in its lair). */
  legendaryUses?: number
  legendaryLair?: number
  legendaryResistance?: number
  legendaryResistanceLair?: number
  /** Lair actions (initiative 20). */
  lair?: Feature[]
}
/** An action that's an attack: the line written from it (creatures.ts) with the creature's ability and proficiency. */
export interface StatAttack {
  kind: 'melee' | 'ranged' | 'both'
  ability: Ability
  reach?: number
  range?: string
  dice: string
  type: string
  /** More damage, e.g. "7 (2d6) Fire damage" written after "plus". */
  plus?: string
  /** What else a hit does ("If the target is a creature, it has the Prone condition."). */
  extra?: string
  /** A bonus to hit and damage (a magic weapon). */
  bonus?: number
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
  /** Fighting in its lair: its legendary actions (and resistance) use the lair counts. */
  inLair?: boolean
  /** What they're concentrating on, in a few words (a creature's Hold Person); a character's is on their sheet. */
  concOn?: string
  /** Death saving throws of a party member at 0 HP. */
  deathSaves?: DeathSaveState
  /** Legendary actions used since the start of its last turn. */
  legendaryUsed?: number
  note?: string
}

export interface Tracker {
  encounter?: Id
  round: number
  /** Index into the sorted combatants; -1 before combat starts. */
  turn: number
  combatants: Combatant[]
}

/** What one player sent the DM: their characters and the entries those use, kept here read-only. */
export interface PlayerShare {
  /** The name the player's app gives (their current character, else the computer's name). */
  who: string
  /** When their characters last arrived. */
  received: string
  /** Their characters: their id → the entry here; `gone` once they no longer share it (unlinked or deleted). */
  characters: Record<Id, { id: Id; gone?: boolean }>
  /** Every entry of theirs here (the characters and what they use): their id → the entry here. */
  entries: Record<Id, Id>
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
    /** The campaign being played: Home, the Campaign menu, a new character and the tracker's party follow it. */
    currentCampaign?: Id
    /** Who this world is for. Player mode trims the app to spells, crafting and maps and hides DM-only text. */
    mode?: 'dm' | 'player'
    /** The dropdown lists as changed on the Lists page (model/lists.ts); a list never changed isn't stored. */
    lists?: Record<string, import('./lists').ListOption[]>
    /** When this world was last published for players (see sync.ts). */
    lastPublished?: string
    /** The DM's sharing choices (sync.ts): host the live session whenever the world opens, send changes as they're made. */
    sharing?: { hostOnOpen?: boolean; autoSend?: boolean }
    /** Characters players sent from their worlds (playerCharacters.ts), by the player's world id. */
    fromPlayers?: Record<string, PlayerShare>
    /** Paces and vehicles added for travel on maps (travel.ts); the 5e ones are built in. */
    travelModes?: import('../travel').TravelMode[]
    /** Colour theme and heading font (see theme.ts). */
    theme?: import('../theme').ThemeSettings
    /** How printed cards look (see cards.ts); not part of a publish, so players keep their own. */
    cardStyle?: import('../cards').CardStyle
    /** The ruleset: presets of how rules work, one active (rules.ts; the Ruleset page). */
    rules?: import('../rules').RulesMeta
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

/** A creature linked to a character (CharacterSheet.companions): its statblock from the creature entry. */
export interface Companion {
  /** Tells copies of the same creature apart. */
  key: string
  creature: Id
  /** Its own name (Whiskers); the creature's name when empty. */
  name?: string
  /** Hit points now; the statblock's when empty. */
  hp?: number
  tempHp?: number
}
