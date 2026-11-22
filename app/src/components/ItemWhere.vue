<script setup lang="ts">
// Where an item is: the characters carrying it (how many, worn or attuned) and the shops selling it (at what price,
// how many left). "Give to …" hands one to a character (the current one first) for free: loot handed out at the table.
import { computed, ref } from 'vue'
import type { Entry } from '../model/types'
import { byType, formatMoney, get, playerMode, state } from '../store'
import { currentPc } from '../sheet'
import Dropdown from './Dropdown.vue'
import { addToInventory } from '../sheetData'
import { carriersOf, shopsSelling } from '../items'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ item: Entry }>()
const carriers = computed(() => carriersOf(props.item))
const shops = computed(() => shopsSelling(props.item))
/** The characters it can be given to: the current one first, then the others by name. */
const pcs = computed(() => (state.readOnly || playerMode.value ? [] : (byType.value.get('pc') ?? []).slice().sort((a, b) => Number(b.id === currentPc.value?.id) - Number(a.id === currentPc.value?.id) || a.name.localeCompare(b.name))))
const to = ref('')
const giver = computed(() => get(to.value) ?? pcs.value[0])
const given = ref('')
function give() {
  if (!giver.value) return
  addToInventory(giver.value, props.item.id)
  given.value = `One ${props.item.name} put in ${giver.value.name}'s inventory.`
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
    <div v-if="giver" class="iw-give">
      <button type="button" class="chip-btn" :title="`Put one in ${giver.name}'s inventory, free (loot)`" @click="give">＋ Give to</button>
      <Dropdown compact :value="giver.id" aria-label="The character to give it to" @change="to = ($event.target as HTMLSelectElement).value">
        <option v-for="p in pcs" :key="p.id" :value="p.id">{{ p.name }}{{ p.id === currentPc?.id ? ' (current)' : '' }}</option>
      </Dropdown>
    </div>
    <p v-if="given" class="small ok">{{ given }}</p>
  </div>
</template>
