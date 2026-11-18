<script setup lang="ts">
// Shop stock: item, optional own price, optional count. Empty price = item value × markup.
import { computed } from 'vue'
import type { StockLine } from '../../model/types'
import { formatMoney, get } from '../../store'
import EntryPicker from './EntryPicker.vue'
import MoneyInput from './MoneyInput.vue'

const props = defineProps<{ modelValue?: StockLine[]; markup: number }>()
const emit = defineEmits<{ 'update:modelValue': [StockLine[]] }>()
const lines = computed(() => props.modelValue ?? [])
const listPrice = (id: string) => { const v = get(id)?.fields.value; return v != null ? Math.round(v * props.markup) : undefined }

function update(i: number, patch: Partial<StockLine>) {
  const next = lines.value.map((l, j) => {
    if (j !== i) return l
    const n: StockLine = { ...l, ...patch }
    if (n.price == null) delete n.price
    if (n.stock == null) delete n.stock
    return n
  })
  emit('update:modelValue', next)
}
function remove(i: number) { emit('update:modelValue', lines.value.filter((_, j) => j !== i)) }
function add(id: string) { emit('update:modelValue', [...lines.value, { item: id }]) }
</script>

<template>
  <table class="mini edit-table">
    <thead><tr><th>Item</th><th class="num">Price</th><th class="num">Own price</th><th class="num">In stock</th><th /></tr></thead>
    <tbody>
      <tr v-for="(l, i) in lines" :key="l.item + i">
        <td><EntryPicker :model-value="l.item" :types="['item']" @update:model-value="v => v ? update(i, { item: v }) : remove(i)" /></td>
        <td class="num">{{ formatMoney(l.price ?? listPrice(l.item)) }}</td>
        <td class="num"><MoneyInput :model-value="l.price" placeholder="auto" @update:model-value="v => update(i, { price: v })" /></td>
        <td class="num"><input type="number" min="0" class="short" :value="l.stock ?? ''" placeholder="∞" @change="update(i, { stock: ($event.target as HTMLInputElement).value === '' ? undefined : Number(($event.target as HTMLInputElement).value) })" /></td>
        <td><button type="button" class="x" title="Remove" @click="remove(i)">×</button></td>
      </tr>
      <tr><td colspan="5"><EntryPicker add :types="['item']" :exclude="lines.map(l => l.item)" placeholder="Add item…" @pick="add" /></td></tr>
    </tbody>
  </table>
</template>
