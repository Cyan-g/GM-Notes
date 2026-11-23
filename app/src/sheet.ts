// A player character's sheet: the numbers worked out from what's stored on the PC entry (sheetData.ts) with the 5e
// rules: modifiers, proficiency bonus, saves, skills, armor class, attacks and spellcasting; and what's done with it
// (the current character, the Workbench, equipping and dragging inventory lines, rests).
import { computed, reactive } from 'vue'
import { restSlots } from './slots'
import { classesOf, totalLevel } from './model/classes'
import type { CharacterSheet, Crafting, Entry, GearEffect, Id, InventoryLine, Proficiencies, Spellbook, SpellRoll } from './model/types'
import { MARTIAL_WEAPONS, MASTERY_OF, SIMPLE_WEAPONS } from './model/schema'
import { optionsIn } from './model/lists'
import { db, get, listOptions, state, touch } from './store'
import { advOf, breakdown, gearTotals, scoreWith, sum, type Part } from './effects'
import { dexCap, isShield, isWearable, isWeaponOrArmor, restItems, type RegainRoll } from './items'
import { unmet } from './requirements'
import { setConditions } from './conditions'
import { longRestHeals, rule } from './rules'
import { castingOf, hitDicePools } from './classRules'
import { restSpecies, speciesExpertise, speciesGrants, speciesSize, speciesSkills, speciesSpeed, speciesSpeeds, speciesTraits, toolKindOf, type HaveNow } from './species'
import { blankProfs, emptyBook, onSheetEdit, ownerOf, profsToEdit, sheetOf, sheetOrBlank, sheetToEdit, stackItem } from './sheetData'
import { SKILLS, mod, profBonus, signed, type Ability } from './model/dnd'
import { changed } from './edit'

/**
 * A character's Hit Dice by die: their classes' (hitDicePools), plus what their features and gear add (Hemomancy:
 * the Constitution modifier), counted to the biggest die.
 */
export function hitDiceOf(pc: Entry, s: CharacterSheet): { die: string; total: number; spent: number }[] {
  const pools = hitDicePools(pc, s)
  const extra = gearTotals(s).hitDice.reduce((t, x) => t + x.n + (x.ability ? Math.max(1, mod(score(s, x.ability))) : 0), 0)
  if (extra > 0 && pools.length) {
    const p = pools[0]
    p.total += extra
    p.spent = Math.min(p.total, s.hitDiceSpent?.[p.die] ?? 0)
  }
  return pools
}

// ---------- proficiencies ----------

/**
 * A sheet's proficiencies for reading, with empty lists for anything never filled in, plus what the character's
 * species grants (not with `typedOnly`, for editing the typed ones).
 */
export function profsOf(s?: CharacterSheet, typedOnly = false): Proficiencies {
  const p: Proficiencies = { ...blankProfs(), ...s?.proficiencies }
  if (typedOnly) return p
  const LIST = { armor: 'armor', weapon: 'weapons', tool: 'tools', language: 'languages' } as const
  for (const g of speciesGrants(ownerOf(s), s)) {
    if (g.kind === 'skill') continue
    const k = LIST[g.kind]
    if (!p[k].includes(g.id)) p[k] = [...p[k], g.id]
  }
  return p
}
/** Proficiency in a skill: 0, 1 (proficient: typed, or from the species or a feature) or 2 (expertise: typed, or picked in a feature). */
export const skillLevel = (s: CharacterSheet, name: string): number =>
  speciesExpertise(ownerOf(s), s).has(name) ? 2 : Math.max(s.skills[name] ?? 0, speciesSkills(ownerOf(s), s).has(name) ? 1 : 0)

/** The category of a standard weapon ("Light Crossbow" → Simple), if it is one. */
export function categoryOf(weapon: string): 'Simple' | 'Martial' | undefined {
  if (SIMPLE_WEAPONS.includes(weapon)) return 'Simple'
  if (MARTIAL_WEAPONS.includes(weapon)) return 'Martial'
  return undefined
}

/**
 * Whether a character is proficient with an item: a weapon by its category or its base weapon, armor by its type,
 * a Tool item by being that tool. Undefined when the item needs no proficiency or doesn't say which it needs.
 */
export function proficientWith(s: CharacterSheet | undefined, e: Entry): boolean | undefined {
  const p = profsOf(s)
  if (e.fields.kind === 'Weapon') {
    const base = e.fields.baseWeapon
    const cat = e.fields.weaponCategory ?? (base ? categoryOf(base) : undefined)
    if (!cat) return base && p.weapons.includes(base) ? true : undefined
    return p.weapons.includes(cat) || (!!base && p.weapons.includes(base))
  }
  if (e.fields.kind === 'Armor') {
    const t = e.fields.armorType
    return !t || t === 'Clothing' ? undefined : p.armor.includes(t)
  }
  if (e.fields.kind === 'Tool' || e.fields.kind === 'Instrument') {
    if (p.tools.includes(e.id)) return true
    // one particular item of a kind ("Elmar's Lyre", of Type Lyre): proficiency in the kind covers it
    const kind = toolKindOf(e)
    if (kind && kind.id !== e.id && (p.tools.includes(kind.id) || p.tools.some(t => (get(t)?.name ?? t).trim().toLowerCase() === kind.name.trim().toLowerCase()))) return true
    return e.fields.kind === 'Tool' ? false : undefined
  }
  return undefined
}

