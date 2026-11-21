<script setup lang="ts">
// At the top of the play sheet: the conditions the character has (the same list as their combatant's in the tracker),
// each with its icon and ✕, more from the menu, the exhaustion level as the ruleset counts it, and a line on what each
// one does. The sheet's numbers already count what they change (conditions.ts); the lines say the rest.
import { useReadOnly } from '../composables/useReadOnly'
import { computed } from 'vue'
import type { CharacterSheet, Entry } from '../model/types'
import { editSheet } from '../sheetData'
import { state } from '../store'
import { rule } from '../rules'
import { CONDITION_RULES, exhaustionText, setConditions } from '../conditions'
import { TRACKER_CONDITIONS } from '../model/dnd'
import ConditionIcon from './ConditionIcon.vue'

const props = defineProps<{ pc: Entry; s: CharacterSheet }>()
/** Nothing changes in a read-only world, nor on a character that's read-only here (a player's, at the DM's). */
const ro = useReadOnly()
const list = computed(() => props.s.conditions ?? [])
const missing = computed(() => TRACKER_CONDITIONS.filter(x => !list.value.includes(x)))
const level = computed(() => Math.max(1, Math.min(6, props.s.exhaustion ?? 1)))

function set(next: string[], exhaustion?: number) { if (!ro.value) editSheet(props.pc, x => setConditions(props.pc, x, next, exhaustion)) }
function add(ev: Event) {
  const sel = ev.target as HTMLSelectElement
  if (sel.value) set([...list.value, sel.value], sel.value === 'Exhaustion' ? 1 : undefined)
  sel.value = ''
}
const remove = (x: string) => set(list.value.filter(y => y !== x), x === 'Exhaustion' ? 0 : undefined)
const step = (d: number) => set(list.value, Math.max(1, Math.min(6, level.value + d)))

/** What each condition does, the exhaustion line as the active ruleset has it. */
const lines = computed(() => list.value.map(x => ({ name: x, text: x === 'Exhaustion' ? `Level ${level.value} (${rule('exhaustion')} rules): ${exhaustionText(level.value)}` : CONDITION_RULES[x]?.text ?? '' })))
</script>

<template>
  <div class="cs-conds" :class="{ empty: !list.length }">
    <div class="conds">
      <span v-for="x in list" :key="x" class="cond-chip">
        <ConditionIcon :name="x" />{{ x }}
        <span v-if="x === 'Exhaustion'" class="cs-exh">
          <button type="button" class="cond-x" :disabled="ro || level <= 1" title="One level less" @click="step(-1)">−</button>
          <b>{{ level }}</b>
          <button type="button" class="cond-x" :disabled="ro || level >= 6" title="One level more" @click="step(1)">+</button>
        </span>
        <button type="button" class="cond-x" :disabled="ro" :title="`Remove ${x}`" @click="remove(x)">×</button>
      </span>
      <select v-if="!ro" class="cond-add" aria-label="Add a condition" @change="add">
        <option value="">＋ Condition</option>
        <option v-for="x in missing" :key="x" :value="x">{{ x }}</option>
      </select>
    </div>
    <ul v-if="lines.length" class="cs-cond-lines small">
      <li v-for="l in lines" :key="l.name"><b>{{ l.name }}</b> <span class="muted">{{ l.text }}</span></li>
    </ul>
  </div>
</template>
