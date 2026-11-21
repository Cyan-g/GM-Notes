// A character's conditions (their sheet's `conditions`, shared with the combat tracker) and what they do: a short rule
// for each, the numbers they change where the sheet has them (exhaustion as the ruleset says, advantage and
// disadvantage on saves and skills, speed 0), and hints for the rest (attack rolls, attacks against them).
import type { CharacterSheet, Entry } from './model/types'
import type { GearTotals } from './effects'
import { rule } from './rules'
import { db, get, state, touch } from './store'
import { sheetToEdit } from './sheetData'
import { watch } from 'vue'
import { ABILITY_KEYS, SKILLS, type Ability } from './model/dnd'

/** What each condition does, in a sentence (our own words), and what the sheet does with it. */
export const CONDITION_RULES: Record<string, { text: string; attack?: 'adv' | 'dis'; checks?: 'dis'; saves?: { abilities: Ability[]; mode: 'dis' | 'fail' }; speed0?: boolean; against?: 'adv' | 'dis' }> = {
  Blinded: { text: "Can't see; fails checks that need sight. Attack rolls have disadvantage, attacks against it advantage.", attack: 'dis', against: 'adv' },
  Charmed: { text: "Can't attack the charmer or target it with harmful effects; the charmer has advantage on social checks against it." },
  Deafened: { text: "Can't hear; fails checks that need hearing." },
  Exhaustion: { text: 'See the ruleset for what each level does.' },
  Frightened: { text: "Disadvantage on ability checks and attack rolls while the source is in sight; can't move closer to it.", attack: 'dis', checks: 'dis' },
  Grappled: { text: 'Speed 0; disadvantage on attacks against anyone but the grappler; the grappler can move it.', speed0: true },
  Incapacitated: { text: "No actions, bonus actions or reactions; concentration breaks; can't speak; disadvantage on initiative." },
  Invisible: { text: "Can't be seen: advantage on initiative and attack rolls; attacks against it have disadvantage.", attack: 'adv', against: 'dis' },
  Paralyzed: { text: 'Incapacitated, speed 0; fails STR and DEX saves; attacks against it have advantage, and hits within 5 feet are critical.', speed0: true, saves: { abilities: ['str', 'dex'], mode: 'fail' }, against: 'adv' },
  Petrified: { text: 'Turned to stone: incapacitated, speed 0; fails STR and DEX saves; resistance to all damage; immune to poison.', speed0: true, saves: { abilities: ['str', 'dex'], mode: 'fail' }, against: 'adv' },
  Poisoned: { text: 'Disadvantage on attack rolls and ability checks.', attack: 'dis', checks: 'dis' },
  Prone: { text: 'Only crawls (or stands up for half its speed); attack rolls have disadvantage; attacks against it have advantage within 5 feet, disadvantage farther.', attack: 'dis' },
  Restrained: { text: 'Speed 0; attack rolls and DEX saves have disadvantage; attacks against it have advantage.', speed0: true, attack: 'dis', saves: { abilities: ['dex'], mode: 'dis' }, against: 'adv' },
  Stunned: { text: 'Incapacitated; fails STR and DEX saves; attacks against it have advantage.', saves: { abilities: ['str', 'dex'], mode: 'fail' }, against: 'adv' },
  Unconscious: { text: 'Incapacitated and prone, drops what it holds; fails STR and DEX saves; attacks against it have advantage, hits within 5 feet are critical.', speed0: true, saves: { abilities: ['str', 'dex'], mode: 'fail' }, against: 'adv' },
  Concentrating: { text: 'Keeping a spell going: taking damage calls for a CON save (DC 10 or half the damage); incapacitation ends it.' },
}

/** What the 2014 exhaustion levels do, from level 1 up. */
const EXHAUSTION_2014 = ['Disadvantage on ability checks', 'Speed halved', 'Disadvantage on attack rolls and saving throws', 'Hit point maximum halved', 'Speed 0', 'Death']

/** What a character's exhaustion level does, in words, under the active ruleset. */
export function exhaustionText(level: number): string {
  if (!level) return ''
  if (rule('exhaustion') === '2014') return EXHAUSTION_2014.slice(0, level).join('; ')
  return level >= 6 ? 'Death' : `−${2 * level} to D20 tests (attack rolls, ability checks, saves), −${5 * level} ft speed`
}

/**
 * Adds what the sheet's conditions do to the totals (effects.ts): exhaustion's penalties, disadvantage on checks and
 * saves, speed 0 or halved, and the attack rolls' advantage or disadvantage (shown with the attacks).
 */