// ---------- the current character ----------

/** The character the Spellbook, the Workbench and the Character menu are about. */
export const currentPc = computed(() => { const e = get(state.db?.meta.currentCharacter); return e?.type === 'pc' ? e : undefined })
export function setCurrent(id: Id | undefined) {
  const m = db().meta
  if (id) m.currentCharacter = id; else delete m.currentCharacter
  touch()
}

/** The spellbook in use: the given character's, else the current character's, else the world's. */
export function activeSpellbook(of?: Entry): Spellbook {
  const pc = of ?? currentPc.value
  if (pc) {
    const s = pc.fields.sheet
    if (s?.spellbook) return s.spellbook
    return (sheetToEdit(pc).spellbook = emptyBook())
  }
  const d = db()
  return (d.spellbook ??= emptyBook())
}

/** An item and how many: an ingredient in the pouch, or something crafted. */
export interface Held { item: Id; qty: number }
/**
 * The Workbench's data: the current character's (recipes and tool proficiencies on the sheet, ingredients and crafted
 * things in the inventory) or, with no current character, the world's own.
 */
export interface Bench {
  tools: string[]
  known: Id[]
  list(which: 'pouch' | 'made'): Held[]
  /** Add (or with a negative n, take out) some of an item. */
  add(which: 'pouch' | 'made', id: Id, n: number): void
  set(which: 'pouch' | 'made', id: Id, qty: number): void
  setTools(t: string[]): void
  setKnown(k: Id[]): void
}
const isIngredient = (id: Id) => get(id)?.fields.kind === 'Ingredient'

export function activeBench(of?: Entry): Bench {
  const pc = of ?? currentPc.value
  if (!pc) {
    const d = db()
    const c: Crafting = (d.crafting ??= { tools: [], known: [], pouch: [], made: [] })
    const tidy = (w: 'pouch' | 'made') => { c[w] = c[w].filter(p => p.qty > 0) }
    return {
      tools: c.tools, known: c.known,
      list: w => c[w],
      add(w, id, n) { const l = c[w].find(p => p.item === id); if (l) l.qty += n; else c[w].push({ item: id, qty: n }); tidy(w); touch() },
      set(w, id, qty) { const l = c[w].find(p => p.item === id); if (l) l.qty = qty; tidy(w); touch() },
      setTools(t) { c.tools = t; touch() },
      setKnown(k) { c.known = k; touch() },
    }
  }
  const raw = pc.fields.sheet
  const inv = raw?.inventory ?? []
  const wanted = (w: 'pouch' | 'made', id: Id) => (w === 'pouch') === isIngredient(id)
  const edit = (fn: (s: CharacterSheet) => void) => { const s = sheetToEdit(pc); fn(s); s.inventory = s.inventory.filter(l => !l.item || l.qty > 0); changed(pc) }
  const crafting = () => (sheetToEdit(pc).crafting ??= { known: [] })
  return {
    // The tools are the character's tool proficiencies: typed ones and those their class, background, species and feats give.
    tools: profsOf(sheetOrBlank(pc)).tools, known: raw?.crafting?.known ?? [],
    // The pouch is the ingredients in the inventory; "crafted" is everything else made from a recipe.
    list: w => inv.filter(l => l.item && wanted(w, l.item) && (w === 'pouch' || (get(l.item)?.fields.recipe)?.length)).map(l => ({ item: l.item!, qty: l.qty })),
    add(_w, id, n) { edit(s => stackItem(s, id, n)) },
    set(_w, id, qty) { edit(s => { const l = s.inventory.find(x => x.item === id); if (l) l.qty = qty }) },
    setTools(t) { profsToEdit(sheetToEdit(pc)).tools = t; changed(pc) },
    setKnown(k) { crafting().known = k; touch() },
  }
}

export const levelOf = (pc: Entry) => totalLevel(pc)

