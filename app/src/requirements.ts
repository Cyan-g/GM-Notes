// What an item asks of whoever uses it (its Requirements field): minimum ability scores, a class (or any
// spellcaster), a race (or a subrace of it), skill proficiencies. An item that doesn't fit can't be equipped,
// or attuned if it needs attunement. Heavy armor is the exception: below its Strength it can still be worn,
// at −10 ft speed (effects.ts).
import type { CharacterSheet, Entry, Id, Requirements } from './model/types'
import { get } from './store'
import { classesOf } from './model/classes'
import { ABILITY_UPPER } from './model/dnd'
import { raceChain, speciesGrants, speciesSkills } from './species'

const ABILITY_SHORT: Record<string, string> = ABILITY_UPPER
const orList = (l: string[]) => (l.length < 2 ? l.join('') : `${l.slice(0, -1).join(', ')} or ${l[l.length - 1]}`)

/** An item's requirements, or undefined without any. */
export function requirementsOf(e: Entry | undefined): Requirements | undefined {
  const r = e?.fields.requirements
  if (!r) return undefined
  const any = r.scores?.length || r.classes?.length || r.spellcaster || r.races?.length || r.skills?.length || r.features?.length || r.note?.trim()
  return any ? r : undefined
}

/** Heavy armor's Strength minimum: it doesn't block wearing, it slows (5e). */
export const isHeavyStrength = (e: Entry, ability: string) => e.fields.kind === 'Armor' && e.fields.armorType === 'Heavy' && ability === 'str'

/** The classes asked for: "a Druid", "a Wizard, Sorcerer, Warlock or Bard", "a spellcaster". */
const whoText = (r: Requirements) => `a ${orList([...(r.classes ?? []), ...(r.spellcaster ? ['spellcaster'] : [])])}`

/** The requirements in a few words: "STR 13", "a druid", "Wizard, Sorcerer, Warlock or Bard", "an Elf", "Performance". */
export function describeRequirements(e: Entry): string {
  const r = requirementsOf(e)
  if (!r) return ''
  const races = (r.races ?? []).map(id => get(id)?.name ?? id)
  const parts = [
    ...(r.anyScore && (r.scores?.length ?? 0) > 1 ? [orList((r.scores ?? []).map(x => `${ABILITY_SHORT[x.ability] ?? x.ability} ${x.min}`))] : (r.scores ?? []).map(x => `${ABILITY_SHORT[x.ability] ?? x.ability} ${x.min}`)),
    ...(r.features ?? []).map(x => `the ${x} feature`),
    ...(r.classes?.length || r.spellcaster ? [whoText(r)] : []),
    ...(races.length ? [`someone of ${orList(races)} heritage`] : []),
    ...(r.skills?.length ? [`proficiency in ${orList(r.skills)}`] : []),
    ...(r.note?.trim() ? [r.note.trim()] : []),
  ]
  return parts.join(' · ')
}

/** Whether a race is one of the given races or a subrace of one. */
function raceFits(raceId: Id | undefined, races: Id[]): boolean {
  // the race and each "Subrace of" up the chain, by id: one whose entry is gone still counts (a requirement may name it)
  const ids = [raceId, ...raceChain(raceId, true).map(r => r.fields.parent as Id | undefined)]
  return ids.some(id => !!id && races.includes(id))
}

/**
 * What a character lacks to use an item, as reasons ("needs STR 15 (has 12)"); empty when it fits.
 * `score` gives the character's ability scores (with their gear); `caster` whether they cast spells.
 * Heavy armor's Strength isn't a reason (it slows instead).
 */
export function unmet(pc: Entry, s: CharacterSheet, e: Entry, score: (a: string) => number, caster: boolean, hasFeature?: (name: string) => boolean): string[] {
  const out: string[] = []
  // a feat's armor or shield training ("Heavy Armor Training", "Shield Training"), as its prerequisite says
  if (e.type === 'feat') {
    const pre = String(e.fields.prerequisite ?? '')
    const armor = new Set([...(s.proficiencies?.armor ?? []), ...speciesGrants(pc, s).filter(g => g.kind === 'armor').map(g => g.id)])
    for (const m of pre.matchAll(/\b(Light|Medium|Heavy) Armor Training|\bShield Training/gi)) {
      const need = m[1] ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : 'Shield'
      if (!armor.has(need)) out.push(`needs ${need === 'Shield' ? 'shield' : need.toLowerCase() + ' armor'} training`)
    }
  }
  const r = requirementsOf(e)
  if (!r) return out
  const low = (r.scores ?? []).filter(x => !isHeavyStrength(e, x.ability) && score(x.ability) < x.min)
  // "Strength or Dexterity 13": one of them is enough
  if (r.anyScore && (r.scores?.length ?? 0) > 1) { if (low.length === r.scores!.length) out.push(`needs ${orList(r.scores!.map(x => `${ABILITY_SHORT[x.ability] ?? x.ability} ${x.min}`))}`) }
  else for (const x of low) out.push(`needs ${ABILITY_SHORT[x.ability] ?? x.ability} ${x.min} (has ${score(x.ability)})`)
  if (hasFeature) for (const f of r.features ?? []) if (!hasFeature(f)) out.push(`needs the ${f} feature`)
  const classes = (r.classes ?? []).map(c => c.toLowerCase())
  if (classes.length || r.spellcaster) {
    const mine = classesOf(pc).map(l => l.class.toLowerCase())
    const ok = mine.some(c => classes.includes(c)) || (r.spellcaster && caster)
    if (!ok) out.push(`needs ${whoText(r)}`)
  }
  if (r.races?.length && !raceFits(pc.fields.race as Id | undefined, r.races)) out.push(`needs ${orList(r.races.map(id => get(id)?.name ?? id))} heritage`)
  // a skill typed on the sheet, or one the class, background, species or a feat gives
  const given = r.skills?.length ? speciesSkills(pc, s) : undefined
  for (const sk of r.skills ?? []) if (!s.skills[sk] && !given?.has(sk)) out.push(`needs proficiency in ${sk}`)
  return out
}
