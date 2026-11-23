<script setup lang="ts">
// The hit points a new level gives: the die's average, or what the player rolled (typed in), plus the Constitution
// modifier, at least 1. The same in the level-up dialog and in the creator's Hit points step (a row per level).
//   v-model: undefined is the average; a number is the roll; null is "rolled", nothing typed yet
import { computed, useId } from 'vue'
import { signed } from '../model/dnd'

const props = defineProps<{ die: string; con: number; label?: string }>()
const model = defineModel<number | null | undefined>()
const id = useId()
const size = computed(() => Number(props.die.replace(/\D/g, '')) || 8)
const avg = computed(() => size.value / 2 + 1)
const rolled = computed(() => model.value !== undefined)
/** What it adds: null while a roll is missing or isn't one the die can show. */
const gain = computed(() => { const r = rolled.value ? model.value : avg.value; return r == null || r < 1 || r > size.value ? null : Math.max(1, r + props.con) })
function typed(ev: Event) { const v = (ev.target as HTMLInputElement).value.trim(); model.value = v === '' ? null : Number(v) }
defineExpose({ gain })
</script>

<template>
  <div class="lu-hp" role="radiogroup" :aria-label="label ?? 'Hit points'">
    <label><input type="radio" :name="id" :checked="!rolled" @change="model = undefined" /> Average: {{ avg }} {{ signed(con) }} CON</label>
    <label><input type="radio" :name="id" :checked="rolled" @change="model = model ?? null" /> Rolled {{ die }}:
      <input type="number" min="1" :max="size" class="lu-roll" placeholder="?" :value="model ?? ''" :aria-label="`What the ${die} showed`"
             @focus="model === undefined && (model = null)" @input="typed" /> {{ signed(con) }} CON</label>
    <b v-if="gain != null" class="lu-gain">+{{ gain }} HP</b>
    <span v-else class="small wz-bad">{{ model == null ? `roll the ${die} and type what it shows` : `a ${die} shows 1 to ${size}` }}</span>
  </div>
</template>
