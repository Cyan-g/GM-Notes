<script setup lang="ts">
import EntryIcon from './EntryIcon.vue'
import { computed } from 'vue'
import { get, hiddenFromPlayers } from '../store'
import { hrefEntry } from '../router'
import { TYPES } from '../model/schema'

const props = defineProps<{ id: string | undefined | null; label?: string; icon?: boolean }>()
const raw = computed(() => get(props.id))
/** Not linked in player mode when players don't know it: just its name. */
const e = computed(() => (hiddenFromPlayers(raw.value) ? undefined : raw.value))
</script>

<template>
  <a v-if="e" class="wl" :href="hrefEntry(e.id)" :title="TYPES[e.type]?.label"><span v-if="icon" class="icon"><EntryIcon :e="e" /></span>{{ label || e.name }}</a>
  <span v-else-if="raw" class="wl unknown" title="Not known to players">{{ label || raw.name }}</span>
  <span v-else-if="id" class="wl missing">{{ label || id }}</span>
</template>
