<script setup lang="ts">
// Recipe lines: any number of ingredient + amount, with live cost.
import { computed } from 'vue'
import type { RecipeLine } from '../../model/types'
import { formatMoney, get } from '../../store'
import EntryPicker from './EntryPicker.vue'
import { CRAFTING_RULE, craftingTime } from '../../crafting'

const props = defineProps<{ modelValue?: RecipeLine[]; itemValue?: number }>()
const emit = defineEmits<{ 'update:modelValue': [RecipeLine[]] }>()
const lines = computed(() => props.modelValue ?? [])
const price = (id: string) => get(id)?.fields.value
const total = computed(() => lines.value.reduce((s, l) => s + (price(l.item) ?? 0) * l.amount, 0))

function update(i: number, patch: Partial<RecipeLine>) {
  const next = lines.value.map((l, j) => (j === i ? { ...l, ...patch } : l))
  emit('update:modelValue', next)
}
function remove(i: number) { emit('update:modelValue', lines.value.filter((_, j) => j !== i)) }
function add(id: string) { emit('update:modelValue', [...lines.value, { item: id, amount: 1 }]) }
</script>

<template>
  <table class="mini edit-table">
    <thead><tr><th>Ingredient</th><th class="num">Amount</th><th class="num">Cost</th><th /></tr></thead>
    <tbody>
      <tr v-for="(l, i) in lines" :key="i">
        <td><EntryPicker :model-value="l.item" :types="['item']" @update:model-value="v => v ? update(i, { item: v }) : remove(i)" /></td>
        <td class="num"><input type="number" min="0" step="1" class="short" :value="l.amount" @change="update(i, { amount: Number(($event.target as HTMLInputElement).value) || 0 })" /></td>
        <td class="num">{{ formatMoney((price(l.item) ?? 0) * l.amount) }}</td>
        <td><button type="button" class="x" title="Remove" @click="remove(i)">×</button></td>
      </tr>
      <tr><td colspan="4"><EntryPicker add :types="['item']" placeholder="Add ingredient…" @pick="add" /></td></tr>
    </tbody>
    <tfoot>
      <tr><td colspan="2">Ingredient cost</td><td class="num">{{ formatMoney(total) }}</td><td /></tr>
      <tr class="craft-time" :title="CRAFTING_RULE"><td colspan="2">⏳ Crafting time <span v-if="!itemValue" class="muted small">(set the item's value)</span></td><td class="num">{{ craftingTime(itemValue) || '—' }}</td><td /></tr>
    </tfoot>
  </table>
</template>
