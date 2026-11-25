// Taking a feat: what it still needs, the feats on offer by kind, and what taking one writes onto the sheet. Used by the
// level-up dialog and the Edit page's "＋ Feat" (AddFeatDialog), so both write the same thing.
import type { CharacterSheet, Entry } from './model/types'
import { ABILITY_KEYS, type Ability } from './model/dnd'
import { entries, get } from './store'
import { backgroundOf, featGivesSave, featOfFeature, speciesTraits } from './species'
import { castingAbility } from './sheet'
import { unmet } from './requirements'
import { featsAllowed, isAsiFeat } from './rules'

/** Feats the character already has: the background's Origin feat and the sheet's feat lines. */
export function takenFeats(pc: Entry, s: CharacterSheet): Set<string> {
  return new Set([get(backgroundOf(pc)?.fields.originFeat)?.id, ...(s.features ?? []).map(f => featOfFeature(f)?.id)].filter(Boolean) as string[])
}
/** A feat that can be taken again: marked Repeatable (the Ability Score Improvement always is). */
export const isRepeatableFeat = (f: Entry) => !!f.fields.repeatable || /^ability score improvement$/i.test(f.name.trim())

/**
 * Why a feat doesn't fit the character yet, in words ("level 4+", "needs Pact of the Blade", "taken", "STR 13"), or ''.
 * `level`: the character level it would be taken at; `scoreOf`: the scores as they count now.
 */
export function featLacks(pc: Entry, s: CharacterSheet, f: Entry, level: number, scoreOf: (a: Ability) => number): string {
  const taken = takenFeats(pc, s)
  const need = Number(f.fields.level) || 0
  if (need > level) return `level ${need}+`
  const missing = ((f.fields.requires as string[] | undefined) ?? []).filter(id => !taken.has(id)).map(id => get(id)?.name ?? id)
  if (missing.length) return `needs ${missing.join(', ')}`
  if (taken.has(f.id) && !isRepeatableFeat(f)) return 'taken'
  const names = new Set([...speciesTraits(pc, s).map(a => a.trait.name), ...(s.features ?? []).map(x => x.name)].map(n => n.toLowerCase()))
  const hasFeature = (name: string) => [...names].some(n => n === name.toLowerCase() || n.startsWith(name.toLowerCase()))
  return unmet(pc, s, f, a => scoreOf(a as Ability), !!castingAbility(pc, s), hasFeature).join(', ')
}

/** The feats on offer, by kind: Epic Boons (only with `boons`), General, Origin and Fighting Style feats, and any other.
 * `ignoreRule`: every feat, even when the Ruleset allows the Ability Score Improvement only (an editor's choice). */
const KINDS = ['Epic Boon', 'General Feat', 'Origin Feat', 'Fighting Style', 'Other']
const KIND_LABEL: Record<string, string> = { 'Epic Boon': 'Epic Boons', 'General Feat': 'General feats', 'Origin Feat': 'Origin feats', 'Fighting Style': 'Fighting styles', Other: 'Other' }
export function featGroups(boons: boolean, ignoreRule = false): { kind: string; label: string; list: Entry[] }[] {
  // the Ruleset's "Ability Score Improvement only": that feat alone
  const all = entries.value.filter(e => e.type === 'feat' && (ignoreRule || featsAllowed() || isAsiFeat(e.name))).sort((a, b) => a.name.localeCompare(b.name))
  const kinds = boons ? KINDS : KINDS.filter(k => k !== 'Epic Boon')
  const kindOf = (f: Entry) => (KINDS.includes(String(f.fields.category)) ? String(f.fields.category) : 'Other')
  return kinds.map(k => ({ kind: k, label: KIND_LABEL[k], list: all.filter(f => kindOf(f) === k) })).filter(g => g.list.length)
}

/**
 * Take a feat on a sheet: its ability increases go into the scores (at most 20, 30 for an Epic Boon), Resilient's save
 * proficiency, and a named feat is listed with the features (its traits and choices count from that line).
 */
export function applyFeat(s: CharacterSheet, f: Entry, add: Partial<Record<Ability, number>>, epic = false) {
  for (const a of ABILITY_KEYS) if (add[a]) s.abilities[a] = Math.min(epic ? 30 : 20, (s.abilities[a] ?? 10) + add[a]!)
  if (featGivesSave(f)) for (const a of ABILITY_KEYS) if (add[a] && !s.saves.includes(a)) s.saves.push(a)
  if (!/^ability score improvement$/i.test(f.name.trim())) s.features = [...(s.features ?? []), { name: f.name, text: String(f.fields.summary ?? '').trim() }]
}
