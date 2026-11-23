<script setup lang="ts">
// The character's six abilities with their saving throws and skills, the same everywhere: each skill with ○ not
// proficient, ● proficient, ◉ expertise, its number and where it comes from. What can be clicked, and what a click does,
// is the frame's (skillFrames.ts): free on the sheet's edit mode, only a step's or a choice's own picks elsewhere, the
// rest shown but locked. `compact`: one line per skill in six narrow columns (a choice, the level-up); otherwise the
// sheet's cards. The sheet puts its own parts in through the slots (the score field, the save button, the foot, a
// skill's advantage marker) and its numbers through `bonusOf`/`levelOf`.
import { computed } from 'vue'
import type { CharacterSheet } from '../model/types'
import { ABILITIES, SKILLS, mod, signed, type Ability } from '../model/dnd'
import { saveBonus, score, skillBonus, skillLevel } from '../sheet'
import type { SkillFrame } from '../skillFrames'

const props = defineProps<{
  s: CharacterSheet; prof: number; frame?: SkillFrame; compact?: boolean
  /** Where a skill the character has comes from, for its hover ("Acolyte"). */
  from?: (name: string) => string | undefined
  /** The sheet's own numbers (with what it's editing), when they differ from the stored sheet's. */
  levelOf?: (name: string) => number
  bonusOf?: (name: string) => number
  /** Hover tips on a skill's bonus (what adds to it) on the sheet. */
  bonusTip?: (name: string) => string | undefined
  /** Leave out the saving throw line (a choice that's about skills only). */
  noSaves?: boolean
}>()
const MARK = ['○', '●', '◉']
const LEVEL = ['not proficient', 'proficient', 'expertise']
const skillsOf = (a: Ability) => SKILLS.filter(x => x.ability === a)
const baseLevel = (n: string) => props.levelOf?.(n) ?? skillLevel(props.s, n)
/** The level shown: the frame's (picks not on the sheet yet), else the sheet's. */
const levelShown = (n: string) => props.frame?.level?.(n) ?? baseLevel(n)
const bonusShown = (n: string) => (props.bonusOf?.(n) ?? skillBonus(props.s, n, props.prof)) + (levelShown(n) - baseLevel(n)) * props.prof
const act = (n: string) => props.frame?.act(n)
function title(n: string) {
  const parts = [`${n}: ${LEVEL[levelShown(n)] ?? ''}`]
  const f = props.from?.(n)
  if (f && levelShown(n)) parts.push(`from ${f}`)
  const a = act(n), why = props.frame?.why?.(n)
  if (a) parts.push(a.label + (a.gain ? ` (${signed(bonusShown(n) + a.gain)})` : ''))
  else if (why) parts.push(why)
  return parts.join(' · ')
}
const locked = computed(() => !props.frame)
</script>

<template>
  <!-- in a wrapper the compact columns follow (six, three or two by its width, never one left over) -->
  <div class="sg-wrap" :class="{ compact }"><section class="cs-abilities skill-grid" :class="{ compact, locked }">
    <div v-for="a in ABILITIES" :key="a.key" class="cs-ability">
      <div class="cs-ab-head">
        <span class="cs-short" :title="a.label">{{ a.short }}</span>
        <slot name="mod" :a="a.key"><b class="cs-mod">{{ signed(mod(score(s, a.key))) }}</b></slot>
        <slot name="score" :a="a.key"><span class="cs-score sg-score">{{ score(s, a.key) }}</span></slot>
      </div>
      <slot v-if="!noSaves" name="save" :a="a.key">
        <div class="cs-skill cs-save" :class="{ on: s.saves.includes(a.key) }" :title="`${a.label} saving throw${s.saves.includes(a.key) ? ' (proficient)' : ''}`">
          <span class="cs-dot">{{ s.saves.includes(a.key) ? '●' : '○' }}</span><b>{{ signed(saveBonus(s, a.key, prof)) }}</b><span>Saving throw</span>
        </div>
      </slot>
      <div class="cs-skills">
        <button v-for="sk in skillsOf(a.key)" :key="sk.name" type="button" class="cs-skill"
                :class="{ on: levelShown(sk.name) > 0, given: !!from?.(sk.name) && levelShown(sk.name) > 0, can: !!act(sk.name), [`sg-${frame?.mark?.(sk.name)}`]: !!frame?.mark?.(sk.name), off: !!frame && !act(sk.name) && !frame.mark?.(sk.name) }"
                :aria-disabled="!act(sk.name)" :tabindex="act(sk.name) ? 0 : -1" :aria-pressed="levelShown(sk.name) > 0" :title="title(sk.name)" @click="act(sk.name)?.go()">
          <span class="cs-dot">{{ MARK[levelShown(sk.name)] ?? '○' }}</span>
          <b v-flash="bonusShown(sk.name)" :class="{ 'gear-mod': !!bonusTip?.(sk.name), tip: !!bonusTip?.(sk.name) }" :data-tip="bonusTip?.(sk.name)">{{ signed(bonusShown(sk.name)) }}</b>
          <span>{{ sk.name }}</span>
          <slot name="extra" :name="sk.name" />
          <small v-if="act(sk.name)?.gain" class="sg-then">→ {{ signed(bonusShown(sk.name) + act(sk.name)!.gain!) }}</small>
          <small v-else-if="frame?.mark?.(sk.name) === 'back'" class="sg-then">↺</small>
          <small v-else-if="frame?.mark?.(sk.name) === 'selected'" class="sg-then">⇄</small>
        </button>
        <p v-if="!skillsOf(a.key).length" class="cs-noskill">no skills</p>
      </div>
      <slot name="foot" :a="a.key" />
    </div>
  </section></div>
</template>
