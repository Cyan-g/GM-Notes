// What effects do to a character: an item in use (items.ts), a species trait or class feature (species.ts) and a spell
// switched on (spells.ts) can carry effects (AC +1, STR set to 19, resistance to fire…), described here in words.
// The sheet's numbers add them up, with the character's conditions and load, and every total can say where it comes
// from (shown on hover).
import type { CharacterSheet, Entry, GearEffect, Id } from './model/types'
import { isHeavyStrength, requirementsOf } from './requirements'
import { speciesEffects, speciesSize } from './species'
import { ownerOf } from './sheetData'
import { rule } from './rules'
import { applyConditions } from './conditions'
import { ABILITY_UPPER, SKILLS, mod, profBonus, signed, type Ability } from './model/dnd'
import { activeEffectsOf, activeSpells } from './spells'
import { totalLevel } from './model/classes'
import { activeGear, itemsInUse, weightOf } from './items'

/** One contribution to a number: what it comes from and how much. */
export interface Part { label: string; n: number; when?: GearEffect['when'] }

/** What an effect needs besides a number, in the editor. */
export type EffectNeed = 'ability' | 'skill' | 'type' | 'text' | 'mode' | 'note' | 'dice' | 'proficient' | 'sense' | 'condition' | 'pb' | 'plusAbility' | 'abilities' | 'noShield' | 'when' | 'speedType' | 'emptyDice'
/** What an effect can change, for the editor and the item card. */
export const EFFECT_KINDS: { on: GearEffect['on']; label: string; needs?: EffectNeed[]; canSet?: boolean; noValue?: boolean }[] = [
  { on: 'ac', label: 'Armor class', needs: ['when'] },
  { on: 'acBase', label: 'AC formula (without armor)', needs: ['abilities', 'noShield'] },
  { on: 'acMin', label: 'AC at least' },
  { on: 'ability', label: 'Ability score', needs: ['ability'], canSet: true },
  { on: 'saves', label: 'All saving throws' },
  { on: 'save', label: 'One saving throw', needs: ['ability'] },
  { on: 'saveAdv', label: 'Save: advantage / disadvantage', needs: ['ability', 'mode', 'note'], noValue: true },
  { on: 'attack', label: 'Attack rolls', needs: ['when'] },
  { on: 'damage', label: 'Damage rolls', needs: ['when', 'pb'] },
  { on: 'extraDamage', label: 'Extra damage (typed)', needs: ['dice', 'type', 'proficient', 'when', 'note'], noValue: true },
  { on: 'unarmed', label: 'Unarmed strike', needs: ['dice', 'proficient', 'emptyDice'], noValue: true },
  { on: 'offhandMod', label: 'Off-hand attack adds its modifier', noValue: true },
  { on: 'offhandAny', label: 'Off-hand attack with any one-handed melee weapon', noValue: true },
  { on: 'poleStrike', label: 'Butt-end attack (d4, bonus action)', noValue: true },
  { on: 'mediumArmorDex', label: 'Medium armor: Dex up to (with DEX 16+)' },
  { on: 'speedType', label: 'A speed equal to the walking speed', needs: ['speedType'], noValue: true },
  { on: 'deathSaveAdv', label: 'Advantage on death saves', noValue: true },
  { on: 'saveFromIncrease', label: 'Save proficiency in the ability raised', noValue: true },
  { on: 'spellAttack', label: 'Spell attack' },
  { on: 'spellDC', label: 'Spell save DC' },
  { on: 'skill', label: 'A skill', needs: ['skill', 'plusAbility'] },
  { on: 'skillAdv', label: 'Skill: advantage / disadvantage', needs: ['skill', 'mode'], noValue: true },
  { on: 'speed', label: 'Speed (ft)' },
  { on: 'initiative', label: 'Initiative', needs: ['pb'] },
  { on: 'maxHp', label: 'Maximum HP' },
  { on: 'maxHpLevel', label: 'Max HP per level' },
  { on: 'hitDice', label: 'Hit Dice', needs: ['plusAbility'] },
  { on: 'resistance', label: 'Resistance', needs: ['type'], noValue: true },
  { on: 'damageImmunity', label: 'Damage immunity', needs: ['type'], noValue: true },
  { on: 'immunity', label: 'Condition immunity', needs: ['condition'], noValue: true },
  { on: 'sense', label: 'Sense (ft)', needs: ['sense'] },
  { on: 'feature', label: 'Feature', needs: ['text'], noValue: true },
]
export const SENSES = ['Darkvision', 'Blindsight', 'Tremorsense', 'Truesight']
const MODE: Record<string, string> = { adv: 'Advantage', dis: 'Disadvantage' }
const ABILITY_SHORT: Record<string, string> = ABILITY_UPPER
/** An effect's limit, in words. */
const WHEN: Record<string, string> = { melee: ' (melee)', ranged: ' (ranged)', finesseOrRanged: ' (finesse or ranged)', heavy: ' (Heavy weapons)', oneHanded: ' (one melee weapon in one hand)', thrown: ' (when thrown)', armored: ' (in armor)' }

