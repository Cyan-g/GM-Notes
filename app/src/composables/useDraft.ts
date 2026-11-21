// The character wizard's draft (wizard.ts) as its steps read it: the draft, its class's rules, the draft as a
// character, and what several steps show (the classes, the scores, the skills already given, the kits taken).
// Each is worked out only when a step reads it.
import { computed } from 'vue'
import { draftPc, finalScores, kitsOf, rules, wizard } from '../wizard'
import { classEntry } from '../classRules'
import { speciesGrants } from '../species'
import { listOptions } from '../store'

export function useDraft() {
  const d = computed(() => wizard.d)
  const r = computed(() => rules(d.value))
  const pc = computed(() => draftPc(d.value))
  const classes = computed(() => listOptions('class'))
  /** The class entry picked, for its page under the choices. */
  const classPage = computed(() => classEntry(d.value.cls))
  const scores = computed(() => finalScores(d.value))
  /** What the species and background give: skills, tools, languages… */
  const granted = computed(() => speciesGrants(pc.value))
  const grantedSkills = computed(() => new Map(granted.value.filter(g => g.kind === 'skill').map(g => [g.id, g.from])))
  /** The class's and the background's equipment taken. */
  const taken = computed(() => kitsOf(d.value))
  return { d, r, pc, classes, classPage, scores, granted, grantedSkills, taken }
}
