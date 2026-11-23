<script setup lang="ts">
// A feat's ability score increase (Poisoner: +1 to Dexterity or Intelligence; Ability Score Improvement: +2 to one or
// +1 to two) on the scores table (ScoreTable): each score as it was before the feat, the feat's points placed with −
// and +, and the score, modifier and what it does now with them (counted as they're placed). The abilities it can't
// raise stay in the table, grey. Fills in the BonusChoice once every point is placed (useSpread), like SpreadPicker.
//   counted: the sheet already has the choice made so far (the creator's draft); in the level-up it doesn't yet
import { computed, toRef } from 'vue'
import type { AbilityBonus, CharacterSheet } from '../model/types'
import { bonusApplied, type BonusChoice } from '../abilityBonus'
import { ABILITY_NAME, type Ability } from '../model/dnd'
import { useSpread } from '../composables/useSpread'
import ScoreTable from './ScoreTable.vue'

const props = defineProps<{
  bonus: AbilityBonus; before: Record<Ability, number>; s: CharacterSheet; prof: number; level: number
  counted?: boolean
  /** Where a score before the feat comes from, for its hover. */
  beforeTip?: (a: Ability) => string | undefined
  primary?: Ability[]; hp?: number; die?: string; casting?: Ability; spell?: { dc: number; attack: number }
}>()
const choice = defineModel<BonusChoice>({ required: true })
const { adds, cap, fixed, points, spent, canAdd, allowed, add } = useSpread(toRef(props, 'bonus'), toRef(props, 'before'), choice, c => { choice.value = c })
const applied = computed(() => (props.counted ? bonusApplied(props.bonus, choice.value) : {}))
const plus = (a: Ability) => (adds.value[a] ?? 0) + fixed(a)
const pending = (a: Ability) => plus(a) - (applied.value[a] ?? 0)
const left = computed(() => points.value - spent.value)
</script>

<template>
  <div class="fst">
    <p v-if="left" class="small"><b class="wz-left">{{ left }} left</b>
      <span class="muted">{{ points }} point{{ points === 1 ? '' : 's' }} to place with + and −<template v-if="cap !== 20">, a score up to {{ cap }}</template>.</span></p>
    <p v-else class="small muted">{{ points === 1 ? 'The point is' : `All ${points} points are` }} placed; − takes one back.</p>
    <ScoreTable :s="s" :prof="prof" :level="level" :pending="pending" :primary="primary" :hp="hp" :die="die" :casting="casting" :spell="spell" :dim="a => !allowed(a) && !fixed(a)">
      <template #head><th>Before</th><th :class="{ 'wz-todo': left > 0 }">This feat</th></template>
      <template #cols="{ a }">
        <td :title="beforeTip?.(a)">{{ before[a] }}</td>
        <td>
          <span v-if="allowed(a) || fixed(a)" class="wz-bonus-pick">
            <button type="button" class="chip-btn" :disabled="!adds[a]" :aria-label="`Take a point back from ${ABILITY_NAME[a]}`" @click="add(a, -1)">−</button>
            <b :class="{ muted: !plus(a) }">+{{ plus(a) }}</b>
            <button type="button" class="chip-btn" :disabled="!canAdd(a)" :aria-label="`One point to ${ABILITY_NAME[a]}`" :title="!canAdd(a) && before[a] + plus(a) >= cap ? `${cap} is the most it can reach` : undefined" @click="add(a, 1)">+</button>
          </span>
        </td>
      </template>
    </ScoreTable>
  </div>
</template>