/**
 * A list of effects in a few words each, with the same advantage on every saving throw said once ("Advantage on
 * all saves against spells and magical effects" for Magic Resistance's six).
 */
export function describeEffects(list: GearEffect[]): string[] {
  const out: string[] = [], done = new Set<GearEffect>()
  for (const f of list) {
    if (done.has(f)) continue
    if (f.on === 'saveAdv') {
      const same = list.filter(x => x.on === 'saveAdv' && x.mode === f.mode && (x.note ?? '') === (f.note ?? ''))
      if (new Set(same.map(x => x.ability)).size === 6) {
        same.forEach(x => done.add(x))
        out.push(`${MODE[f.mode ?? 'adv']} on all saves${f.note ? ' ' + f.note : ''}`)
        continue
      }
    }
    out.push(describeEffect(f))
  }
  return out
}
/**
 * What the character carries against what they can (the Carrying capacity rule, rules.ts): Strength × 15 lb (× 2 for
 * Large, × ½ for Tiny), or, as the encumbrance variant, over × 5 encumbered and over × 10 heavily encumbered.
 * Undefined while the rule is off.
 */
export function loadOf(s: CharacterSheet, t?: GearTotals): { carried: number; capacity: number; state: 'ok' | 'over' | 'encumbered' | 'heavy'; light?: number; heavy?: number } | undefined {
  const mode = rule('carryingCapacity')
  if (mode === 'off') return undefined
  const str = t ? scoreWith(s, 'str', t) : s.abilities.str
  const size = String(speciesSize(ownerOf(s)) ?? 'Medium')
  const k = /large/i.test(size) ? 2 : /tiny/i.test(size) ? 0.5 : 1
  const carried = weightOf(s), capacity = str * 15 * k
  if (mode === 'capacity') return { carried, capacity, state: carried > capacity ? 'over' : 'ok' }
  const light = str * 5 * k, heavy = str * 10 * k
  return { carried, capacity, light, heavy, state: carried > heavy ? 'heavy' : carried > light ? 'encumbered' : 'ok' }
}
/** An effect in a few words: "+1 AC", "STR 19", "Resistance: fire", "+2 Stealth". */
export function describeEffect(f: GearEffect): string {
  const v = Number(f.value) || 0
  switch (f.on) {
    case 'ac': return `${signed(v)} AC${WHEN[f.when ?? ''] ?? ''}`
    case 'acBase': return `AC ${v} + ${(f.abilities ?? []).map(a => ABILITY_SHORT[a]).join(' + ') || '—'} without armor${f.noShield ? ' or shield' : ''}`
    case 'acMin': return `AC at least ${v}`
    case 'unarmed': return `Unarmed strike: ${f.dice || (f.fromScale ? 'the scaling die' : '1')}${f.emptyDice ? ` (${f.emptyDice} with no weapon or shield)` : ''}${f.proficient ? ', with STR or DEX' : ''}`
    case 'offhandMod': return 'Off-hand attack adds the ability modifier'
    case 'offhandAny': return 'Off-hand attack with any one-handed melee weapon'
    case 'poleStrike': return 'Butt-end attack: d4 bludgeoning, bonus action'
    case 'mediumArmorDex': return `Medium armor: up to +${v || 3} Dex to AC with DEX 16+`
    case 'speedType': return `${(f.speedType ?? 'climb')[0].toUpperCase()}${(f.speedType ?? 'climb').slice(1)} speed equal to the walking speed`
    case 'deathSaveAdv': return 'Advantage on death saves'
    case 'saveFromIncrease': return 'Saving throw proficiency in the ability it raises'
    case 'ability': return f.force ? `${ABILITY_SHORT[f.ability ?? ''] ?? '?'} becomes ${v}` : f.set ? `${ABILITY_SHORT[f.ability ?? ''] ?? '?'} ${v}` : `${signed(v)} ${ABILITY_SHORT[f.ability ?? ''] ?? '?'}`
    case 'saves': return `${signed(v)} to saving throws`
    case 'save': return `${signed(v)} to ${ABILITY_SHORT[f.ability ?? ''] ?? '?'} saves`
    case 'attack': return `${signed(v)} to hit${WHEN[f.when ?? ''] ?? ''}`
    case 'damage': return `${f.fromScale && f.value == null ? '+ scaling value' : f.pb ? `${v ? signed(v) + ' and ' : '+'}proficiency bonus` : signed(v)} damage${WHEN[f.when ?? ''] ?? ''}`
    case 'spellAttack': return `${signed(v)} spell attack`
    case 'spellDC': return `${signed(v)} spell save DC`
    case 'skill': return f.ability ? `${v ? signed(v) + ' and ' : '+'}${ABILITY_SHORT[f.ability]} modifier (at least 1) to ${f.skill ?? 'a skill'}` : `${signed(v)} ${f.skill ?? 'skill'}`
    case 'speed': return `${signed(v)} ft speed`
    case 'initiative': return f.pb ? `${v ? signed(v) + ' and ' : '+'}proficiency bonus to initiative` : `${signed(v)} initiative`
    case 'maxHp': return `${signed(v)} max HP`
    case 'maxHpLevel': return `${signed(v)} max HP per level`
    case 'hitDice': return `${[v ? signed(v) : '', f.ability ? `+${ABILITY_SHORT[f.ability]} modifier (at least 1)` : ''].filter(Boolean).join(' ') || '+0'} Hit Dice`
    case 'resistance': return `Resistance: ${(f.type ?? '').toLowerCase()}`
    case 'damageImmunity': return `Immune: ${(f.type ?? '').toLowerCase()} damage`
    case 'skillAdv': return `${MODE[f.mode ?? 'adv']} on ${f.skill ?? 'a skill'}`
    case 'saveAdv': return `${MODE[f.mode ?? 'adv']} on ${ABILITY_SHORT[f.ability ?? ''] ?? '?'} saves${f.note ? ' ' + f.note : ''}`
    case 'extraDamage': return `+${f.dice || (f.fromScale ? ' scaling dice' : '?')} ${(f.type ?? '').toLowerCase()} damage${f.proficient ? ' (if proficient)' : ''}${WHEN[f.when ?? ''] ?? ''}${f.note ? ` (${f.note})` : ''}`.replace('  ', ' ')
    case 'sense': return `${f.sense ?? 'Darkvision'} ${v} ft`
    case 'immunity': return `Immune: ${(f.condition ?? '').toLowerCase()}`
    case 'feature': return f.text ?? ''
  }
}


