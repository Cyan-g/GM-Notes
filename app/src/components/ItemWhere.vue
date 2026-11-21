<script setup lang="ts">
// Where an item is: the characters carrying it (how many, worn or attuned) and the shops selling it (at what price,
// how many left). "Give to …" hands one to the current character for free: loot handed out at the table.
import { computed } from 'vue'
import type { Entry, StockLine } from '../model/types'
import { byType, formatMoney, playerMode, state } from '../store'
import { currentPc, editSheet } from '../sheet'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ item: Entry }>()
const carriers = computed(() => (byType.value.get('pc') ?? []).map(p => {
  const lines = (p.fields.sheet?.inventory ?? []).filter(l => l.item === props.item.id && l.qty > 0)
  return { p, qty: lines.reduce((n, l) => n + l.qty, 0), attuned: lines.some(l => l.attuned), equipped: lines.some(l => l.equipped) }
}).filter(x => x.qty))
const shops = computed(() => (byType.value.get('place') ?? []).flatMap(s => {
  const l = ((s.fields.stock as StockLine[] | undefined) ?? []).find(x => x.item === props.item.id)
  if (!l) return []
  const base = props.item.fields.value as number | undefined, markup = (s.fields.markup as number | undefined) ?? 1
  return [{ s, price: l.price ?? (base != null ? Math.round(base * markup) : undefined), stock: l.stock }]
}))
const giver = computed(() => (state.readOnly || playerMode.value ? undefined : currentPc.value))
function give() {
  const pc = giver.value
  if (!pc) return
  editSheet(pc, s => {
    const line = s.inventory.find(l => l.item === props.item.id && !l.equipped)
    if (line) line.qty = (line.qty || 0) + 1
    else s.inventory.push({ item: props.item.id, qty: 1 })
  })
}
</script>

<template>
  <div v-if="carriers.length || shops.length || giver" class="card item-where">
    <h3>Where it is</h3>
    <template v-if="carriers.length">
      <h4 class="iw-sub">Carried by</h4>
      <ul class="plain"><li v-for="x in carriers" :key="x.p.id"><EntryLink :id="x.p.id" icon /> <span class="muted small">× {{ x.qty }}</span>
        <span v-if="x.attuned" class="chip small">attuned</span><span v-else-if="x.equipped" class="chip small">equipped</span></li></ul>
    </template>
    <template v-if="shops.length">
      <h4 class="iw-sub">Sold at</h4>
      <ul class="plain"><li v-for="x in shops" :key="x.s.id"><EntryLink :id="x.s.id" icon />
        <span class="muted small"> · {{ x.price != null ? formatMoney(x.price) : 'no price' }}<template v-if="x.stock != null"> · {{ x.stock ? `${x.stock} left` : 'sold out' }}</template></span></li></ul>
    </template>
    <p v-if="!carriers.length && !shops.length" class="muted small">Nobody carries it and no shop sells it.</p>
    <button v-if="giver" type="button" class="chip-btn" :title="`Put one in ${giver.name}'s inventory, free (loot)`" @click="give">＋ Give to {{ giver.name.split(' ')[0] }}</button>
  </div>
</template>
