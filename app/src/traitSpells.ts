// A feature's spells by the level they come at (Fiend Spells: Burning Hands and Command at Warlock 3, Fireball at 5…):
// shared by the feature's page (TraitList) and its editor (SpellLevelsInput), so both read the list the same way.
// No vue here.
import type { TraitSpell } from './model/types'

/** The level a feature's spell comes at: its own "from", never before the feature itself. */
export const spellLevelOf = (x: TraitSpell, traitLevel: number) => Math.max(x.from ?? 1, traitLevel)

/** The spells in rows by level, lowest first, each with its place in the list. */
export function spellsByLevel(spells: TraitSpell[] | undefined, traitLevel: number): [number, { x: TraitSpell; i: number }[]][] {
  const by = new Map<number, { x: TraitSpell; i: number }[]>()
  ;(spells ?? []).forEach((x, i) => { const l = spellLevelOf(x, traitLevel); by.set(l, [...(by.get(l) ?? []), { x, i }]) })
  return [...by.entries()].sort((a, b) => a[0] - b[0])
}

/** Whether a feature's spells come at more than one level (an expanded spell list): worth a table by level. */
export const spansLevels = (spells: TraitSpell[] | undefined, traitLevel: number) => new Set((spells ?? []).map(x => spellLevelOf(x, traitLevel))).size > 1

/** Whether a feature's spells are worth a table by level: a long list, or spells at more than one level. */
export const wantsSpellTable = (spells: TraitSpell[] | undefined, traitLevel: number) => (spells?.length ?? 0) >= 4 || spansLevels(spells, traitLevel)

/** One value when every spell has it, else 'mixed' ('' when none has it). */
export function sharedOf<K extends 'how' | 'ability'>(spells: TraitSpell[], k: K): string {
  const v = new Set(spells.map(x => x[k] ?? ''))
  return v.size === 1 ? [...v][0] : 'mixed'
}
