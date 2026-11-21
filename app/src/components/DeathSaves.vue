<script setup lang="ts">
// Death saving throws at 0 HP: three success and three failure boxes, Stable or Dead once a row is full, and a
// "Nat 20" that brings the character back with 1 HP. The sheet and the combat tracker show the same boxes.
import { computed } from 'vue'

const props = defineProps<{ saves: { ok: number; fail: number }; ro?: boolean; /** Advantage on them, in words (Durable). */ adv?: string }>()
const emit = defineEmits<{ set: [d: { ok: number; fail: number }]; nat20: [] }>()
const fate = computed(() => (props.saves.fail >= 3 ? 'Dead' : props.saves.ok >= 3 ? 'Stable' : ''))
/** Clicking a box fills the row up to it; clicking the last filled box empties it. */
function set(kind: 'ok' | 'fail', n: number) {
  if (props.ro) return
  const d = { ...props.saves }
  d[kind] = d[kind] === n ? n - 1 : n
  emit('set', d)
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
    <b v-if="fate" class="ds-fate" :class="fate.toLowerCase()">{{ fate }}</b>
    <button v-else type="button" class="link-btn small" :disabled="ro" title="A natural 20: back on their feet with 1 HP" @click="emit('nat20')">Nat 20</button>
  </div>
</template>
