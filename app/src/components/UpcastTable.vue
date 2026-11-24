<script setup lang="ts">
// Under a spell's card: what its rolls come to at each slot level it can be cast with (Fireball: 8d6 at 3rd, 9d6 at
// 4th…; Magic Missile: 3 darts, then 4…), or a cantrip's at character levels 1, 5, 11 and 17. Shown only when a roll grows.
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { rollText, rollsOf } from '../spells'
import { ORD, spellLevel } from '../model/dnd'

const props = defineProps<{ e: Entry }>()
const rolls = computed(() => rollsOf(props.e))
const lvl = computed(() => spellLevel(props.e))
const cantrip = computed(() => lvl.value === 0 && rolls.value.some(r => r.cantrip || r.beams))
const upcast = computed(() => lvl.value > 0 && rolls.value.some(r => r.slot || r.beams))
const rows = computed(() => (cantrip.value
  ? [1, 5, 11, 17].map(l => ({ at: `Level ${l}${l === 1 ? '–4' : l === 5 ? '–10' : l === 11 ? '–16' : '+'}`, text: rolls.value.map(r => rollText(props.e, r, { level: l })).join(' + ') }))
  : upcast.value ? Array.from({ length: 10 - lvl.value }, (_, i) => lvl.value + i).map(s => ({ at: `${ORD[s]} slot`, text: rolls.value.map(r => rollText(props.e, r, { slot: s })).join(' + ') })) : []))
</script>

<template>
  <section v-if="rows.length" class="upcast">
    <h3>{{ cantrip ? 'By character level' : 'By slot level' }}</h3>
    <table class="grid mini"><tbody><tr v-for="r in rows" :key="r.at"><th>{{ r.at }}</th><td>{{ r.text }}</td></tr></tbody></table>
  </section>
</template>
