// A player character's sheet: what's stored on the PC entry (fields.sheet) and the numbers worked out from it
// with the 5e rules: modifiers, proficiency bonus, saves, skills, armor class, attacks and spellcasting.
import { computed, reactive } from 'vue'
import { restSlots } from './slots'
import { classesOf, hitDicePools, totalLevel } from './model/classes'
import type { Abilities, CharacterSheet, Crafting, Entry, GearEffect, Id, InventoryLine, Proficiencies, Spellbook } from './model/types'
import { MARTIAL_WEAPONS, MASTERY_OF, SIMPLE_WEAPONS } from './model/schema'
import { optionsIn } from './model/lists'
import { db, get, listOptions, state, touch } from './store'
import { breakdown, gearTotals, restItems, scoreWith, spellsOf, sum, type RegainRoll } from './gear'
import { unmet } from './requirements'
import { setConditions } from './conditions'
import { rule } from './rules'
import { castingOf } from './classRules'
import { own, ownerOf, restSpecies, speciesExpertise, speciesGrants, speciesSkills, speciesSpeed, speciesSpeeds, speciesTraits } from './species'

export type Ability = keyof Abilities
export const ABILITIES: { key: Ability; label: string; short: string }[] = [
  { key: 'str', label: 'Strength', short: 'STR' }, { key: 'dex', label: 'Dexterity', short: 'DEX' },
  { key: 'con', label: 'Constitution', short: 'CON' }, { key: 'int', label: 'Intelligence', short: 'INT' },
  { key: 'wis', label: 'Wisdom', short: 'WIS' }, { key: 'cha', label: 'Charisma', short: 'CHA' },
]
export const SKILLS: { name: string; ability: Ability }[] = [
  { name: 'Acrobatics', ability: 'dex' }, { name: 'Animal Handling', ability: 'wis' }, { name: 'Arcana', ability: 'int' },
  { name: 'Athletics', ability: 'str' }, { name: 'Deception', ability: 'cha' }, { name: 'History', ability: 'int' },
  { name: 'Insight', ability: 'wis' }, { name: 'Intimidation', ability: 'cha' }, { name: 'Investigation', ability: 'int' },
  { name: 'Medicine', ability: 'wis' }, { name: 'Nature', ability: 'int' }, { name: 'Perception', ability: 'wis' },
  { name: 'Performance', ability: 'cha' }, { name: 'Persuasion', ability: 'cha' }, { name: 'Religion', ability: 'int' },
  { name: 'Sleight of Hand', ability: 'dex' }, { name: 'Stealth', ability: 'dex' }, { name: 'Survival', ability: 'wis' },
]

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
export const blankSheet = (): CharacterSheet => ({
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  saves: [], skills: {}, inventory: [], features: [],
})
/** A PC's sheet for reading, with anything never filled in at its default. */
export const sheetOf = (pc: Entry): CharacterSheet | undefined =>
  pc.fields.sheet ? own({ ...blankSheet(), ...(pc.fields.sheet) }, pc) : undefined
/** A PC's sheet for reading, blank if never filled in: still theirs, so their species and classes count on it. */
export const sheetOrBlank = (pc: Entry): CharacterSheet => sheetOf(pc) ?? own(blankSheet(), pc)
/** A PC's stored sheet for changing: created, or completed, as needed. */
export function sheetToEdit(pc: Entry): CharacterSheet {
  const s = (pc.fields.sheet ??= {} as CharacterSheet) as Partial<CharacterSheet>
  const blank = blankSheet() as unknown as Record<string, unknown>
  for (const k of ['abilities', 'saves', 'skills', 'inventory', 'features']) if ((s as Record<string, unknown>)[k] == null) (s as Record<string, unknown>)[k] = blank[k]
  return own(s as CharacterSheet, pc)
}

// ---------- proficiencies ----------

export const blankProfs = (): Proficiencies => ({ armor: [], weapons: [], tools: [], languages: [] })
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
/** A sheet's stored proficiencies for changing. */
export function profsToEdit(s: CharacterSheet): Proficiencies {
  const p = (s.proficiencies ??= blankProfs())
  for (const k of ['armor', 'weapons', 'tools', 'languages'] as const) p[k] ??= []
  return p
}

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
  if (e.fields.kind === 'Tool') return p.tools.includes(e.id)
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

