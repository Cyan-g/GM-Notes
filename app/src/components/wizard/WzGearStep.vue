<script setup lang="ts">
// The wizard's equipment step: the class's starting kit options, the background's items or gold, and what goes into
// the inventory (what the world has no item for is left out, and said so).
import { computed } from 'vue'
import { backgroundGold, backgroundKit, classKitsOf, wizard } from '../../wizard'
import { itemNamed } from '../../lookup'
import { formatMoney } from '../../store'
import { useDraft } from '../../composables/useDraft'
import EntryLink from '../EntryLink.vue'

const { d, classPage, taken } = useDraft()
const kits = computed(() => classKitsOf(d.value.cls))
/** What the kits name but the world has no item for: left out of the inventory. */
const missing = computed(() => taken.value.items.filter(l => !(l.item ?? itemNamed(l.name)?.id)).map(l => l.name))
const bgKit = computed(() => backgroundKit(d.value))
const bgGold = computed(() => backgroundGold(d.value))
</script>

<template>
  <template v-if="kits.length">
    <h3>From the class</h3>
    <label v-for="(k, i) in kits" :key="i" class="wz-kit">
      <input type="radio" :checked="d.classKit === i" @change="wizard.d.classKit = i" />
      <span><b>{{ String.fromCharCode(65 + i) }}</b> {{ k.items.map(l => `${l.amount ? l.amount + ' × ' : ''}${l.name}`).join(', ') }}<template v-if="k.items.length && k.money"> and </template>{{ k.money ? formatMoney(k.money) : '' }}</span>
    </label>
  </template>
  <p v-else-if="d.cls" class="muted small">This class has no starting equipment here; add it on the sheet.</p>
  <template v-if="bgKit || bgGold">
    <h3>From the background</h3>
    <label v-if="bgKit" class="wz-kit"><input type="radio" :checked="d.bgKit === 'items'" @change="wizard.d.bgKit = 'items'" />
      <span><b>A</b> {{ bgKit.items.map(l => `${l.amount ? l.amount + ' × ' : ''}${l.name}`).join(', ') }}<template v-if="bgKit.money"> and {{ formatMoney(bgKit.money) }}</template></span></label>
    <label v-if="bgGold" class="wz-kit"><input type="radio" :checked="d.bgKit === 'money'" @change="wizard.d.bgKit = 'money'" />
      <span><b>B</b> {{ formatMoney(bgGold) }}</span></label>
  </template>
  <h3>Goes into the inventory</h3>
  <p class="small"><template v-for="(l, i) in taken.items.filter(x => x.item ?? itemNamed(x.name))" :key="i"><template v-if="i">, </template>{{ l.amount ? l.amount + ' × ' : '' }}<EntryLink :id="(l.item ?? itemNamed(l.name)!.id)" /></template>
    <template v-if="taken.money">{{ taken.items.some(x => x.item ?? itemNamed(x.name)) ? '; ' : '' }}{{ formatMoney(taken.money) }}</template></p>
  <p v-if="missing.length" class="small warn-text">Not in this world, so left out: {{ missing.join(', ') }}. Your DM can add them to the {{ classPage?.name ?? 'class' }}'s starting equipment, or you can add something else on the sheet.</p>
</template>
