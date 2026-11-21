<script setup lang="ts">
// A place's people and trade, on its page: who lives here (what they do, how they stand with the party; the dead
// folded away), how many live in the places inside it, and for a shop or tavern its keeper and prices.
import { computed } from 'vue'
import type { Entry, Id } from '../model/types'
import { byType, get, isCurrent, playerMode, relationsOf } from '../store'
import { statusText } from '../npc'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ e: Entry }>()
const residentsOf = (id: Id) => (relationsOf.value.get(id) ?? []).filter(r => r.kind === 'lives-in' && r.b === id && isCurrent(r)).map(r => get(r.a)).filter((x): x is Entry => !!x)
const gone = (x: Entry) => /^(dead|missing)$/i.test(String(x.fields.status ?? '').trim())
const residents = computed(() => residentsOf(props.e.id).sort((a, b) => a.name.localeCompare(b.name)))
const living = computed(() => residents.value.filter(x => !gone(x)))
const away = computed(() => residents.value.filter(gone))
/** Everyone living in the places inside this one (all the way down). */
const inside = computed(() => {
  const places = byType.value.get('place') ?? []
  const kids = new Map<Id, Id[]>()
  for (const p of places) { const par = p.fields.parent as Id | undefined; if (par) kids.set(par, [...(kids.get(par) ?? []), p.id]) }
  let n = 0
  const seen = new Set<Id>()
  const walk = (id: Id) => { for (const k of kids.get(id) ?? []) if (!seen.has(k)) { seen.add(k); n += residentsOf(k).length; walk(k) } }
  walk(props.e.id)
  return n
})
const note = (x: Entry) => [x.fields.occupation, statusText(x)].filter(Boolean).join(' · ')
const attitude = (x: Entry) => (playerMode.value ? '' : String(x.fields.attitude ?? ''))
const shop = computed(() => ['Shop', 'Tavern'].includes(String(props.e.fields.placeType ?? '')))
const markup = computed(() => props.e.fields.markup as number | undefined)
</script>

<template>
  <div v-if="shop && (e.fields.shopkeeper || markup != null)" class="card">
    <h3>{{ e.fields.placeType }}</h3>
    <dl>
      <template v-if="e.fields.shopkeeper"><dt>Keeper</dt><dd><EntryLink :id="String(e.fields.shopkeeper)" icon /></dd></template>
      <template v-if="markup != null"><dt>Prices</dt><dd>{{ markup === 1 ? 'the list price' : `×${markup} the list price` }}</dd></template>
    </dl>
  </div>
  <div v-if="residents.length || inside" class="card residents-card">
    <h3>Residents <span class="muted small">{{ living.length }}<template v-if="inside"> · {{ inside }} more in the places inside</template></span></h3>
    <ul class="rel rel-scroll">
      <li v-for="x in living" :key="x.id"><EntryLink :id="x.id" icon />
        <span v-if="note(x)" class="role">{{ note(x) }}</span>
        <span v-if="attitude(x)" class="badge small" :class="'att-' + attitude(x).toLowerCase()">{{ attitude(x) }}</span></li>
    </ul>
    <details v-if="away.length">
      <summary class="muted small">Dead or missing ({{ away.length }})</summary>
      <ul class="rel ended-list"><li v-for="x in away" :key="x.id"><EntryLink :id="x.id" icon /><span class="role">{{ statusText(x) }}</span></li></ul>
    </details>
  </div>
</template>
