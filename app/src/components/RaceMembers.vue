<script setup lang="ts">
// A race's characters on its page: everyone of the race or of one of its subraces, with their subrace.
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { raceMembers, subraceNameIn } from '../species'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ race: Entry }>()
const members = computed(() => raceMembers(props.race))
const subraceName = (n: Entry) => subraceNameIn(props.race, n)
const hasSubraceMembers = computed(() => members.value.some(n => subraceName(n)))
</script>

<template>
  <section v-if="members.length">
    <h2>{{ race.name }} characters</h2>
    <table class="mini">
      <thead><tr><th>Name</th><th v-if="hasSubraceMembers">Subrace</th></tr></thead>
      <tbody><tr v-for="n in members" :key="n.id"><td><EntryLink :id="n.id" icon /></td><td v-if="hasSubraceMembers"><EntryLink v-if="subraceName(n)" :id="n.fields.race" /></td></tr></tbody>
    </table>
  </section>
</template>
