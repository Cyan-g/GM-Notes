<script setup lang="ts">
// Where an item is: the characters carrying it (how many, worn or attuned) and the shops selling it (at what price,
// how many left). "Give to …" hands one to the current character for free: loot handed out at the table.
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { formatMoney, playerMode, state } from '../store'
import { addToInventory, currentPc } from '../sheet'
import { carriersOf, shopsSelling } from '../items'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ item: Entry }>()
const carriers = computed(() => carriersOf(props.item))
const shops = computed(() => shopsSelling(props.item))
const giver = computed(() => (state.readOnly || playerMode.value ? undefined : currentPc.value))
function give() {
  if (giver.value) addToInventory(giver.value, props.item.id)
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