const ORD = 9
const emptyBook = (): Spellbook => ({ slots: Array.from({ length: ORD }, () => ({ max: 0, used: 0 })), known: [], prepared: [], always: [] })
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
  const edit = (fn: (s: CharacterSheet) => void) => { const s = sheetToEdit(pc); fn(s); s.inventory = s.inventory.filter(l => !l.item || l.qty > 0); pc.updated = new Date().toISOString(); touch() }
  const crafting = () => (sheetToEdit(pc).crafting ??= { known: [] })
  return {
    // The tools are the sheet's tool proficiencies.
    tools: raw?.proficiencies?.tools ?? [], known: raw?.crafting?.known ?? [],
    // The pouch is the ingredients in the inventory; "crafted" is everything else made from a recipe.
    list: w => inv.filter(l => l.item && wanted(w, l.item) && (w === 'pouch' || (get(l.item)?.fields.recipe)?.length)).map(l => ({ item: l.item!, qty: l.qty })),
    add(_w, id, n) { edit(s => { const l = s.inventory.find(x => x.item === id); if (l) l.qty += n; else if (n > 0) s.inventory.push({ item: id, qty: n }) }) },
    set(_w, id, qty) { edit(s => { const l = s.inventory.find(x => x.item === id); if (l) l.qty = qty }) },
    setTools(t) { profsToEdit(sheetToEdit(pc)).tools = t; pc.updated = new Date().toISOString(); touch() },
    setKnown(k) { crafting().known = k; touch() },
  }
}

