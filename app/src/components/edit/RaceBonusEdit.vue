<script setup lang="ts">
// A race's ability score increase on its Edit page, in the main column: the fixed bonuses, the picks and the cap
// (AbilityBonusInput), what the ruleset does with it, and a preview of what a player sees in the creation wizard (the
// + buttons on scores of 10). A subrace's own increase replaces its main race's.
import { computed, ref } from 'vue'
import type { Entry } from '../../model/types'
import type { FieldDef } from '../../model/schema'
import { ABILITY_KEYS, abilityBonusText, type BonusChoice } from '../../abilityBonus'
import { get } from '../../store'
import { rule } from '../../rules'
import FieldInput from './FieldInput.vue'
import SpreadPicker from '../SpreadPicker.vue'

const props = defineProps<{ e: Entry; def: FieldDef }>()
const bonus = computed(() => props.e.fields.abilityIncrease)
const parent = computed(() => get(props.e.fields.parent))
const TEN = Object.fromEntries(ABILITY_KEYS.map(a => [a, 10])) as Record<(typeof ABILITY_KEYS)[number], number>
const preview = ref<BonusChoice>({ picks: [] })
const RULE: Record<string, string> = {
  choice: 'The wizard offers it, or the background’s, as the player chooses (Ruleset).',
  background: 'The Ruleset gives the background’s increase instead, so this one isn’t offered.',
  species: 'The Ruleset gives this increase (not the background’s) to new characters.',
}
</script>

<template>
  <section class="race-bonus">
    <h4>Ability score increase</h4>
    <p class="muted small">{{ RULE[rule('abilityIncrease')] }}<template v-if="parent && !bonus && parent.fields.abilityIncrease"> Without its own, it has {{ parent.name }}'s: {{ abilityBonusText(parent.fields.abilityIncrease) }}.</template></p>
    <FieldInput :def="def" :entry="e" />
    <div v-if="bonus?.pick?.length || bonus?.orPick?.length" class="rb-preview">
      <span class="muted small">What the player sees (on scores of 10):</span>
      <SpreadPicker :key="JSON.stringify(bonus)" v-model="preview" :bonus="bonus" :scores="TEN" />
    </div>
  </section>
</template>
