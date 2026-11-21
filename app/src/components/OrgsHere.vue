<script setup lang="ts">
// The organizations at a place: seated there, or present there.
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { orgsAt } from '../org'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ place: Entry }>()
const list = computed(() => orgsAt(props.place.id).sort((a, b) => a.name.localeCompare(b.name)))
</script>

<template>
  <div v-if="list.length" class="card">
    <h3>Organizations here</h3>
    <ul class="rel"><li v-for="o in list" :key="o.id"><EntryLink :id="o.id" icon /><span class="role">{{ o.fields.seat === place.id ? 'seat' : 'present' }}</span></li></ul>
  </div>
</template>