/** An ability score with the active gear (set by a belt, raised by a tome…). */
export const score = (s: CharacterSheet, a: Ability) => scoreWith(s, a, gearTotals(s))
export const saveBonus = (s: CharacterSheet, a: Ability, prof: number) => {
  const t = gearTotals(s)
  return mod(scoreWith(s, a, t)) + (s.saves.includes(a) ? prof : 0) + sum(t.saves) + sum(t.save[a])
}
export const skillBonus = (s: CharacterSheet, name: string, prof: number) => {
  const sk = SKILLS.find(x => x.name === name)!
  const t = gearTotals(s), level = skillLevel(s, name)
  // without proficiency, half the bonus (rounded down) with Jack of All Trades
  return mod(scoreWith(s, sk.ability, t)) + (level ? level * prof : t.halfProf ? Math.floor(prof / 2) : 0) + sum(t.skill[name])
}
/** Initiative: DEX (with gear), the sheet's own bonus and any gear. */
export const initiative = (s: CharacterSheet) => { const t = gearTotals(s); return mod(scoreWith(s, 'dex', t)) + (s.initBonus ?? 0) + sum(t.initiative) }
/** The CON modifier now, with gear and features: what max HP follows. */
export const conModOf = (s: CharacterSheet) => mod(scoreWith(s, 'con', gearTotals(s)))
/** What a change of CON since max HP was set adds (or takes): the modifier's difference × the character's level. */
export function conHpPart(s: CharacterSheet): Part | undefined {
  if (s.maxHp == null || s.hpCon == null) return undefined
  const d = conModOf(s) - s.hpCon
  if (!d) return undefined
  const pc = ownerOf(s), level = pc ? Math.max(1, totalLevel(pc)) : 1
  return { label: `${d > 0 ? "higher" : "lower"} CON since it was set (${signed(d)} × level ${level})`, n: d * level }
}
/** Maximum HP without gear: the one set, following CON. */
export const baseMaxHp = (s: CharacterSheet) => (s.maxHp == null ? undefined : s.maxHp + (conHpPart(s)?.n ?? 0))
/** Maximum HP with gear (a Belt of Dwarvenkind-style +n); undefined while none is set. */
export const maxHpOf = (s: CharacterSheet) => {
  const base = baseMaxHp(s)
  if (base == null) return undefined
  const t = gearTotals(s), n = base + sum(t.maxHp)
  return t.maxHpHalf ? Math.floor(n / 2) : n // 2014 exhaustion, level 4
}
/** Set max HP (typed, or the average): it's made with the CON there is now. */
export function setMaxHp(s: CharacterSheet, n: number | undefined) {
  s.maxHp = n
  if (n == null) delete s.hpCon; else s.hpCon = conModOf(s)
}
// Before a sheet changes, note the CON its max HP was made with, so a change of CON from now on is followed.
onSheetEdit(s => { if (s.maxHp != null && s.hpCon == null) s.hpCon = conModOf(s) })
/** A speed with what changes Speed: gear and features (+10 ft), exhaustion, encumbrance, and conditions that halve it or
 *  stop the character. Every speed changes alike (walking, swimming, flying…). */
function changedSpeed(base: number, t: ReturnType<typeof gearTotals>): number {
  if (t.speedZero) return 0
  const n = Math.max(0, base + sum(t.speed))
  return t.speedHalf ? Math.floor(n / 2) : n
}
/** The species' other speeds, in words: "swim 30 ft, fly 30 ft (hover)", changed like the walking speed. */
export function otherSpeeds(s: CharacterSheet): string {
  const sp = speciesSpeeds(ownerOf(s)), t = gearTotals(s)
  // a feat's speed equal to the walking one (Athlete's climb), where the species gives less
  const walk = baseSpeed(s) ?? 30
  const given: Partial<Record<string, number>> = {}
  for (const x of t.speedTypes) given[x.type] = walk
  return (['swim', 'fly', 'climb', 'burrow'] as const).filter(k => sp[k] || given[k])
    .map(k => `${k} ${changedSpeed(Math.max(sp[k] ?? 0, given[k] ?? 0), t)} ft${k === 'fly' && sp.hover ? ' (hover)' : ''}`).join(', ')
}
/** The walking speed before gear, in feet: typed on the sheet, else the species', else nothing (30 is assumed). */
export function baseSpeed(s: CharacterSheet): number | undefined {
  return s.speed ?? (speciesSpeed(ownerOf(s)) || undefined)
}
/** Speed with gear, in words ("30 ft"): the base speed plus any bonus, stopped or halved by conditions. */
export function speedOf(s: CharacterSheet): string | undefined {
  const t = gearTotals(s), add = sum(t.speed), base = baseSpeed(s)
  // a condition (Grappled, Restrained…) or exhaustion stops the character, or halves their speed
  if (!t.speedZero && !add && !t.speedHalf) return base != null ? `${base} ft` : undefined
  return `${changedSpeed(base ?? 30, t)} ft`
}
/** What a character has now, for a choice's options (species.ts choiceOffer). */
export function haveNow(s: CharacterSheet): HaveNow {
  const p = profsOf(s)
  const pc = ownerOf(s)
  return { skills: SKILLS.filter(x => skillLevel(s, x.name) > 0).map(x => x.name), weapons: p.weapons, languages: p.languages, classes: pc ? classesOf(pc).map(l => l.class.toLowerCase()) : [] }
}
/**
 * What features add to a spell's damage rolls (Agonizing Blast to Eldritch Blast, Elemental Affinity to fire spells):
 * for `rollText`'s `add`.
 */
