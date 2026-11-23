<script setup lang="ts">
// The wizard's hit points step: the die's maximum at level 1, then for each level after the average or a roll the
// player made and typed in (HitDieChoice, as in the level-up dialog), each with the Constitution modifier.
import { computed } from 'vue'
import { dieOfDraft, hpOf, wizard } from '../../wizard'
import { dieSize, mod, signed } from '../../model/dnd'
import { useDraft } from '../../composables/useDraft'
import HitDieChoice from '../HitDieChoice.vue'

const { d, scores } = useDraft()
const hitDie = computed(() => dieSize(dieOfDraft(d.value)) || 8)
const con = computed(() => mod(scores.value.con))
const setRoll = (i: number, v: number | null | undefined) => { const l = [...d.value.hpRolls]; l[i] = v; wizard.d.hpRolls = l }
</script>

<template>
  <p class="small">{{ dieOfDraft(d) }} per level, with the Constitution modifier ({{ signed(con) }}) each level. Level 1 takes the die's maximum; each level after, the average or a roll you make.</p>
  <table class="wz-scores wz-hp">
    <tbody>
      <tr><th>Level 1</th><td><b>{{ hitDie }}</b> {{ signed(con) }} CON <span class="lu-gain">+{{ Math.max(1, hitDie + con) }} HP</span> <span class="muted small">(the die's maximum)</span></td></tr>
      <tr v-for="l in d.level - 1" :key="l" :class="{ 'wz-todo': d.hpRolls[l - 1] === null }"><th>Level {{ l + 1 }}</th>
        <td><HitDieChoice :model-value="d.hpRolls[l - 1]" :die="dieOfDraft(d)" :con="con" :label="`Hit points at level ${l + 1}`" @update:model-value="v => setRoll(l - 1, v)" /></td></tr>
    </tbody>
  </table>
  <p><b>Hit points: <span v-flash="hpOf(d)">{{ hpOf(d) }}</span></b> <span class="muted small">(the species' or gear's extra HP comes on top on the sheet)</span></p>
</template>
