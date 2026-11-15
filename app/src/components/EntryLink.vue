<script setup lang="ts">
import { computed } from 'vue'
import { get } from '../store'
import { hrefEntry } from '../router'
import { TYPES } from '../model/schema'

const props = defineProps<{ id: string | undefined | null; label?: string; icon?: boolean }>()
const e = computed(() => get(props.id))
</script>

<template>
  <a v-if="e" class="wl" :href="hrefEntry(e.id)" :title="TYPES[e.type]?.label"><span v-if="icon" class="icon">{{ TYPES[e.type]?.icon }}</span>{{ label || e.name }}</a>
  <span v-else-if="id" class="wl missing">{{ label || id }}</span>
</template>
