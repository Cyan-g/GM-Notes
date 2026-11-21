<script setup lang="ts">
// An organization's aims (goals; the secret for the DM only) and what membership offers: what it teaches,
// and the feats it grants (feats whose source is this organization).
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { byType, playerMode } from '../store'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ e: Entry }>()
const goals = computed(() => String(props.e.fields.goals ?? '').trim())
const secret = computed(() => (playerMode.value ? '' : String(props.e.fields.secret ?? '').trim()))
const teaches = computed(() => (props.e.fields.teaches as string[] | undefined) ?? [])
const feats = computed(() => (byType.value.get('feat') ?? []).filter(f => f.fields.source === props.e.id).sort((a, b) => a.name.localeCompare(b.name)))
const offers = computed(() => [...teaches.value, ...feats.value.map(f => f.id).filter(id => !teaches.value.includes(id))])
</script>

<template>
  <div v-if="goals || secret" class="card npc-play">
    <h3>Aims</h3>
    <p v-if="goals" class="org-goals">{{ goals }}</p>
    <div v-if="secret" class="secret npc-secret-view"><span class="secret-tag">DM only</span> <b>Secret:</b> {{ secret }}</div>
  </div>
  <div v-if="offers.length" class="card">
    <h3>Membership offers</h3>
    <ul class="rel"><li v-for="id in offers" :key="id"><EntryLink :id="id" icon /></li></ul>
  </div>
</template>