export function applyConditions(s: CharacterSheet, t: GearTotals) {
  const list = s.conditions ?? []
  for (const c of list) {
    const r = CONDITION_RULES[c]
    if (!r) continue
    if (r.checks === 'dis') for (const { name: sk } of SKILLS) (t.skillAdv[sk] ??= []).push({ mode: 'dis', from: c })
    if (r.saves) for (const a of r.saves.abilities) (t.saveAdv[a] ??= []).push({ mode: 'dis', from: c, ...(r.saves.mode === 'fail' ? { note: '(fails it)' } : {}) })
    if (r.speed0) t.speedZero ??= c
    if (r.attack) (t.attackMode ??= []).push({ mode: r.attack, from: c })
  }
  const level = list.includes('Exhaustion') ? Math.max(1, Math.min(6, s.exhaustion ?? 1)) : 0
  if (!level) return
  const from = `Exhaustion ${level}`
  if (rule('exhaustion') === '2014') {
    if (level >= 1) for (const { name: sk } of SKILLS) (t.skillAdv[sk] ??= []).push({ mode: 'dis', from })
    if (level >= 2) t.speedHalf ??= from
    if (level >= 3) { for (const a of ABILITY_KEYS) (t.saveAdv[a] ??= []).push({ mode: 'dis', from }); (t.attackMode ??= []).push({ mode: 'dis', from }) }
    if (level >= 4) t.maxHpHalf = from
    if (level >= 5) t.speedZero ??= from
    return
  }
  const p = { label: from, n: -2 * level }
  for (const { name: sk } of SKILLS) (t.skill[sk] ??= []).push(p)
  t.saves.push(p); t.attackAll.push(p); t.spellAttack.push(p); t.initiative.push(p)
  t.speed.push({ label: from, n: -5 * level })
}

// ---- one list with the combat tracker ----
/** Set a character's conditions (and exhaustion level); their combatants in the tracker get the same. */
export function setConditions(pc: Entry, s: CharacterSheet, list: string[], exhaustion?: number) {
  s.conditions = list.length ? [...list] : undefined
  if (!s.conditions) delete s.conditions
  if (!list.includes('Concentrating')) dropConcentration(s)
  if (exhaustion != null) { if (list.includes('Exhaustion')) s.exhaustion = exhaustion; else delete s.exhaustion }
  for (const c of state.db?.tracker?.combatants ?? []) if (c.entry === pc.id && c.conditions.join() !== list.join()) c.conditions = [...list]
}
/** The tracker changed a character's conditions (a chip, 0 HP, the end of a fight): their sheet gets the same. */
watch(() => (state.db?.tracker?.combatants ?? []).filter(c => c.entry && c.isPlayer).map(c => `${c.entry}:${c.conditions.join(',')}`).join('|'), () => {
  let changed = false
  for (const c of state.db?.tracker?.combatants ?? []) {
    if (!c.entry || !c.isPlayer) continue
    const pc = get(c.entry)
    if (!pc || (pc.fields.sheet?.conditions ?? []).join() === c.conditions.join() || state.readOnly) continue
    const s = sheetToEdit(pc)
    s.conditions = c.conditions.length ? [...c.conditions] : undefined
    if (!s.conditions) delete s.conditions
    if (!c.conditions.includes('Exhaustion')) delete s.exhaustion
    if (!c.conditions.includes('Concentrating')) dropConcentration(s)
    changed = true
  }
  if (changed) { db(); touch() }
})

// ---- concentration ----
/** The concentration spell ends: it's no longer switched on either. */
function dropConcentration(s: CharacterSheet) {
  const id = s.concentrating
  if (!id) return
  delete s.concentrating
  if (s.activeSpells?.includes(id)) { s.activeSpells = s.activeSpells.filter(x => x !== id); if (!s.activeSpells.length) delete s.activeSpells }
}
/** Start concentrating on a spell: the one before it ends, and the character has the Concentrating condition. */
export function startConcentration(pc: Entry, s: CharacterSheet, id: string) {
  if (s.concentrating && s.concentrating !== id) dropConcentration(s)
  const list = s.conditions ?? []
  if (!list.includes('Concentrating')) setConditions(pc, s, [...list, 'Concentrating'])
  s.concentrating = id
}
/** Stop concentrating (the spell ends). */
export function endConcentration(pc: Entry, s: CharacterSheet) {
  setConditions(pc, s, (s.conditions ?? []).filter(x => x !== 'Concentrating'))
  dropConcentration(s)
}

// ---- hit points: what dropping to 0 and coming back do ----
/**
 * After a character's HP changed on their sheet: dropping to 0 knocks them unconscious and ends concentration;
 * damage while at 0 is a failed death save; back above 0 they wake up and the death saves end.
 */
export function hpChanged(pc: Entry, s: CharacterSheet, before: number, after: number, damaged: boolean) {
  let list = s.conditions ?? []
  if (after <= 0 && before > 0) {
    if (s.concentrating || list.includes('Concentrating')) { dropConcentration(s); list = list.filter(x => x !== 'Concentrating') }
    if (!list.includes('Unconscious')) list = [...list, 'Unconscious']
    setConditions(pc, s, list)
  } else if (after <= 0 && damaged) {
    const d = s.deathSaves ?? { ok: 0, fail: 0 }
    s.deathSaves = { ok: d.ok, fail: Math.min(3, d.fail + 1) }
  } else if (after > 0) {
    delete s.deathSaves
    if (before <= 0 && list.includes('Unconscious')) setConditions(pc, s, list.filter(x => x !== 'Unconscious'))
  }
}