export interface Extra { dice: string; type?: string; proficient?: boolean; from: string; when?: GearEffect['when']; note?: string }
export interface GearTotals {
  /** An ability score raised to a value (the highest, if several), forced to one (the lowest), and what's added. */
  setAbility: Partial<Record<Ability, Part>>
  forceAbility: Partial<Record<Ability, Part>>
  addAbility: Partial<Record<Ability, Part[]>>
  save: Partial<Record<Ability, Part[]>>
  saves: Part[]
  skill: Record<string, Part[]>
  ac: Part[]
  /** AC formulas without armor (Unarmored Defense, Mage Armor, natural armor), and a lowest AC (Barkskin). */
  acBase: { label: string; n: number; abilities: Ability[]; noShield?: boolean }[]
  acMin: Part[]
  /** The unarmed strike's damage dice and whether it may use DEX (Martial Arts); the off-hand attack adding its modifier. */
  unarmed?: { dice: string; dex: boolean; from: string; emptyDice?: string }
  offhandMod?: string
  /** Any one-handed melee weapon for the off-hand attack; the butt-end attack; advantage on death saves (by what gives it). */
  offhandAny?: string
  poleStrike?: string
  deathSaveAdv?: string
  /** Medium armor's highest Dex bonus with DEX 16+, and speeds equal to the walking one (climb, swim…). */
  mediumArmorDex?: { n: number; from: string }
  speedTypes: { type: string; from: string }[]
  /** What the character's conditions do beyond the parts above (conditions.ts): speed 0 or halved, hit point maximum
   * halved, and advantage or disadvantage on attack rolls (shown with the attacks). */
  speedZero?: string
  speedHalf?: string
  maxHpHalf?: string
  attackMode?: { mode: 'adv' | 'dis'; from: string }[]
  speed: Part[]
  initiative: Part[]
  /** More Hit Dice: a number, plus an ability's modifier (at least 1) where it says. */
  hitDice: { label: string; n: number; ability?: Ability }[]
  maxHp: Part[]
  spellAttack: Part[]
  spellDC: Part[]
  /** Attack and damage bonuses for every attack, and for one weapon's own attacks. */
  attackAll: Part[]
  damageAll: Part[]
  attackOf: Record<Id, Part[]>
  damageOf: Record<Id, Part[]>
  resistances: { type: string; from: string }[]
  features: { text: string; from: string }[]
  /** Advantage or disadvantage on a skill or a save (with when, for a save). */
  skillAdv: Record<string, { mode: 'adv' | 'dis'; from: string }[]>
  saveAdv: Partial<Record<Ability, { mode: 'adv' | 'dis'; note?: string; from: string }[]>>
  /** Typed extra damage, for one weapon's attacks or every attack. */
  extraOf: Record<Id, Extra[]>
  extraAll: Extra[]
  senses: { sense: string; range: number; from: string }[]
  immunities: { condition: string; from: string }[]
  damageImmunities: { type: string; from: string }[]
}

