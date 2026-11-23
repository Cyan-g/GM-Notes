<script setup lang="ts">
// The hit points a new level gives, by the Ruleset's "Hit points per level" (hitPoints.ts): the die's average or what
// the player rolled (typed in), always the average, always rolled, or the maximum; plus the Constitution modifier, at
// least 1. The same in the level-up dialog and in the creator's Hit points step (a row per level; level 1 by its own
// rule, `mode`).
//   v-model: undefined is the average; a number is the roll; null is "rolled", nothing typed yet
import { computed, useId } from 'vue'
import { signed } from '../model/dnd'
import { dieAverage, hpGain, hpMode, type HpMode } from '../hitPoints'

const props = defineProps<{ die: string; con: number; label?: string; mode?: HpMode }>()
const model = defineModel<number | null | undefined>()
const id = useId()
const how = computed(() => props.mode ?? hpMode())
const size = computed(() => Number(props.die.replace(/\D/g, '')) || 8)
const avg = computed(() => dieAverage(size.value))
const rolled = computed(() => how.value === 'rolled' || (how.value === 'choice' && model.value !== undefined))
/** What it adds: null while a roll is missing or isn't one the die can show. */
const gain = computed(() => hpGain(how.value, model.value, size.value, props.con))
function typed(ev: Event) { const v = (ev.target as HTMLInputElement).value.trim(); model.value = v === '' ? null : Number(v) }
defineExpose({ gain })
</script>

<template>
  <div class="lu-hp" role="radiogroup" :aria-label="label ?? 'Hit points'">
    <!-- the player chooses: average or a roll -->
    <template v-if="how === 'choice'">
      <label><input type="radio" :name="id" :checked="!rolled" @change="model = undefined" /> Average: {{ avg }} {{ signed(con) }} CON</label>
      <label><input type="radio" :name="id" :checked="rolled" @change="model = model ?? null" /> Rolled {{ die }}:
        <input type="number" min="1" :max="size" class="lu-roll" placeholder="?" :value="model ?? ''" :aria-label="`What the ${die} showed`"
               @focus="model === undefined && (model = null)" @input="typed" /> {{ signed(con) }} CON</label>
    </template>
    <!-- the Ruleset decides: only that way -->
    <label v-else-if="how === 'rolled'">Roll the {{ die }}:
      <input type="number" min="1" :max="size" class="lu-roll" placeholder="?" :value="model ?? ''" :aria-label="`What the ${die} showed`" @input="typed" /> {{ signed(con) }} CON</label>
    <span v-else-if="how === 'average'" title="The Ruleset counts the die's average">Average: {{ avg }} {{ signed(con) }} CON</span>
    <span v-else title="The Ruleset counts the die's maximum">Maximum: {{ size }} {{ signed(con) }} CON</span>
    <b v-if="gain != null" class="lu-gain">+{{ gain }} HP</b>
    <span v-else class="small wz-bad">{{ model == null ? `roll the ${die} and type what it shows` : `a ${die} shows 1 to ${size}` }}</span>
  </div>
</template>
