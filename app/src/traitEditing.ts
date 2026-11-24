// What a feature's editor (TraitsInput, TraitCard and its parts) needs besides the parts themselves: the kinds of choice
// a player can be asked for, a new choice of a kind, what limited uses come to by level, a part in a few words, and
// what's left of a feature once a part is taken off. Kept apart from the components so they stay about layout.
import type { Trait, TraitChoice } from './model/types'
import { byLevel, choiceWords, newTraitId } from './species'
import { ABILITY_KEYS, profBonus } from './model/dnd'

export type Uses = NonNullable<Trait['uses']>

// ---- the player's choice ----
export const CHOICE_KINDS: { id: TraitChoice['kind']; label: string }[] = [
  { id: 'skill', label: 'Pick skills' }, { id: 'language', label: 'Pick languages' },
  { id: 'tool', label: 'Pick tools' }, { id: 'skillTool', label: 'Pick skills or tools' }, { id: 'expertise', label: 'Pick skills for Expertise' }, { id: 'feat', label: 'Pick feats' },
  { id: 'mastery', label: 'Pick weapons to master' }, { id: 'spell', label: 'Pick spells' }, { id: 'option', label: 'Pick options' },
]
/** A new choice of a kind: one pick; a spell choice of a cantrip at will; an option choice with two options to fill. */
export function newChoice(k: TraitChoice['kind']): TraitChoice {
  if (k === 'option') return { kind: k, options: [{ id: newTraitId(), name: 'Option 1' }, { id: newTraitId(), name: 'Option 2' }] }
  return k === 'spell' ? { kind: k, count: 1, spell: { level: 'Cantrip', how: 'atWill' } } : { kind: k, count: 1 }
}
/** A choice in a few words: "3 of 25 options", "2 skills". */
export const choiceSummary = (c: TraitChoice) =>
  c.kind === 'option' ? `${c.count ?? 1} of ${c.options?.length ?? 0} options` : `${c.count ?? 1} ${choiceWords(c, c.count ?? 1)}`

// ---- limited uses ----
/** What the count of uses can follow: a number, the proficiency bonus, the level (`levelLabel`), a modifier. */
export const countKinds = (levelLabel: string) => [
  { id: 'n', label: 'a number' }, { id: 'pb', label: 'proficiency bonus' }, { id: 'level', label: levelLabel },
  ...ABILITY_KEYS.map(a => ({ id: a, label: `${a.toUpperCase()} modifier` })),
]
export const countKind = (u: Uses) => (typeof u.count === 'number' ? 'n' : u.count)
/** Uses without the parts that say nothing (× 1, + 0, no steps). */
export function cleanUses(u: Uses): Uses {
  const n = { ...u }
  for (const k of ['times', 'plus', 'steps', 'shortBack'] as const) if (!n[k] || (Array.isArray(n[k]) && !(n[k] as unknown[]).length)) delete n[k]
  return n
}
/** What the uses come to by level, as the sheet counts them ("4 at level 3 · 7 at level 6 …"), or the modifier in words. */
export function usesPreview(u: Uses, from: number): string {
  const times = u.times ?? 1, plus = u.plus ?? 0
  if (typeof u.count === 'string' && u.count !== 'pb' && u.count !== 'level' && !u.steps?.length) {
    return `${u.count.toUpperCase()} modifier (at least 1)${times > 1 ? ` × ${times}` : ''}${plus ? ` + ${plus}` : ''}`
  }
  const at = (l: number) => {
    const n = u.count === 'pb' ? profBonus(l) : u.count === 'level' ? l : typeof u.count === 'number' ? u.count : 1
    return byLevel(u.steps, l, n) * times + plus
  }
  const levels = [...new Set([from, ...(u.steps ?? []).map(x => x[0]), 5, 10, 15, 20].filter(l => l >= from && l <= 20))].sort((a, b) => a - b)
  const shown: string[] = []
  let last: number | undefined
  for (const l of levels) { const n = at(l); if (n !== last) shown.push(`${n} at level ${l}`); last = n }
  return shown.length === 1 && levels.length > 1 ? `always ${at(from)}` : shown.join(' · ')
}

// ---- the rest ----
/** A scaling value in a few words: "Superiority Die: d8 → d10 → d12". */
export const scaleSummary = (s: NonNullable<Trait['scale']>) => [s.label, (s.steps ?? []).filter(x => x[1]).map(x => x[1]).join(' → ')].filter(Boolean).join(': ')
/** Whether a feature gives spells (its own, a spell choice's, its options'): only then does its casting ability matter. */
export const hasSpells = (t: Trait) => !!(t.spells?.length || t.choice?.kind === 'spell'
  || t.choice?.options?.some(o => o.spells?.length || o.choices?.some(c => c.kind === 'spell')))
/** A feature as stored: no level 1 (it's the default), no parts that were taken off. */
export function cleanTrait(t: Trait): Trait {
  const n = { ...t }
  if (!n.level || n.level <= 1) delete n.level
  for (const k of ['uses', 'choice', 'scale', 'onSheet', 'spellLists', 'castWith', 'toggle', 'replaces'] as const) if (n[k] == null) delete n[k]
  return n
}
