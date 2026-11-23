<script setup lang="ts">
// An ability score increase as the scores they are now, each with + (and − to take it back): the points go where the
// bonus allows (Ability Score Improvement: +2 to one or +1 to two), never past its maximum. Fills in a BonusChoice
// once every point is placed, so the rest of the app reads it like any other pick.
import { toRef } from 'vue'
import type { AbilityBonus } from '../model/types'
import type { BonusChoice } from '../abilityBonus'
import { ABILITY_KEYS, ABILITY_SHORT, type Ability } from '../model/dnd'
import { useSpread } from '../composables/useSpread'

const props = defineProps<{ bonus: AbilityBonus; scores: Record<Ability, number> }>()
const choice = defineModel<BonusChoice>({ required: true })
const { adds, cap, fixed, points, spent, canAdd, add } = useSpread(toRef(props, 'bonus'), toRef(props, 'scores'), choice, c => { choice.value = c })
</script>

<template>
  <div class="spread">
    <p class="small muted">{{ points - spent }} of {{ points }} point{{ points === 1 ? '' : 's' }} left<template v-if="cap !== 20"> · up to {{ cap }}</template></p>
    <div class="spread-grid">
      <div v-for="a in ABILITY_KEYS" :key="a" class="spread-cell" :class="{ up: adds[a] }">
        <span class="cs-label">{{ ABILITY_SHORT[a] }}</span>
        <b>{{ scores[a] + fixed(a) + (adds[a] ?? 0) }}</b>
        <span v-if="adds[a] || fixed(a)" class="small spread-add">+{{ (adds[a] ?? 0) + fixed(a) }}</span>
        <span class="spread-btns">
          <button type="button" class="chip-btn" :disabled="!adds[a]" :aria-label="`Take a point back from ${ABILITY_SHORT[a]}`" @click="add(a, -1)">−</button>
          <button type="button" class="chip-btn" :disabled="!canAdd(a)" :aria-label="`One point to ${ABILITY_SHORT[a]}`" @click="add(a, 1)">+</button>
        </span>
      </div>
    </div>
  </div>
</template>