export function spellDamageAdd(s: CharacterSheet | undefined, e: Entry): ((r: SpellRoll) => number) | undefined {
  if (!s) return undefined
  const t = gearTotals(s)
  if (!t.spellDamage.length) return undefined
  return r => r.kind !== 'damage' ? 0 : t.spellDamage
    .filter(x => (!x.spell || x.spell === e.id) && (!x.type || x.type.toLowerCase() === (r.type ?? '').toLowerCase()))
    .reduce((n, x) => n + x.n + (x.ability ? mod(scoreWith(s, x.ability, t)) : 0), 0)
}
/** A passive score: 10 + the skill, +5 with advantage on its checks, −5 with disadvantage. */
export function passiveOf(s: CharacterSheet, skill: string, prof: number) {
  const m = advOf(gearTotals(s).skillAdv[skill]).mode
  return 10 + skillBonus(s, skill, prof) + (m === 'adv' ? 5 : m === 'dis' ? -5 : 0)
}
export const passivePerception = (s: CharacterSheet, prof: number) => passiveOf(s, 'Perception', prof)

/** A character at a glance, for the DM's party overview: AC, max HP, the passives, spell save DC, languages. */
export function partyLine(pc: Entry) {
  const s = sheetOrBlank(pc), prof = profBonus(levelOf(pc)), gt = gearTotals(s)
  const cast = castingAbility(pc, s)
  const langs = profsOf(s).languages, names = listOptions('language')
  return {
    ac: armorClass(s).ac,
    maxHp: maxHpOf(s),
    perception: passiveOf(s, 'Perception', prof),
    insight: passiveOf(s, 'Insight', prof),
    investigation: passiveOf(s, 'Investigation', prof),
    spellDc: cast ? 8 + prof + mod(scoreWith(s, cast, gt)) + sum(gt.spellDC) : undefined,
    languages: langs.map(id => names.find(o => o.id === id)?.label ?? id),
  }
}

/** The ability a character casts with: picked on the sheet, else the one their class uses. */
export function castingAbility(pc: Entry, s: CharacterSheet): Ability | undefined {
  if (s.spellAbility) return s.spellAbility
  // The highest level class that casts.
  const lines = [...classesOf(pc)].sort((a, b) => (Number(b.level) || 0) - (Number(a.level) || 0))
  for (const l of lines) { const a = castingOf(l.class); if (a) return a }
  return undefined
}

/** A caster's spell attack and save DC, from their sheet: with their class's casting ability, or `ability` (a trait's
 * spell); undefined without a casting ability. */
export function spellStats(pc: Entry, ability?: Ability): { attack: number; dc: number; ability: Ability } | undefined {
  // Only once the scores are filled in; until then the spellbook's typed numbers count.
  if (!(pc.fields.sheet)?.abilities) return undefined
  const s = sheetOf(pc)!
  const a = ability ?? castingAbility(pc, s)
  if (!a) return undefined
  const t = gearTotals(s)
  const p = profBonus(levelOf(pc)), m = mod(scoreWith(s, a, t))
  return { attack: p + m + sum(t.spellAttack), dc: 8 + p + m + sum(t.spellDC), ability: a }
}

// ---------- what the inventory adds up to ----------

// (with the name the character gave their copy: "Grandfather's Blade" on the Attacks card)
const equipped = (s: CharacterSheet) => s.inventory.filter(l => l.equipped).map(l => { const e = get(l.item); return e && l.label ? { ...e, name: l.label } : e }).filter((e): e is Entry => !!e)

/**
 * Armor class from what's worn: body armor (its AC plus Dex as its armor type allows) and shields (what they add), plus the AC effects of the
 * active gear (a +1 shield, a Ring of Protection). Without body armor it's 10 + DEX. A number typed on the sheet wins.
 */
