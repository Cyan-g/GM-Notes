<script setup lang="ts">
// "The party is here", per campaign: on a place's page, which campaigns' party is here, and a quick way to move a
// campaign's party here. The home page and the atlas show where each party is (PartyAt).
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { byType, playerMode, state } from '../store'
import { changed } from '../edit'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ place: Entry }>()
/** Campaigns still being played (not finished), the one with sessions most recently first. */
const campaigns = computed(() => (byType.value.get('campaign') ?? []).filter(c => c.fields.status !== 'Finished').sort((a, b) => a.name.localeCompare(b.name)))
const here = computed(() => campaigns.value.filter(c => c.fields.partyAt === props.place.id))
const elsewhere = computed(() => campaigns.value.filter(c => c.fields.partyAt !== props.place.id))
const canEdit = computed(() => !state.readOnly && !playerMode.value)
function move(c: Entry, toHere: boolean) {
  if (toHere) c.fields.partyAt = props.place.id
  else delete c.fields.partyAt
  changed(c)
}
const pick = (ev: Event) => { const id = (ev.target as HTMLSelectElement).value; const c = campaigns.value.find(x => x.id === id); if (c) move(c, true); (ev.target as HTMLSelectElement).value = '' }
</script>

<template>
  <div v-if="here.length || (canEdit && campaigns.length)" class="card party-here" :class="{ on: here.length }">
    <h3>⚑ {{ here.length ? 'The party is here' : 'The party' }}</h3>
    <div v-for="c in here" :key="c.id" class="renown-row"><EntryLink :id="c.id" icon /><button v-if="canEdit" type="button" class="link-btn small" title="They've moved on" @click="move(c, false)">left</button></div>
    <template v-if="canEdit && elsewhere.length">
      <button v-if="campaigns.length === 1" type="button" class="chip-btn" @click="move(campaigns[0], true)">⚑ The party is here now</button>
      <select v-else class="small" @change="pick"><option value="">⚑ A party is here now…</option><option v-for="c in elsewhere" :key="c.id" :value="c.id">{{ c.name }}</option></select>
    </template>
  </div>
</template>
