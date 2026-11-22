<script setup lang="ts">
// The side cards of an entry's page about what it's connected to: its relations grouped by how they read from its
// side, what an item is used in and where it is, the maps with a pin for it, the characters who know a spell, and
// the entries that mention it (leaving out what another card already lists).
import { computed } from 'vue'
import type { Entry, Relation } from '../model/types'
import { RELATION_KINDS } from '../model/schema'
import { backlinks, byType, childrenOf, entries, get, hiddenFromPlayers, relationsOf } from '../store'
import { hrefMap } from '../router'
import { carriersOf, shopsSelling } from '../items'
import { raceMembers } from '../species'
import { dateRange, factRelations, relationEnded as ended } from '../entryFacts'
import AppIcon from './AppIcon.vue'
import EntryLink from './EntryLink.vue'
import ItemWhere from './ItemWhere.vue'
import { membersOf } from '../sessions'

const props = defineProps<{ e: Entry }>()

/** Relations grouped by how they read from this entry's side. */
const relGroups = computed(() => {
  const x = props.e
  const inFacts = factRelations(x)
  const out = new Map<string, { other: string; r: Relation }[]>()
  for (const r of relationsOf.value.get(x.id) ?? []) {
    const k = RELATION_KINDS[r.kind]
    const mine = r.a === x.id
    const label = mine ? k.forward : k.reverse
    if (x.type === 'organization' && r.kind === 'member' && !mine) continue // shown in MembersCard
    if (x.type === 'place' && r.kind === 'lives-in' && !mine) continue // shown in the Residents card (PlaceCards)
    if (inFacts.has(r.id)) continue // shown under the name
    if (!out.has(label)) out.set(label, [])
    out.get(label)!.push({ other: mine ? r.b : r.a, r })
  }
  for (const list of out.values()) list.sort((p, q) => Number(!!ended(p.r)) - Number(!!ended(q.r)) || (get(p.other)?.name ?? '').localeCompare(get(q.other)?.name ?? ''))
  return [...out]
})

/** Maps that have a pin for this entry. */
const onMaps = computed(() => entries.value.flatMap(p => ((p.fields.pins) ?? []).filter(pin => pin.entry === props.e.id).map(pin => ({ place: p, pin }))))

const usedIn = computed(() => props.e.type === 'item'
  ? entries.value.filter(n => ((n.fields.recipe as { item: string }[]) ?? []).some(l => l.item === props.e.id)) : [])
/** The characters with this spell in their spellbook. */
const knownBy = computed(() => (props.e.type === 'spell' ? (byType.value.get('pc') ?? []).filter(p => p.fields.sheet?.spellbook?.known?.includes(props.e.id)) : []))
const mentions = computed(() => {
  const x = props.e
  const related = new Set((relationsOf.value.get(x.id) ?? []).flatMap(r => [r.a, r.b]))
  // Leave out what another card already lists: the parts of it, what an item is used in, sold at or carried by,
  // a race's characters, a spell's casters.
  const children = childrenOf.value.get(x.id) ?? []
  const soldAt = x.type === 'item' ? shopsSelling(x).map(s => s.s) : []
  const carriedBy = x.type === 'item' ? carriersOf(x).map(c => c.p) : []
  const members = x.type === 'race' ? raceMembers(x) : []
  const party = x.type === 'campaign' ? membersOf(x.id) : []
  const kids = new Set([...children, ...usedIn.value, ...soldAt, ...members, ...knownBy.value, ...carriedBy, ...party].map(c => c.id))
  return [...(backlinks.value.get(x.id) ?? [])].map(get).filter((m): m is Entry => !!m && !related.has(m.id) && !kids.has(m.id) && !hiddenFromPlayers(m))
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name, undefined, { numeric: true }))
})
</script>

<template>
  <div v-for="[label, list] in ['pc', 'spell', 'feat'].includes(e.type) ? [] : relGroups" :key="label" class="card">
    <h3>{{ label[0].toUpperCase() + label.slice(1) }}</h3>
    <ul class="rel rel-scroll">
      <li v-for="{ other, r } in list" :key="r.id" :class="{ ended: ended(r) }">
        <EntryLink :id="other" icon />
        <span v-if="r.role" class="role">{{ r.role }}</span>
        <span v-if="r.from || r.to" class="when">{{ dateRange(r.from, r.to) }}</span>
      </li>
    </ul>
  </div>

  <div v-if="usedIn.length" class="card">
    <h3>Used in</h3>
    <ul class="rel"><li v-for="c in usedIn" :key="c.id"><EntryLink :id="c.id" icon /></li></ul>
  </div>
  <ItemWhere v-if="e.type === 'item'" :item="e" />

  <div v-if="onMaps.length" class="card">
    <h3>On the map</h3>
    <ul class="rel"><li v-for="m in onMaps" :key="m.place.id + m.pin.id"><a :href="hrefMap(m.place.id, m.pin.id)"><AppIcon ui="map" /> {{ m.place.name }}</a></li></ul>
  </div>

  <div v-if="knownBy.length" class="card">
    <h3>Known by</h3>
    <ul class="plain"><li v-for="p in knownBy" :key="p.id"><EntryLink :id="p.id" icon /></li></ul>
  </div>
  <!-- an item's carriers and shops are in ItemWhere; a player character's notes take the place of this card -->
  <div v-if="e.type !== 'pc' && mentions.length" class="card">
    <h3>Mentioned in <span class="muted small">{{ mentions.length }}</span></h3>
    <ul class="rel mentions-list"><li v-for="m in mentions" :key="m.id"><EntryLink :id="m.id" icon /></li></ul>
  </div>
</template>
