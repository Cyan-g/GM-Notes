<script setup lang="ts">
// Death saving throws at 0 HP: three success and three failure boxes, Dead once three fail, and a "Nat 20" that
// brings the character back with 1 HP. A third success makes them Stable: the boxes empty, until damage starts them
// again. The sheet and the combat tracker show the same boxes.
import { computed } from 'vue'
import type { DeathSaveState } from '../model/types'
import { settleDeathSaves } from '../conditions'

const props = defineProps<{ saves: DeathSaveState; ro?: boolean; /** Advantage on them, in words (Durable). */ adv?: string }>()
const emit = defineEmits<{ set: [d: DeathSaveState]; nat20: [] }>()
const fate = computed(() => (props.saves.fail >= 3 ? 'Dead' : props.saves.stable ? 'Stable' : ''))
/** Clicking a box fills the row up to it; clicking the last filled box empties it. A click while stable starts over. */
function set(kind: 'ok' | 'fail', n: number) {
  if (props.ro) return
  const d: DeathSaveState = { ok: props.saves.ok, fail: props.saves.fail }
  d[kind] = d[kind] === n ? n - 1 : n
  emit('set', settleDeathSaves(d))
}
</script>

<template>
  <div class="death-saves" @click.stop>
    <span class="ds-label">Death saves<i v-if="adv" class="ds-adv" :title="adv">, {{ adv }}</i></span>
    <span class="ds-row ok" title="Successes">✓
      <button v-for="n in 3" :key="n" type="button" class="ds-box" :class="{ on: saves.ok >= n }" :disabled="ro" :aria-label="`${n} successes`" @click="set('ok', n)" />
    </span>
    <span class="ds-row fail" title="Failures (damage at 0 HP adds one)">✕
      <button v-for="n in 3" :key="n" type="button" class="ds-box" :class="{ on: saves.fail >= n }" :disabled="ro" :aria-label="`${n} failures`" @click="set('fail', n)" />
    </span>
    <b v-if="fate" class="ds-fate" :class="fate.toLowerCase()" :title="fate === 'Stable' ? 'Stable at 0 HP: no more death saves; taking damage starts them again, healing wakes them' : 'Three failed death saves'">{{ fate }}</b>
    <button v-else type="button" class="link-btn small" :disabled="ro" title="A natural 20: back on their feet with 1 HP" @click="emit('nat20')">Nat 20</button>
  </div>
</template>
