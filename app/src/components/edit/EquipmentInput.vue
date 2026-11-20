<script setup lang="ts">
// A background's starting equipment: items from the world (or just a name, for things the world has no entry for) with
// their amounts, the coins that come with them, and the coins a player may take instead. Kept for the creation wizard.
import { computed } from 'vue'
import type { Equipment, EquipmentLine } from '../../model/types'
import EntryPicker from './EntryPicker.vue'
import MoneyInput from './MoneyInput.vue'
import EntryLink from '../EntryLink.vue'

const model = defineModel<Equipment | undefined>()
const eq = computed<Equipment>(() => model.value ?? {})
function put(p: Partial<Equipment>) {
  const n: Equipment = { ...eq.value, ...p }
  if (!n.items?.length) delete n.items
  if (!n.money) delete n.money
  if (!n.instead) delete n.instead
  model.value = Object.keys(n).length ? n : undefined
}
const items = computed(() => eq.value.items ?? [])
function setLine(i: number, l: EquipmentLine) {
  const next = [...items.value]
  if (!l.amount || l.amount <= 1) delete l.amount
  next[i] = l
  put({ items: next })
}
const remove = (i: number) => put({ items: items.value.filter((_, k) => k !== i) })
const addItem = (id: string) => put({ items: [...items.value, { item: id }] })
const addName = (name: string) => { if (name.trim()) put({ items: [...items.value, { name: name.trim() }] }) }
</script>

<template>
  <div class="equipment-input effects-input">
    <div v-for="(l, i) in items" :key="i" class="effect-row">
      <input type="number" min="1" class="effect-value" :value="l.amount ?? 1" aria-label="Amount" @change="setLine(i, { ...l, amount: Number(($event.target as HTMLInputElement).value) || 1 })" />
      <EntryLink v-if="l.item" :id="l.item" />
      <input v-else :value="l.name" aria-label="Name" @change="setLine(i, { ...l, name: ($event.target as HTMLInputElement).value })" />
      <button type="button" class="link-btn" title="Remove" @click="remove(i)">×</button>
    </div>
    <EntryPicker add :types="['item']" :exclude="items.flatMap(l => l.item ? [l.item] : [])" free-text="as a name" placeholder="Add an item…" @pick="addItem" @text="addName" />
    <div class="trait-row">
      <label class="small">and coins <MoneyInput :model-value="eq.money" placeholder="e.g. 8 gp" @update:model-value="v => put({ money: v })" /></label>
      <label class="small">or instead <MoneyInput :model-value="eq.instead" placeholder="e.g. 50 gp" @update:model-value="v => put({ instead: v })" /></label>
    </div>
  </div>
</template>
