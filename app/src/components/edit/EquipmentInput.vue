<script setup lang="ts">
// A background's starting equipment: items from the world (or just a name, for things the world has no entry for) with
// their amounts, the coins that come with them, and the coins a player may take instead. Kept for the creation wizard.
import { computed } from 'vue'
import type { Equipment } from '../../model/types'
import KitLines from './KitLines.vue'
import MoneyInput from './MoneyInput.vue'
import { itemNamed } from '../../lookup'

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
/** The world's item a name line stands for ("Arrows" → Arrow), if there is one. */
const match = (name?: string) => (name ? itemNamed(name) : undefined)
const linkable = computed(() => items.value.filter(l => !l.item && match(l.name)).length)
const linkAll = () => put({ items: items.value.map(l => { const m = !l.item ? match(l.name) : undefined; return m ? { item: m.id, ...(l.amount ? { amount: l.amount } : {}) } : l }) })
</script>

<template>
  <div class="equipment-input">
    <!-- the same list a class's options have (KitLines), with "one of several" lines the player picks from -->
    <KitLines :lines="items" among @change="l => put({ items: l })" />
    <button v-if="linkable > 1" type="button" class="link-btn small" @click="linkAll">Link all {{ linkable }} that match the world's items</button>
    <div class="trait-row">
      <label class="small">and coins <MoneyInput :model-value="eq.money" placeholder="e.g. 8 gp" @update:model-value="v => put({ money: v })" /></label>
      <label class="small">or instead <MoneyInput :model-value="eq.instead" placeholder="e.g. 50 gp" @update:model-value="v => put({ instead: v })" /></label>
    </div>
  </div>
</template>
