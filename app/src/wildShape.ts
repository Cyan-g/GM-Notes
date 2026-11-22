// Wild Shape (Druid, 2024 rules): the forms the Druid knows (picked by the player on the sheet, from the world's
// Beasts within the limits of their level), and shifting into one: a use spent, temporary hit points equal to the
// Druid level, and the form's statblock shown beside the sheet until they return. Nothing is rolled or decided for them.
import type { CharacterSheet, Entry, Id } from './model/types'
import { crNum } from './model/dnd'
import { statsOf } from './encounter'
import { byType } from './store'
import { scaleAt, spendUse, type ActiveTrait } from './species'
import { score } from './sheet'
import { classLevel, featureNamed } from './classHelpers'

export const wildShapeOf = (pc: Entry, s: CharacterSheet | undefined) => featureNamed(pc, s, 'Wild Shape')
export const druidLevel = (pc: Entry) => classLevel(pc, 'Druid')

export interface FormRules { count: number; cr: number; crText: string; fly: boolean }
/** How many forms, up to which CR, and whether with a Fly Speed: the feature's scale ("4, CR 1/4, no fly"), else the table. */
export function formRules(pc: Entry, a: ActiveTrait): FormRules {
  const lvl = druidLevel(pc)
  const base: FormRules = lvl >= 8 ? { count: 8, cr: 1, crText: '1', fly: true } : lvl >= 4 ? { count: 6, cr: 0.5, crText: '1/2', fly: false } : { count: 4, cr: 0.25, crText: '1/4', fly: false }
  const t = String(scaleAt(a) ?? '')
  const n = t.match(/^\s*(\d+)/), c = t.match(/CR\s*([\d/]+)/i)
  return {
    count: n ? Number(n[1]) : base.count,
    cr: c ? crNum(c[1]) : base.cr, crText: c ? c[1] : base.crText,
    fly: t ? !/no fly/i.test(t) : base.fly,
  }
}

/** A creature's type, from its entry or its statblock. */
const typeOf = (e: Entry) => String(e.fields.creatureType ?? statsOf(e)?.creatureType ?? '')
/** Why a creature can't be a form at this level (or '' when it can). */
export function unfit(e: Entry, r: FormRules): string {
  if (!/beast/i.test(typeOf(e))) return 'not a Beast'
  const sb = statsOf(e), cr = sb?.cr
  if (!cr) return 'no CR'
  if (crNum(cr) > r.cr) return `CR ${cr} is over ${r.crText}`
  if (!r.fly && /\bfly\b/i.test(sb?.speed ?? '')) return 'has a Fly Speed'
  return ''
}
/** The world's Beasts that fit now. */
export const fittingBeasts = (r: FormRules): Entry[] => (byType.value.get('creature') ?? []).filter(e => !unfit(e, r))

export const formsOf = (s: CharacterSheet | undefined): Id[] => s?.wildShape?.forms ?? []
export function setForms(s: CharacterSheet, forms: Id[]) {
  const w = { ...(s.wildShape ?? {}), forms }
  if (!forms.length && !w.form) delete s.wildShape; else s.wildShape = w
}
/** Shift into a known form: a use spent, temp HP equal to the Druid level (the higher of that and what's there). */
export function shift(s: CharacterSheet, pc: Entry, a: ActiveTrait, form: Id) {
  spendUse(s, pc, a, 1, score)
  s.wildShape = { forms: formsOf(s), form }
  const t = druidLevel(pc)
  if ((s.tempHp ?? 0) < t) s.tempHp = t
}
/** Back to normal form (temporary hit points left stay, as the rules say nothing ends them). */
export function returnToForm(s: CharacterSheet) {
  if (!s.wildShape) return
  const { form: _, ...rest } = s.wildShape
  if (rest.forms?.length) s.wildShape = rest; else delete s.wildShape
}
