<script setup lang="ts">
// The wizard's hit points step: level 1 (the die's maximum, or rolled), then each level after as the Ruleset counts
// it (HitDieChoice, as in the level-up dialog: average or a roll, or only one of them), each with the CON modifier.
import { computed } from 'vue'
import { dieOfDraft, hpOf, hpOpen, wizard } from '../../wizard'
import { dieSize, mod, signed } from '../../model/dnd'
import { useDraft } from '../../composables/useDraft'
import HitDieChoice from '../HitDieChoice.vue'
import { hpFirstMode, hpMode } from '../../hitPoints'

const { d, scores } = useDraft()
const hitDie = computed(() => dieSize(dieOfDraft(d.value)) || 8)
const con = computed(() => mod(scores.value.con))
const LATER: Record<string, string> = { choice: 'the average or a roll you make', average: 'the average', rolled: 'a roll you make', max: "the die's maximum" }
const setRoll = (i: number, v: number | null | undefined) => { const l = [...d.value.hpRolls]; l[i] = v; wizard.d.hpRolls = l }
</script>

<template>
  <p class="small">{{ dieOfDraft(d) }} per level, with the Constitution modifier ({{ signed(con) }}) each level. Level 1: {{ hpFirstMode() === 'rolled' ? 'a roll' : "the die's maximum" }}; each level after: {{ LATER[hpMode()] }}.</p>
  <table class="wz-scores wz-hp">
    <tbody>
      <tr v-if="hpFirstMode() === 'rolled'" :class="{ 'wz-todo': d.hpFirst == null }"><th>Level 1</th>
        <td><HitDieChoice mode="rolled" :model-value="d.hpFirst" :die="dieOfDraft(d)" :con="con" label="Hit points at level 1" @update:model-value="v => (wizard.d.hpFirst = v)" /></td></tr>
      <tr v-else><th>Level 1</th><td><b>{{ hitDie }}</b> {{ signed(con) }} CON <span class="lu-gain">+{{ Math.max(1, hitDie + con) }} HP</span> <span class="muted small">(the die's maximum)</span></td></tr>
      <tr v-for="l in d.level - 1" :key="l" :class="{ 'wz-todo': hpOpen(d).includes(`the roll for level ${l + 1}`) }"><th>Level {{ l + 1 }}</th>
        <td><HitDieChoice :model-value="d.hpRolls[l - 1]" :die="dieOfDraft(d)" :con="con" :label="`Hit points at level ${l + 1}`" @update:model-value="v => setRoll(l - 1, v)" /></td></tr>
    </tbody>
  </table>
  <p><b>Hit points: <span v-flash="hpOf(d)">{{ hpOf(d) }}</span></b> <span class="muted small">(the species' or gear's extra HP comes on top on the sheet)</span></p>
</template>
