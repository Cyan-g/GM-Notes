// The world's ruleset: rules that can be switched on and off or work one way or another, kept as presets in the
// world (meta.rules), one of them active. The Ruleset page shows them, searchable; the rest of the app asks `rule(id)`.
// A world without presets plays by the defaults (the "Standard" preset is made the first time something changes).
import { computed } from 'vue'
import { db, state, touch } from './store'

export interface RuleOption { id: string; label: string; text?: string }
export interface RuleDef {
  id: string
  /** What it's about, for grouping on the page ("Equipment", "Advancement"). */
  group: string
  label: string
  /** What the rule does, in a sentence or two. */
  text: string
  options: RuleOption[]
  /** The option of the Standard preset. */
  default: string
  /** More words to find it by. */
  keywords?: string
}
export interface RulePreset { id: string; name: string; values: Record<string, string> }
export interface RulesMeta { presets: RulePreset[]; active: string }

/** The rules there are, in page order. More follow as the app learns them. */
export const RULES: RuleDef[] = [
  {
    id: 'carryingCapacity', group: 'Equipment', label: 'Carrying capacity',
    text: 'Whether what a character carries is weighed against their Strength. The Inventory shows the total either way.',
    options: [
      { id: 'off', label: 'Not tracked', text: 'Weight is shown, nothing is checked.' },
      { id: 'capacity', label: 'Capacity', text: 'Up to Strength × 15 lb (× 30 for Large, × 7.5 for Tiny); more than that is flagged.' },
      { id: 'encumbrance', label: 'Encumbrance (variant)', text: 'Over Strength × 5 lb: −10 ft speed. Over Strength × 10 lb: −20 ft speed and disadvantage on ability checks, attack rolls and Strength, Dexterity and Constitution saves.' },
    ],
    default: 'off', keywords: 'weight encumbered load heavy',
  },
  {
    id: 'experience', group: 'Advancement', label: 'Experience points',
    text: 'How characters level up: when the DM says so, or by experience points from encounters.',
    options: [
      { id: 'milestone', label: 'Milestones', text: 'No experience points; characters level up at story milestones.' },
      { id: 'xp', label: 'Experience points', text: 'Characters have XP on their sheet, with what the next level needs.' },
    ],
    default: 'milestone', keywords: 'xp level up advancement',
  },
  {
    id: 'abilityIncrease', group: 'Character creation', label: 'Ability score increase',
    text: 'Where a new character\u2019s ability score increase comes from in the character creation wizard.',
    options: [
      { id: 'choice', label: 'The player\u2019s choice', text: 'The wizard offers the background\u2019s or the species\u2019 increase (or one typed in).' },
      { id: 'background', label: 'Background (2024)', text: 'The background\u2019s increase; the species gives none.' },
      { id: 'species', label: 'Species (2014)', text: 'The species\u2019 increase; the background gives none.' },
    ],
    default: 'choice', keywords: 'asi ability scores race species background creation',
  },
  {
    id: 'multiclassing', group: 'Advancement', label: 'Multiclassing',
    text: 'Whether a character can take a level in another class when they level up.',
    options: [
      { id: 'on', label: 'Allowed, with prerequisites', text: 'A new class needs 13 in its main score and in those of the classes the character has (the DM can still allow it).' },
      { id: 'free', label: 'Allowed, no prerequisites', text: 'Any class can be taken, whatever the scores.' },
      { id: 'off', label: 'Not allowed', text: 'Characters level up in the class they have.' },
    ],
    default: 'on', keywords: 'multiclass class level up prerequisites',
  },
  {
    id: 'exhaustion', group: 'Conditions', label: 'Exhaustion',
    text: 'What each level of exhaustion does to a character, counted on their sheet.',
    options: [
      { id: '2024', label: 'Levels lower rolls (2024)', text: 'Each level: −2 to D20 tests and −5 ft speed. Level 6 is death. A long rest removes one level.' },
      { id: '2014', label: 'Effects by level (2014)', text: '1: disadvantage on ability checks. 2: speed halved. 3: disadvantage on attack rolls and saves. 4: hit point maximum halved. 5: speed 0. 6: death.' },
    ],
    default: '2024', keywords: 'tired condition levels',
  },
  {
    id: 'hitDiceLongRest', group: 'Resting', label: 'Hit Dice on a long rest',
    text: 'How many spent Hit Dice a long rest gives back.',
    options: [
      { id: 'all', label: 'All of them (2024)', text: 'Every spent Hit Die comes back.' },
      { id: 'half', label: 'Half the level (2014)', text: 'Up to half the character’s level in Hit Dice (at least one) comes back.' },
    ],
    default: 'all', keywords: 'rest hit dice healing recovery',
  },
]
export const ruleDef = (id: string) => RULES.find(r => r.id === id)

const STANDARD = 'standard'
/** The world's presets (the Standard one first if there are none stored yet). */
export const presets = computed<RulePreset[]>(() => state.db?.meta.rules?.presets ?? [{ id: STANDARD, name: 'Standard', values: {} }])
export const activePreset = computed<RulePreset>(() => presets.value.find(p => p.id === state.db?.meta.rules?.active) ?? presets.value[0])
/** How a rule works in the active preset. */
export const rule = (id: string): string => activePreset.value.values[id] ?? ruleDef(id)?.default ?? ''
/** Whether a preset's rule differs from the Standard default. */
export const changedFromDefault = (p: RulePreset, id: string) => p.values[id] != null && p.values[id] !== ruleDef(id)?.default

/** The stored rules, made on the first change. */
function meta(): RulesMeta {
  const m = db().meta
  return (m.rules ??= { presets: presets.value.map(p => ({ ...p, values: { ...p.values } })), active: activePreset.value.id })
}
const newId = () => 'r' + Math.random().toString(36).slice(2, 8)

/** Set how a rule works in the active preset. */
export function setRule(id: string, value: string) {
  const m = meta(), p = m.presets.find(x => x.id === m.active) ?? m.presets[0]
  if (value === ruleDef(id)?.default) delete p.values[id]; else p.values[id] = value
  touch()
}
/** A new preset, a copy of the active one, made active. */
export function addPreset(name: string) {
  const m = meta(), from = m.presets.find(x => x.id === m.active) ?? m.presets[0]
  const p: RulePreset = { id: newId(), name: name.trim() || 'New preset', values: { ...from.values } }
  m.presets.push(p)
  m.active = p.id
  touch()
}
export function renamePreset(id: string, name: string) {
  const p = meta().presets.find(x => x.id === id)
  if (p && name.trim()) { p.name = name.trim(); touch() }
}
/** Remove a preset (never the last one); the first is active then if this one was. */
export function deletePreset(id: string) {
  const m = meta()
  if (m.presets.length < 2) return
  m.presets = m.presets.filter(x => x.id !== id)
  if (m.active === id) m.active = m.presets[0].id
  touch()
}
export function setActivePreset(id: string) { const m = meta(); if (m.presets.some(x => x.id === id)) { m.active = id; touch() } }