export const mod = (score?: number) => (score == null ? 0 : Math.floor((score - 10) / 2))
export const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`)
export const levelOf = (pc: Entry) => totalLevel(pc)
export const profBonus = (level: number) => 2 + Math.floor((level - 1) / 4)

/** An ability score with the active gear (set by a belt, raised by a tome…). */
export const score = (s: CharacterSheet, a: Ability) => scoreWith(s, a, gearTotals(s))
export const saveBonus = (s: CharacterSheet, a: Ability, prof: number) => {
  const t = gearTotals(s)
  return mod(scoreWith(s, a, t)) + (s.saves.includes(a) ? prof : 0) + sum(t.saves) + sum(t.save[a])
}
export const skillBonus = (s: CharacterSheet, name: string, prof: number) => {
  const sk = SKILLS.find(x => x.name === name)!
  const t = gearTotals(s)
  return mod(scoreWith(s, sk.ability, t)) + skillLevel(s, name) * prof + sum(t.skill[name])
}
/** Initiative: DEX (with gear), the sheet's own bonus and any gear. */
export const initiative = (s: CharacterSheet) => { const t = gearTotals(s); return mod(scoreWith(s, 'dex', t)) + (s.initBonus ?? 0) + sum(t.initiative) }
/** Maximum HP with gear (a Belt of Dwarvenkind-style +n); undefined while none is set. */
export const maxHpOf = (s: CharacterSheet) => {
  if (s.maxHp == null) return undefined
  const t = gearTotals(s), n = s.maxHp + sum(t.maxHp)
  return t.maxHpHalf ? Math.floor(n / 2) : n // 2014 exhaustion, level 4
}
/** The speed before gear: typed on the sheet, else the species' ("25 ft"), else nothing (30 ft is assumed). */
/** The species' other speeds, in words: "swim 30 ft, fly 30 ft (hover)". */
export function otherSpeeds(s: CharacterSheet): string {
  const sp = speciesSpeeds(ownerOf(s))
  return (['swim', 'fly', 'climb', 'burrow'] as const).filter(k => sp[k]).map(k => `${k} ${sp[k]} ft${k === 'fly' && sp.hover ? ' (hover)' : ''}`).join(', ')
}
export function baseSpeed(s: CharacterSheet): string | undefined {
  if (s.speed) return s.speed
  const n = speciesSpeed(ownerOf(s))
  return n ? `${n} ft` : undefined
}
/** Speed with gear: the number in the base speed ("30 ft") plus any bonus; the text as typed when there's none. */
export function speedOf(s: CharacterSheet): string | undefined {
  const t = gearTotals(s), add = sum(t.speed), base = baseSpeed(s)
  // a condition (Grappled, Restrained…) or exhaustion stops the character, or halves their speed
  if (t.speedZero) return '0 ft'
  const m = String(base ?? '30 ft').match(/(\d+)/)
  if (!add && !t.speedHalf) return base
  const n = Math.max(0, Number(m?.[1] ?? 30) + add)
  return m ? String(base ?? '30 ft').replace(m[1], String(t.speedHalf ? Math.floor(n / 2) : n)) : base
}
export const passivePerception = (s: CharacterSheet, prof: number) => 10 + skillBonus(s, 'Perception', prof)

/** A character at a glance, for the DM's party overview: AC, max HP, the passives, spell save DC, languages. */
export function partyLine(pc: Entry) {
  const s = sheetOrBlank(pc), prof = profBonus(levelOf(pc)), gt = gearTotals(s)
  const cast = castingAbility(pc, s)
  const langs = profsOf(s).languages, names = listOptions('language')
  return {
    ac: armorClass(s).ac,
    maxHp: maxHpOf(s),
    perception: 10 + skillBonus(s, 'Perception', prof),
    insight: 10 + skillBonus(s, 'Insight', prof),
    investigation: 10 + skillBonus(s, 'Investigation', prof),
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

/** A character's spell attack bonus and save DC, from their sheet; undefined without a casting ability. */
/** A caster's spell attack and save DC: with their class's casting ability, or `ability` (a trait's spell). */
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

const equipped = (s: CharacterSheet) => s.inventory.filter(l => l.equipped).map(l => get(l.item)).filter((e): e is Entry => !!e)

/**
 * Armor class from what's worn: body armor ("14 + dex(max 2)", "16") and shields ("+2"), plus the AC effects of the
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
  for (const e of equipped(s)) {
    const text = String(e.fields.armorClass ?? '').toLowerCase()
    const body = text.match(/^\s*(\d+)\s*(\+\s*dex(?:\s*\(\s*max\s*(\d+)\s*\))?)?/)
    const plus = text.match(/^\s*\+\s*(\d+)/)
    if (e.fields.kind === 'Armor' && body) {
      base = Number(body[1]) + (body[2] ? (body[3] ? Math.min(dex, Number(body[3])) : dex) : 0)
      from = `${base} ${e.name}`
      armored = true
    } else if (e.fields.kind === 'Armor' && plus) { extra += Number(plus[1]); parts.push(`+${plus[1]} ${e.name}`); shield = true }
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
    extra += p.n; parts.push(`${p.n >= 0 ? '+' : '−'}${Math.abs(p.n)} ${p.label}`)
  }
  if (s.acBonus) parts.push(`${s.acBonus >= 0 ? '+' : '−'}${Math.abs(s.acBonus)} typed bonus`)
  let ac = base + extra + (s.acBonus ?? 0)
  // A lowest AC (Barkskin) when the rest comes to less.
  for (const p of t.acMin) if (p.n > ac) { ac = p.n; parts.push(`at least ${p.n} from ${p.label}`) }
  return { ac, from: [from, ...parts].join(' · '), untrained }
}

export interface Attack { id: Id; name: string; toHit: number; damage: string; type?: string; note?: string; untrained?: boolean
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
  /** Whether a bonus limited to melee, ranged, or finesse-or-ranged attacks counts for this one. */
  const fits = (when: GearEffect['when'], ranged: boolean, finesse: boolean) => !when || (when === 'melee' && !ranged) || (when === 'ranged' && ranged) || (when === 'finesseOrRanged' && (finesse || ranged))
  const plus = (n: number) => (n ? ' ' + signed(n).replace('−', '− ').replace('+', '+ ') : '')
  const weapons = equipped(s).filter(e => e.fields.kind === 'Weapon')
  const nick = weapons.some(x => mastered.has(String(x.fields.baseWeapon)) && masteryOf(x) === 'Nick')
  function line(e: Entry, offhand = false): Attack {
    const props = propsOf(e), ranged = isRanged(e), finesse = props.includes('finesse')
    const m = finesse ? Math.max(str, dex) : ranged ? dex : str
    const hitParts = [...(t.attackOf[e.id] ?? []), ...t.attackAll].filter(p => fits(p.when, ranged, finesse))
    const dmgParts = [...(t.damageOf[e.id] ?? []), ...t.damageAll].filter(p => fits(p.when, ranged, finesse))
    const dice = String(e.fields.damage ?? '').trim()
    // The off-hand attack adds no ability modifier (unless it's negative), unless a feature says so (Two-Weapon Fighting).
    const ability = offhand && !t.offhandMod ? Math.min(m, 0) : m
    const dmg = ability + sum(dmgParts)
    const hands = props.includes('versatile') ? [' one-handed', ' two-handed'] : []
    const damage = dice ? dice.split('/').map((d, i) => `${d.trim()}${plus(dmg)}${hands[i] ?? ''}`).join(' / ') : '—'
    const untrained = proficientWith(s, e) === false
    const untrainedFor = proficientWith(s, e) !== true
    // Typed extra damage: "+ 2 necrotic", "+ 1d6 radiant", "+ 3d6 (once per turn)"; the proficient-only kind needs the proficiency.
    const extras = [...(t.extraOf[e.id] ?? []), ...t.extraAll].filter(x => (!x.proficient || !untrainedFor) && fits(x.when, ranged, finesse))
    const extraText = extras.map(x => ` + ${x.dice}${x.type ? ' ' + x.type.toLowerCase() : ''}${x.note ? ` (${x.note})` : ''}`).join('')
    const gear = [breakdown('To hit', hitParts), breakdown('Damage', dmgParts)].filter(Boolean).join('\n') || undefined
    const ms = masteryOf(e)
    const mastery = ms && mastered.has(String(e.fields.baseWeapon ?? '')) ? { name: ms, rule: ruleOf(ms) } : undefined
    return {
      id: e.id, name: e.name, toHit: m + (untrained ? 0 : prof) + sum(hitParts), damage: damage + extraText, type: (e.fields.damageType)?.join('/'), note: e.fields.range,
      untrained, gear, ...(mastery ? { mastery } : {}), ...(offhand ? { tag: nick ? 'off-hand (Nick)' : 'off-hand, bonus action' } : {}),
    }
  }
  const out = weapons.map(e => line(e))
  // two Light melee weapons: the second one's extra attack, off-hand
  const light = weapons.filter(e => propsOf(e).includes('light') && !isRanged(e))
  if (light.length >= 2) out.push(line(light[1], true))
  // the unarmed strike, only while no weapon is equipped (or a feature makes it a real attack, Martial Arts):
  // 1 + STR bludgeoning, or the feature's die with STR or DEX
  if (weapons.length && !t.unarmed) return out
  const u = t.unarmed, um = u?.dex ? Math.max(str, dex) : str
  const uHit = t.attackAll.filter(p => fits(p.when, false, !!u?.dex)), uDmg = t.damageAll.filter(p => fits(p.when, false, !!u?.dex))
  const uDice = u?.dice && /d/.test(u.dice) ? u.dice : undefined
  const uFlat = (uDice ? 0 : Number(u?.dice) || 1) + um + sum(uDmg)
  out.push({
    id: '__unarmed', name: 'Unarmed strike', toHit: um + prof + sum(uHit), damage: uDice ? `${uDice}${plus(um + sum(uDmg))}` : String(Math.max(1, uFlat)), type: 'Bludgeoning',
    noItem: true, ...(u ? { tag: u.from } : {}), gear: [breakdown('To hit', uHit), breakdown('Damage', uDmg)].filter(Boolean).join('\n') || undefined,
  })
  return out
}

/** Total weight carried, in lb. */
export const carried = (s: CharacterSheet) => s.inventory.reduce((t, l) => t + (Number(get(l.item)?.fields.weight) || 0) * (l.qty || 0), 0)

/** What the initiative tracker takes from a PC: AC, HP and the DEX for initiative. */
export function trackerStats(pc: Entry) {
  const s = sheetOf(pc)
  if (!s) return undefined
  return { ac: armorClass(s).ac, hp: s.hp ?? maxHpOf(s), maxHp: maxHpOf(s), initMod: initiative(s) }
}

// ---------- inventory: what can be done with a line, and dragging lines around ----------

/** Weapons and armor can be equipped, and anything else used for its effects, spells or charges (a ring, boots, a horn). */
export const canEquip = (l: InventoryLine) => {
  const e = get(l.item)
  return ['Weapon', 'Armor'].includes(String(e?.fields.kind ?? '')) || (!e?.fields.attunement && !!(e?.fields.effects?.length || spellsOf(e).length || e?.fields.charges))
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

/** Change a PC's sheet and mark the PC as changed (nothing happens in a tab that doesn't save). */
export function editSheet(pc: Entry, fn: (s: CharacterSheet) => void) {
  if (state.readOnly) return
  fn(sheetToEdit(pc))
  pc.updated = new Date().toISOString()
  touch()
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

/**
 * A character's long rest: full HP, no temporary HP, every spell slot back, and half the level in hit dice (at least
 * one), biggest dice first.
 */
/** A short rest: what recharges on one comes back (features, pact slots, item spells). Hit Dice are the player's to
 * spend and roll; they count them down on the sheet. */
export function shortRest(pc: Entry): RegainRoll[] {
  const s = sheetToEdit(pc)
  restSlots(s.spellbook, 'short')
  const rolls = restItems(s, 'short')
  restSpecies(s, pc, 'short')
  pc.updated = new Date().toISOString()
  touch()
  return rolls
}

export function longRest(pc: Entry): RegainRoll[] {
  const s = sheetToEdit(pc)
  s.hp = maxHpOf(s)
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
  pc.updated = new Date().toISOString()
  touch()
  return rolls
}