/**
 * Everything the active gear and the character's species traits (species.ts) add up to. A weapon's attack and damage
 * bonuses count for that weapon only.
 */
/**
 * Advantage or disadvantage on a Concentration save (War Caster) and on death saves (Durable), in words, from a sheet's
 * totals: "advantage (War Caster)"; undefined when nothing changes the roll.
 */
export function concentrationAdv(t: GearTotals): string | undefined {
  const l = (t.saveAdv.con ?? []).filter(x => !x.note || /concentrat/i.test(x.note))
  return l.length ? l.map(x => `${x.mode === 'dis' ? 'disadvantage' : 'advantage'} (${x.from})`).join(', ') : undefined
}
export const deathSaveAdv = (t: GearTotals): string | undefined => (t.deathSaveAdv ? `advantage (${t.deathSaveAdv})` : undefined)

export function gearTotals(s: CharacterSheet | undefined): GearTotals {
  const t: GearTotals = {
    setAbility: {}, forceAbility: {}, addAbility: {}, save: {}, saves: [], skill: {}, ac: [], acBase: [], acMin: [], speed: [], initiative: [], hitDice: [], maxHp: [], spellAttack: [], spellDC: [],
    attackAll: [], damageAll: [], attackOf: {}, damageOf: {}, resistances: [], features: [], speedTypes: [],
    skillAdv: {}, saveAdv: {}, extraOf: {}, extraAll: [], senses: [], immunities: [], damageImmunities: [],
  }
  const pc = ownerOf(s)
  const level = pc ? totalLevel(pc) : 1
  const sources = [
    ...activeGear(s).map(({ item, effects }) => ({ item, name: item.name, isWeapon: item.fields.kind === 'Weapon', effects })),
    ...speciesEffects(pc, s).map(x => ({ item: { id: '' } as Entry, name: x.name, isWeapon: false, effects: x.effects })),
    // spells switched on (Bless, Shield of Faith), while they last
    ...activeSpells(s).map(e => ({ item: { id: '' } as Entry, name: e.name, isWeapon: false, effects: activeEffectsOf(e) })),
  ]
  /** Parts that add an ability's modifier too (Sanguine expert), worked out once every ability effect is counted. */
  const plusMod: { part: Part; ability: Ability }[] = []
  for (const { item, name, isWeapon, effects } of sources) {
    for (const f of effects) {
      const n = Number(f.value) || 0
      const p: Part = { label: name, n, ...(f.when ? { when: f.when } : {}) }
      switch (f.on) {
        case 'ac': t.ac.push(p); break
        case 'acBase': t.acBase.push({ label: name, n, abilities: f.abilities ?? [], ...(f.noShield ? { noShield: true } : {}) }); break
        case 'acMin': t.acMin.push(p); break
        case 'unarmed': if (!t.unarmed || (f.dice ?? '') > t.unarmed.dice) t.unarmed = { dice: f.dice || '1', dex: !!f.proficient, from: name, ...(f.emptyDice ? { emptyDice: f.emptyDice } : {}) }; break
        case 'offhandMod': t.offhandMod = name; break
        case 'offhandAny': t.offhandAny = name; break
        case 'poleStrike': t.poleStrike = name; break
        case 'deathSaveAdv': t.deathSaveAdv = name; break
        case 'mediumArmorDex': if (!t.mediumArmorDex || n > t.mediumArmorDex.n) t.mediumArmorDex = { n: n || 3, from: name }; break
        case 'speedType': t.speedTypes.push({ type: f.speedType ?? 'climb', from: name }); break
        case 'ability':
          if (!f.ability) break
          if (f.force) { if (!t.forceAbility[f.ability] || n < t.forceAbility[f.ability]!.n) t.forceAbility[f.ability] = p }
          else if (f.set) { if (!t.setAbility[f.ability] || n > t.setAbility[f.ability]!.n) t.setAbility[f.ability] = p }
          else (t.addAbility[f.ability] ??= []).push(p)
          break
        case 'saves': t.saves.push(p); break
        case 'save': if (f.ability) (t.save[f.ability] ??= []).push(p); break
        case 'skill': if (f.skill) { (t.skill[f.skill] ??= []).push(p); if (f.ability) plusMod.push({ part: p, ability: f.ability }) } break
        case 'attack': if (isWeapon) (t.attackOf[item.id] ??= []).push(p); else t.attackAll.push(p); break
        case 'damage': { const d = f.pb ? { ...p, n: n + profBonus(level) } : p; if (isWeapon) (t.damageOf[item.id] ??= []).push(d); else t.damageAll.push(d); break }
        case 'spellAttack': t.spellAttack.push(p); break
        case 'spellDC': t.spellDC.push(p); break
        case 'speed': t.speed.push(p); break
        case 'initiative': t.initiative.push(f.pb ? { label: name, n: n + profBonus(level) } : p); break
        case 'maxHp': t.maxHp.push(p); break
        case 'hitDice': t.hitDice.push({ label: name, n, ...(f.ability ? { ability: f.ability } : {}) }); break
        case 'maxHpLevel': t.maxHp.push({ label: `${name} (${n} × level ${level})`, n: n * level }); break
        case 'resistance': if (f.type) t.resistances.push({ type: f.type, from: name }); break
        case 'damageImmunity': if (f.type) t.damageImmunities.push({ type: f.type, from: name }); break
        case 'feature': if (f.text?.trim()) t.features.push({ text: f.text.trim(), from: name }); break
        case 'skillAdv': if (f.skill) (t.skillAdv[f.skill] ??= []).push({ mode: f.mode ?? 'adv', from: name }); break
        case 'saveAdv': if (f.ability) (t.saveAdv[f.ability] ??= []).push({ mode: f.mode ?? 'adv', note: f.note, from: name }); break
        case 'extraDamage': {
          if (!f.dice?.trim()) break
          const x: Extra = { dice: f.dice.trim(), type: f.type, proficient: f.proficient, from: name, ...(f.when ? { when: f.when } : {}), ...(f.note ? { note: f.note } : {}) }
          if (isWeapon) (t.extraOf[item.id] ??= []).push(x); else t.extraAll.push(x)
          break
        }
        case 'sense': {
          // the same sense twice (Darkvision 60 ft, then 120 ft from a lineage): the longer range counts
          const sense = f.sense ?? 'Darkvision', had = t.senses.find(x => x.sense === sense)
          if (!had) t.senses.push({ sense, range: n, from: name })
          else if (n > had.range) Object.assign(had, { range: n, from: name })
          break
        }
        case 'immunity': if (f.condition) t.immunities.push({ condition: f.condition, from: name }); break
      }
    }
  }
  for (const { part, ability } of plusMod) part.n += Math.max(1, mod(scoreWith(s!, ability, t)))
  // the character's conditions (and exhaustion, as the ruleset says)
  if (s) applyConditions(s, t)
  // the active ruleset: variant encumbrance slows the character and, heavily encumbered, gives disadvantage
  const load = s ? loadOf(s, t) : undefined
  if (load?.state === 'encumbered') t.speed.push({ label: 'Encumbered', n: -10 })
  if (load?.state === 'heavy') {
    t.speed.push({ label: 'Heavily encumbered', n: -20 })
    for (const sk of SKILLS) (t.skillAdv[sk.name] ??= []).push({ mode: 'dis', from: 'Heavily encumbered' })
    for (const a of ['str', 'dex', 'con'] as Ability[]) (t.saveAdv[a] ??= []).push({ mode: 'dis', from: 'Heavily encumbered' })
  }
  // Heavy armor worn without its Strength: −10 ft speed (5e); armor that's noisy: disadvantage on Stealth.
  for (const { item } of itemsInUse(s)) {
    if (item.fields.stealthDis) (t.skillAdv.Stealth ??= []).push({ mode: 'dis', from: item.name })
    for (const x of requirementsOf(item)?.scores ?? []) {
      if (isHeavyStrength(item, x.ability) && scoreWith(s!, 'str', t) < x.min) t.speed.push({ label: `${item.name} (needs STR ${x.min})`, n: -10 })
    }
  }
  return t
}

