<script setup lang="ts">
// Where each campaign's party is (set on a place's page), with the people and shops there a click away.
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { byType, get, relationsWith } from '../store'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ campaign?: Entry }>()
const list = computed(() => (props.campaign ? [props.campaign] : (byType.value.get('campaign') ?? []).filter(c => c.fields.status !== 'Finished'))
  .map(c => ({ c, place: get(c.fields.partyAt as string | undefined) }))
  .filter((x): x is { c: Entry; place: Entry } => !!x.place))
const residents = (p: Entry) => relationsWith(p.id, 'lives-in', 'in', { current: true }).length
const shops = (p: Entry) => (byType.value.get('place') ?? []).filter(s => s.fields.parent === p.id && ['Shop', 'Tavern'].includes(String(s.fields.placeType ?? '')))
</script>

<template>
  <p v-for="x in list" :key="x.c.id" class="party-at small">
    ⚑ <template v-if="!campaign"><EntryLink :id="x.c.id" />: </template>the party is at <EntryLink :id="x.place.id" icon />
    <span v-if="residents(x.place)" class="muted"> · {{ residents(x.place) }} living there</span>
    <template v-if="shops(x.place).length"><span class="muted"> · shops:</span> <template v-for="(s, i) in shops(x.place)" :key="s.id"><template v-if="i">, </template><EntryLink :id="s.id" /></template></template>
  </p>
</template>