export function armorClass(s: CharacterSheet): { ac: number; from: string; untrained: string[] } {
  // Armor worn without its proficiency (disadvantage on STR and DEX rolls, no spellcasting).
  const untrained = equipped(s).filter(e => e.fields.kind === 'Armor' && proficientWith(s, e) === false).map(e => e.name)
  if (s.acOverride != null) return { ac: s.acOverride, from: 'typed on the sheet', untrained }
  const t = gearTotals(s)
  const m = (a: Ability) => mod(scoreWith(s, a, t))
  const dex = m('dex')
  let base = 10 + dex, from = 'unarmored', extra = 0, armored = false, shield = false
  const parts: string[] = []
  // a shield without training adds nothing (2024 ruleset), not even its magic
  const shieldOff = new Set<string>()
  for (const e of equipped(s)) {
    const n = e.fields.armorClass
    if (e.fields.kind !== 'Armor') continue
    // a shield is one however its AC is given (a number, or an AC effect like the world's Roundshield)
    if (isShield(e)) {
      shield = true
      if (proficientWith(s, e) === false && rule('untrainedShield') !== '2014') { shieldOff.add(e.name); parts.push(`${e.name}: no AC without shield training`); continue }
      if (typeof n === 'number') { extra += n; parts.push(`+${n} ${e.name}`) }
      continue
    }
    if (typeof n !== 'number') continue
    let cap = dexCap(e)
    // Medium Armor Master: a higher cap in medium armor with DEX 16+
    if (cap === 2 && t.mediumArmorDex && scoreWith(s, 'dex', t) >= 16 && t.mediumArmorDex.n > cap) { cap = t.mediumArmorDex.n; parts.push(`Dex up to +${cap} (${t.mediumArmorDex.from})`) }
    base = n + (cap === undefined ? 0 : cap === null ? dex : Math.min(dex, cap))
    from = `${base} ${e.name}`
    armored = true
  }
  // Without armor, the best AC formula a feature or spell gives (Unarmored Defense, Mage Armor, natural armor).
  if (!armored) {
    for (const f of t.acBase) {
      if (f.noShield && shield) continue
      const v = f.n + f.abilities.reduce((n, a) => n + m(a), 0)
      if (v > base) { base = v; from = `${v} ${f.label} (${[f.n, ...f.abilities.map(a => a.toUpperCase())].join(' + ')})` }
    }
  }
  if (from === 'unarmored') from = `${base} unarmored (10 + DEX)`
  for (const p of t.ac) {
    if (p.when === 'armored' && !armored) continue
    if (p.when === 'unarmored' && (armored || shield)) continue
    if (shieldOff.has(p.label)) continue
    extra += p.n; parts.push(`${signed(p.n)} ${p.label}`)
  }
  if (s.acBonus) parts.push(`${signed(s.acBonus)} typed bonus`)
  let ac = base + extra + (s.acBonus ?? 0)
  // A lowest AC (Barkskin) when the rest comes to less.
  for (const p of t.acMin) if (p.n > ac) { ac = p.n; parts.push(`at least ${p.n} from ${p.label}`) }
  return { ac, from: [from, ...parts].join(' · '), untrained }
}

export interface Attack { id: Id; name: string; toHit: number; damage: string; /** Extra damage (Sneak Attack), a line each. */ extras?: string[]; type?: string; note?: string; untrained?: boolean
  /** What gear adds to hit and to damage, for the tooltip. */
  gear?: string
  /** The weapon's mastery, when the character masters it, with its rule. */
  mastery?: { name: string; rule?: string }
  /** How it's made: an off-hand attack, the unarmed strike's feature. */
  tag?: string
  /** No item to open (the unarmed strike). */
  noItem?: boolean }

/**
 * One attack per equipped weapon: finesse weapons use the better of STR and DEX, ranged ones DEX.
 * The proficiency bonus is only added if the character is proficient with the weapon (or it doesn't say).
 */
