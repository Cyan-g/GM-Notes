<script setup lang="ts">
// A race's ability score increase on its Edit page, in the main column: the fixed bonuses, the picks and the cap
// (AbilityBonusInput), what the ruleset does with it, and a preview of what a player sees in the creation wizard (the
// + buttons on scores of 10). A subrace's own increase replaces its main race's.
import { computed, ref } from 'vue'
import type { Entry } from '../../model/types'
import type { FieldDef } from '../../model/schema'
import { abilityBonusText, type BonusChoice } from '../../abilityBonus'
import { ABILITY_KEYS } from '../../model/dnd'
import { get } from '../../store'
import { bonusSources } from '../../rules'
import FieldInput from './FieldInput.vue'
import SpreadPicker from '../SpreadPicker.vue'

const props = defineProps<{ e: Entry; def: FieldDef }>()
const bonus = computed(() => props.e.fields.abilityIncrease)
const parent = computed(() => get(props.e.fields.parent))
const TEN = Object.fromEntries(ABILITY_KEYS.map(a => [a, 10])) as Record<(typeof ABILITY_KEYS)[number], number>
const preview = ref<BonusChoice>({ picks: [] })
/** What the creator does with it, as the Ruleset's switches say. */
const ruleText = computed(() => {
  const on = bonusSources()
  if (!on.includes('species') && !on.includes('subrace')) return 'The Ruleset offers no species increase in the creator (the background’s or a typed one instead).'
  return props.e.fields.parent
    ? `${on.includes('species') ? 'The creator adds it to its main race’s' : ''}${on.includes('species') && on.includes('subrace') ? ', or offers it alone' : on.includes('subrace') ? 'The creator offers it alone' : ''} (Ruleset).`
    : 'The creator offers it, with a subrace’s added (Ruleset).'
})
</script>

<template>
  <section class="race-bonus">
    <h4>Ability score increase</h4>
    <p class="muted small">{{ ruleText }}<template v-if="parent && !bonus && parent.fields.abilityIncrease"> Without its own, it has {{ parent.name }}'s: {{ abilityBonusText(parent.fields.abilityIncrease) }}.</template></p>
    <FieldInput :def="def" :entry="e" />
    <div v-if="bonus?.pick?.length || bonus?.orPick?.length" class="rb-preview">
      <span class="muted small">What the player sees (on scores of 10):</span>
      <SpreadPicker :key="JSON.stringify(bonus)" v-model="preview" :bonus="bonus" :scores="TEN" />
    </div>
  </section>
</template>