/** Advantage and disadvantage cancel out: 'adv', 'dis' or nothing, with where each comes from. */
export function advOf(l: { mode: 'adv' | 'dis'; note?: string; from: string }[] | undefined): { mode?: 'adv' | 'dis'; tip?: string } {
  if (!l?.length) return {}
  const adv = l.some(x => x.mode === 'adv'), dis = l.some(x => x.mode === 'dis')
  const tip = l.map(x => `${MODE[x.mode]}${x.note ? ' ' + x.note : ''} · ${x.from}`).join('\n')
  return { mode: adv && dis ? undefined : adv ? 'adv' : 'dis', tip: adv && dis ? tip + '\n(they cancel out)' : tip }
}

export const sum = (parts: Part[] | undefined) => (parts ?? []).reduce((n, p) => n + p.n, 0)
/** "16 base · +1 Ring of Protection" for a tooltip; nothing when no gear changes it. */
export const breakdown = (base: string, parts: Part[] | undefined) =>
  parts?.length ? [base, ...parts.map(p => `${signed(p.n)} ${p.label}`)].join(' · ') : undefined

/** An ability score with gear: forced to a value (a curse), or else raised to one if that's higher; then anything added. */
export function scoreWith(s: CharacterSheet, a: Ability, t: GearTotals): number {
  const base = s.abilities[a] ?? 10
  const force = t.forceAbility[a], set = t.setAbility[a]
  return (force ? force.n : Math.max(base, set?.n ?? 0)) + sum(t.addAbility[a])
}
/** Where a changed ability score comes from, for its tooltip. */
export function scoreBreakdown(s: CharacterSheet, a: Ability, t: GearTotals): string | undefined {
  const set = t.setAbility[a], force = t.forceAbility[a], add = t.addAbility[a]
  if (!set && !force && !add?.length) return undefined
  const base = s.abilities[a] ?? 10
  const start = force ? `${force.n} from ${force.label} (own score ${base})`
    : set && set.n > base ? `${set.n} from ${set.label} (own score ${base})` : `${base} own score`
  return breakdown(start, add) ?? start
}
