// The traits an entry brings (a race's, a background's, a class's or subclass's features, a feat's, an item's): its own
// list, and for a background one more made from its skills and tool. What a character makes of them is in species.ts.
import type { Entry, Trait, TraitGrant } from './types'

const ownTraits = (e: Entry | undefined): Trait[] =>
  Array.isArray(e?.fields.speciesTraits) ? e!.fields.speciesTraits!.filter(t => t && typeof t === 'object') : []
/** The id of a background's proficiencies trait (its skills and tool). */
export const PROFS_TRAIT = 'proficiencies'
/** A race's traits; a background's, after one made from its skills and tool. */
export function traitsOf(e: Entry | undefined): Trait[] {
  if (e?.type !== 'background') return ownTraits(e)
  const skills = (e.fields.skillProfs ?? []).filter(Boolean), tools = (e.fields.toolProfs ?? []).filter(Boolean)
  const t: Trait = { id: PROFS_TRAIT, name: 'Proficiencies' }
  // several tools: the player picks one (one kind of gaming set), unless the background gives them all
  const all = tools.length === 1 || !!e.fields.toolsAll
  const grants: TraitGrant[] = [...skills.map(id => ({ kind: 'skill' as const, id })), ...(all ? tools.map(id => ({ kind: 'tool' as const, id })) : [])]
  if (grants.length) t.grants = grants
  if (!all) t.choice = { kind: 'tool', count: 1, among: tools }
  return grants.length || t.choice ? [t, ...ownTraits(e)] : ownTraits(e)
}
