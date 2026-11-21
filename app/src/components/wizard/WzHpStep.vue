<script setup lang="ts">
// The wizard's hit points step: the die's maximum at level 1, then a typed roll or the average for each level after.
import { computed } from 'vue'
import { dieOfDraft, hpOf, wizard } from '../../wizard'
import { dieSize, mod, signed } from '../../model/dnd'
import { useDraft } from '../../composables/useDraft'
import { inputValue as val } from '../../dom'

const { d, scores } = useDraft()
const hitDie = computed(() => dieSize(dieOfDraft(d.value)) || 8)
const setRoll = (i: number, v: string) => { const l = [...d.value.hpRolls]; l[i] = v === '' ? undefined : Math.max(1, Math.min(hitDie.value, Number(v) || 1)); wizard.d.hpRolls = l }
</script>

<template>
  <p class="small">{{ dieOfDraft(d) }} per level, with the Constitution modifier ({{ signed(mod(scores.con)) }}) each level. Level 1 takes the die's maximum; later levels the average unless you type a roll.</p>
  <table class="wz-scores">
    <tbody>
      <tr><th>Level 1</th><td>{{ hitDie }}</td></tr>
      <tr v-for="l in d.level - 1" :key="l"><th>Level {{ l + 1 }}</th>
        <td><input type="number" min="1" :max="hitDie" class="wz-small" :value="d.hpRolls[l - 1] ?? ''" :placeholder="String(hitDie / 2 + 1)" @change="setRoll(l - 1, val($event))" /></td></tr>
    </tbody>
  </table>
  <p><b>Hit points: <span v-flash="hpOf(d)">{{ hpOf(d) }}</span></b> <span class="muted small">(the species' or gear's extra HP comes on top on the sheet)</span></p>
</template>