export function attacks(s: CharacterSheet, prof: number): Attack[] {
  const t = gearTotals(s)
  const pc = ownerOf(s)
  const str = mod(scoreWith(s, 'str', t)), dex = mod(scoreWith(s, 'dex', t))
  // the base weapons the character masters (Weapon Mastery picks)
  const mastered = new Set(speciesTraits(pc, s).filter(a => a.active && a.trait.choice?.kind === 'mastery').flatMap(a => a.picks))
  const masteryOf = (e: Entry) => String(e.fields.mastery ?? MASTERY_OF[String(e.fields.baseWeapon ?? '')] ?? '')
  const ruleOf = (m: string) => optionsIn(state.db?.meta, 'weaponMastery').find(o => o.id === m)?.note
  const propsOf = (e: Entry) => ((e.fields.properties) ?? []).map(p => p.toLowerCase())
  const isRanged = (e: Entry) => propsOf(e).includes('ammunition') || /bow|crossbow|sling|blowgun|dart/i.test(`${e.name} ${e.fields.subtype ?? ''}`)
  const plus = (n: number) => (n ? ' ' + signed(n, '−', ' ') : '')
  const weapons = equipped(s).filter(e => e.fields.kind === 'Weapon')
  const meleeOneHand = (e: Entry) => !isRanged(e) && !propsOf(e).includes('two-handed')
  /**
   * Whether a bonus limited to melee, ranged, finesse-or-ranged or Heavy weapons counts for this attack; "one melee
   * weapon in one hand" (Dueling) only while it's the only weapon; "when thrown" never counts here (a line of its own).
   */
  const fits = (when: GearEffect['when'], ranged: boolean, finesse: boolean, e?: Entry) => !when
    || (when === 'melee' && !ranged) || (when === 'ranged' && ranged) || (when === 'finesseOrRanged' && (finesse || ranged))
    || (when === 'heavy' && !!e && propsOf(e).includes('heavy'))
    || (when === 'oneHanded' && !!e && meleeOneHand(e) && weapons.length === 1)
  const nick = weapons.some(x => mastered.has(String(x.fields.baseWeapon)) && masteryOf(x) === 'Nick')
  const shieldOn = equipped(s).some(isShield)
  // Martial Arts: Monk weapons (Simple melee, Martial melee with Light) use STR or DEX and the Martial Arts die when
  // it's bigger, while no armor or shield is worn and every weapon held is one
  const isMonkWeapon = (e: Entry) => {
    const cat = e.fields.weaponCategory ?? categoryOf(String(e.fields.baseWeapon ?? e.name))
    return !isRanged(e) && (cat === 'Simple' || (cat === 'Martial' && propsOf(e).includes('light')))
  }
  const ma = t.unarmed?.monkWeapons && /d/.test(t.unarmed.dice) && !equipped(s).some(e => e.fields.kind === 'Armor') && weapons.every(isMonkWeapon) ? t.unarmed : undefined
  const dieSize = (d: string) => Number(d.match(/d(\d+)/)?.[1]) || 0
  function line(e: Entry, offhand = false): Attack {
    const props = propsOf(e), ranged = isRanged(e), finesse = props.includes('finesse')
    const monk = !!ma && isMonkWeapon(e)
    const m = finesse || monk ? Math.max(str, dex) : ranged ? dex : str
    const hitParts = [...(t.attackOf[e.id] ?? []), ...t.attackAll].filter(p => fits(p.when, ranged, finesse, e))
    const allDmg = [...(t.damageOf[e.id] ?? []), ...t.damageAll]
    const dmgParts = allDmg.filter(p => fits(p.when, ranged, finesse, e))
    // a Monk weapon's own die, or the Martial Arts die when that's bigger ("1d6/1d8" for a versatile one, each)
    const ownDice = String(e.fields.damage ?? '').trim()
    const dice = monk ? ownDice.split('/').map(d => (dieSize(ma!.dice) > dieSize(d) ? ma!.dice : d.trim())).join('/') : ownDice
    // The off-hand attack adds no ability modifier (unless it's negative), unless a feature says so (Two-Weapon Fighting).
    const ability = offhand && !t.offhandMod ? Math.min(m, 0) : m
    const dmg = ability + sum(dmgParts)
    const hands = props.includes('versatile') ? [' one-handed', ' two-handed'] : []
    // a versatile weapon held in two hands isn't "in one hand" (Dueling)
    const twoHandDmg = dmg - sum(dmgParts.filter(p => p.when === 'oneHanded'))
    // the off-hand weapon is held in one hand, and so is any weapon with a shield on: a versatile one's one-handed damage only
    const dieList = dice.split('/').slice(0, offhand || shieldOn ? 1 : undefined)
    const damage = dice ? dieList.map((d, i) => `${d.trim()}${plus(i === 1 ? twoHandDmg : dmg)}${dieList.length > 1 ? hands[i] ?? '' : ''}`).join(' / ') : '—'
    // a bonus only when thrown (Thrown Weapon Fighting): a line of its own
    const thrown = props.includes('thrown') ? allDmg.filter(p => p.when === 'thrown') : []
    const untrained = proficientWith(s, e) === false
    const untrainedFor = proficientWith(s, e) !== true
    // Typed extra damage: "+ 2 necrotic", "+ 1d6 radiant", "+ 3d6 (once per turn)"; the proficient-only kind needs the proficiency.
    const extras = [...(t.extraOf[e.id] ?? []), ...t.extraAll].filter(x => (!x.proficient || !untrainedFor) && fits(x.when, ranged, finesse, e))
    // each on a line of its own under the damage: "+ 3d6 · Sneak Attack (once per turn)"
    // a Small or Tiny creature has disadvantage with Heavy weapons
    const small = props.includes('heavy') && /^(small|tiny)$/i.test(String(s.size ?? speciesSize(pc) ?? ''))
    const extraLines = [
      ...(small ? [`Disadvantage: a Heavy weapon in ${String(s.size ?? speciesSize(pc)).toLowerCase()} hands`] : []),
      ...thrown.map(p => `${signed(p.n)} when thrown · ${p.label}`),
      ...extras.map(x => `+ ${x.dice}${x.type ? ' ' + x.type.toLowerCase() : ''}${x.from ? ` · ${x.from}` : ''}${x.note ? ` (${x.note})` : ''}`),
    ]
    const gear = [breakdown('To hit', hitParts), breakdown('Damage', dmgParts)].filter(Boolean).join('\n') || undefined
    const ms = masteryOf(e)
    const mastery = ms && mastered.has(String(e.fields.baseWeapon ?? '')) ? { name: ms, rule: ruleOf(ms) } : undefined
    return {
      id: e.id, name: e.name, toHit: m + (untrained ? 0 : prof) + sum(hitParts), damage, ...(extraLines.length ? { extras: extraLines } : {}), type: (e.fields.damageType)?.join('/'), note: e.fields.range,
      untrained, gear, ...(mastery ? { mastery } : {}), ...(monk && !offhand ? { tag: ma!.from } : {}), ...(offhand ? { tag: nick ? 'off-hand (Nick)' : 'off-hand, bonus action' } : {}),
    }
  }
  // the same weapon twice (two daggers) is one line; the second one is the off-hand attack below
  const out = weapons.filter((e, i) => weapons.findIndex(x => x.id === e.id && x.name === e.name) === i).map(e => line(e))
  // two Light melee weapons: the second one's extra attack, off-hand; with Dual Wielder, any other one-handed melee weapon
  const light = weapons.filter(e => propsOf(e).includes('light') && !isRanged(e))
  const other = t.offhandAny && light.length ? weapons.find(e => e !== light[0] && meleeOneHand(e)) : undefined
  // two of the same Light weapon (two handaxes on one line) are two weapons
  const pair = light.length === 1 && s.inventory.some(l => l.item === light[0].id && l.equipped && l.qty >= 2)
  if (light.length >= 2) out.push(line(light[1], true))
  else if (pair) out.push(line(light[0], true))
  else if (other) out.push(line(other, true))
  // Polearm Master: the butt end (d4 bludgeoning) of a Quarterstaff, Spear or Heavy Reach weapon, as a bonus action
  if (t.poleStrike) {
    const pole = weapons.find(e => /quarterstaff|spear/i.test(`${e.fields.baseWeapon ?? ''} ${e.name}`) || (propsOf(e).includes('heavy') && propsOf(e).includes('reach')))
    if (pole) out.push({ ...line({ ...pole, fields: { ...pole.fields, damage: '1d4', properties: (pole.fields.properties ?? []).filter(p => !/versatile|thrown|heavy/i.test(p)) } }), type: 'Bludgeoning', tag: `bonus action · ${t.poleStrike}` })
  }
  // the unarmed strike, always there (grapple and shove too): 1 + STR bludgeoning, or a feature's die with STR or DEX
  const u = t.unarmed, um = u?.dex ? Math.max(str, dex) : str
  const uHit = t.attackAll.filter(p => fits(p.when, false, !!u?.dex)), uDmg = t.damageAll.filter(p => fits(p.when, false, !!u?.dex))
  // a bigger die with no weapon or shield in hand (Unarmed Fighting)
  const empty = !weapons.length && !equipped(s).some(isShield)
  const uDice = empty && u?.emptyDice ? u.emptyDice : u?.dice && /d/.test(u.dice) ? u.dice : undefined
  const uFlat = (uDice ? 0 : Number(u?.dice) || 1) + um + sum(uDmg)
  out.push({
    id: '__unarmed', name: 'Unarmed strike', toHit: um + prof + sum(uHit), damage: uDice ? `${uDice}${plus(um + sum(uDmg))}` : String(Math.max(0, uFlat)), type: 'Bludgeoning',
    noItem: true, ...(u ? { tag: u.from } : {}), gear: [breakdown('To hit', uHit), breakdown('Damage', uDmg)].filter(Boolean).join('\n') || undefined,
  })
  return out
}

