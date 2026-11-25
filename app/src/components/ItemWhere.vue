<script lang="ts">
/** Who loot was last given to, for the next item this session (handing out a pile goes to one character). */
let lastGiven = ''
</script>

<script setup lang="ts">
// Where an item is: the characters carrying it (how many, worn or attuned) and the shops selling it (at what price,
// how many left). "Give to …" hands one to a character for free (loot handed out at the table): the one last given to,
// else the current one, then the current campaign's party, then the rest.
import { computed, ref } from 'vue'
import type { Entry } from '../model/types'
import { byType, formatMoney, get, playerMode, state } from '../store'
import { currentPc } from '../sheet'
import { currentCampaign, membersOf } from '../sessions'
import Dropdown from './Dropdown.vue'
import { addToInventory } from '../sheetData'
import { carriersOf, shopsSelling } from '../items'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ item: Entry }>()
const carriers = computed(() => carriersOf(props.item))
const shops = computed(() => shopsSelling(props.item))
/** The characters it can be given to: the current one, the current campaign's party, then the others; each by name. */
const pcs = computed(() => {
  if (state.readOnly || playerMode.value) return []
  const party = new Set(currentCampaign.value ? membersOf(currentCampaign.value.id).map(p => p.id) : [])
  const rank = (p: Entry) => (p.id === currentPc.value?.id ? 0 : party.has(p.id) ? 1 : 2)
  return (byType.value.get('pc') ?? []).slice().sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
})
const to = ref(lastGiven)
const giver = computed(() => get(to.value) ?? pcs.value[0])
const given = ref('')
function give() {
  if (!giver.value) return
  addToInventory(giver.value, props.item.id)
  lastGiven = giver.value.id
  given.value = `One ${props.item.name} put in ${giver.value.name}'s inventory.`
}
</script>

<template>
  <div v-if="carriers.length || shops.length || giver" class="card item-where">
    <h3>Where it is</h3>
    <template v-if="carriers.length">
      <h4 class="iw-sub">Carried by</h4>
      <ul class="plain"><li v-for="x in carriers" :key="x.p.id"><EntryLink :id="x.p.id" icon /> <span class="muted small"><template v-if="x.qty">× {{ x.qty }}</template><template v-if="x.qty && x.stored"> · </template><template v-if="x.stored">{{ x.stored }} in the treasury</template></span>
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