/** The XP that reaches each next level (index: the level now); 2024 rules. */
export const XP_AT = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000]

/** What the initiative tracker takes from a PC: AC, HP and the DEX for initiative. */
export function trackerStats(pc: Entry) {
  const s = sheetOf(pc)
  if (!s) return undefined
  return { ac: armorClass(s).ac, hp: s.hp ?? maxHpOf(s), maxHp: maxHpOf(s), initMod: initiative(s) }
}

// ---------- inventory: what can be done with a line, and dragging lines around ----------

/** Weapons and armor can be equipped, and anything else used for its effects, spells or charges (a ring, boots, a horn)
 * unless it needs attunement (it's attuned instead). */
export const canEquip = (l: InventoryLine) => {
  const e = get(l.item)
  return !!e && isWearable(e) && (isWeaponOrArmor(e) || !e.fields.attunement)
}
/** Attunement: only items marked "Requires attunement" (and anything already attuned, so it can be taken off). */
export const canAttune = (l: InventoryLine) => !!l.attuned || !!get(l.item)?.fields.attunement

/**
 * Why a character can't equip (or attune, for an item that needs attunement) an inventory line's item now, from
 * the item's requirements; undefined when they can, or when it's the other toggle (which isn't checked).
 */
export function blockedFor(pc: Entry, l: InventoryLine, key: 'equipped' | 'attuned'): string | undefined {
  const e = get(l.item), s = sheetOf(pc)
  if (!e || !s) return undefined
  if (key !== (e.fields.attunement ? 'attuned' : 'equipped')) return undefined
  const why = unmet(pc, s, e, a => score(s, a as Ability), !!castingAbility(pc, s))
  return why.length ? `${e.name} ${why.join(', ')}` : undefined
}

/** The inventory line being dragged: from the inventory, or out of the equipped or attunement list. */
export const dragged = reactive<{ pc: Id | null; i: number; from: 'inventory' | 'equipped' | 'attuned' }>({ pc: null, i: -1, from: 'inventory' })
export function startDrag(ev: DragEvent, pc: Entry, i: number, from: 'inventory' | 'equipped' | 'attuned') {
  Object.assign(dragged, { pc: pc.id, i, from })
  ev.dataTransfer?.setData('text/plain', get(sheetOf(pc)?.inventory[i]?.item)?.name ?? '')
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move'
}
export const endDrag = () => { dragged.pc = null }
/** The line being dragged, if it belongs to this PC. */
export const draggedLine = (pc: Entry) => (dragged.pc === pc.id ? sheetOf(pc)?.inventory[dragged.i] : undefined)

/** A short rest: what recharges on one comes back (features, pact slots, item spells). Hit Dice are the player's to
 * spend and roll; they count them down on the sheet. */
/**
 * What a rest gave back, in a few words for the note after it: "Long rest: HP 12 → 38 · 3 spell slots · Rage ·
 * 2 Hit Dice · Exhaustion 1 → 0". `before` is the stored sheet as it was.
 */
export function restSummary(pc: Entry, before: CharacterSheet | undefined, kind: 'short' | 'long'): string {
  const now = sheetOrBlank(pc), was = (before ?? {}) as Partial<CharacterSheet>
  const out: string[] = []
  const max = maxHpOf(now)
  const hpWas = was.hp ?? max, hpNow = now.hp ?? max
  if (hpWas != null && hpNow != null && hpWas !== hpNow) out.push(`HP ${hpWas} → ${hpNow}`)
  const usedSlots = (b?: Spellbook) => (b?.slots ?? []).reduce((n, x) => n + (x.used || 0), 0) + (b?.pact?.used ?? 0)
  const slots = usedSlots(was.spellbook) - usedSlots(now.spellbook)
  if (slots > 0) out.push(`${slots} spell slot${slots === 1 ? '' : 's'}`)
  const usedWas = was.species?.used ?? {}, usedNow = now.species?.used ?? {}
  const traits = speciesTraits(pc, now)
  const back = Object.keys(usedWas).filter(k => (usedNow[k] ?? 0) < usedWas[k]).map(k => traits.find(a => a.key === k)?.trait.name ?? k)
  if (back.length) out.push([...new Set(back)].join(', '))
  const dice = (m?: Record<string, number>) => Object.values(m ?? {}).reduce((n, x) => n + x, 0)
  const hd = dice(was.hitDiceSpent) - dice(now.hitDiceSpent)
  if (hd > 0) out.push(`${hd} Hit ${hd === 1 ? 'Die' : 'Dice'}`)
  const exWas = was.conditions?.includes('Exhaustion') ? was.exhaustion ?? 1 : 0, exNow = now.conditions?.includes('Exhaustion') ? now.exhaustion ?? 1 : 0
  if (exWas !== exNow) out.push(`Exhaustion ${exWas} → ${exNow}`)
  const name = kind === 'long' ? 'Long rest' : 'Short rest'
  return out.length ? `${name}: ${out.join(' · ')}` : `${name}: nothing came back`
}

export function shortRest(pc: Entry): RegainRoll[] {
  const s = sheetToEdit(pc)
  restSlots(s.spellbook, 'short')
  const rolls = restItems(s, 'short')
  restSpecies(s, pc, 'short')
  changed(pc)
  return rolls
}

/**
 * A character's long rest: full HP (or, with the Ruleset's slow natural healing, none: Hit Dice are spent instead, and
 * a character at 0 wakes with 1), no temporary HP, every spell slot back, active spells and death saves ended, one
 * level of exhaustion off, and Hit Dice back (all of them, or half the level with at least one, as the ruleset says).
 */
export function longRest(pc: Entry): RegainRoll[] {
  const s = sheetToEdit(pc)
  const max = maxHpOf(s)
  s.hp = longRestHeals() ? max : Math.max(1, s.hp ?? max ?? 1)
  delete s.tempHp
  restSlots(s.spellbook, 'long')
  const rolls = restItems(s, 'long')
  restSpecies(s, pc, 'long')
  delete s.activeSpells
  // spells end, concentration with them; a long rest also ends death saves (they're back up with full HP)
  if (s.concentrating || s.conditions?.includes('Concentrating')) setConditions(pc, s, (s.conditions ?? []).filter(x => x !== 'Concentrating'))
  delete s.deathSaves
  if (s.conditions?.includes('Unconscious')) setConditions(pc, s, s.conditions.filter(x => x !== 'Unconscious'))
  // a long rest takes one level of exhaustion away
  if (s.conditions?.includes('Exhaustion')) {
    const lv = (s.exhaustion ?? 1) - 1
    setConditions(pc, s, lv > 0 ? s.conditions : s.conditions.filter(x => x !== 'Exhaustion'), lv > 0 ? lv : 0)
  }
  // Hit Dice back: all of them (2024) or half the character's level (2014), as the ruleset says
  let back = rule('hitDiceLongRest') === 'half' ? Math.max(1, Math.floor(totalLevel(pc) / 2)) : Infinity
  const m = { ...(s.hitDiceSpent ?? {}) }
  for (const p of hitDiceOf(pc, s)) {
    const n = Math.min(back, p.spent)
    if (n) { m[p.die] = p.spent - n; back -= n }
    if (!m[p.die]) delete m[p.die]
  }
  if (Object.keys(m).length) s.hitDiceSpent = m; else delete s.hitDiceSpent
  // Heroic Inspiration after each long rest (Resourceful)
  if (gearTotals(s).restInspiration && rule('inspiration') !== 'off') s.inspiration = true
  changed(pc)
  return rolls
}
