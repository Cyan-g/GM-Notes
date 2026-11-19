<script setup lang="ts">
// An entry type's icon (game-icons.net), drawn in the text colour.
import { computed } from 'vue'
import type { EntryType } from '../model/types'
import { TYPES } from '../model/schema'
import { TYPE_SVG } from '../icons/types'

const props = defineProps<{ type: EntryType }>()
const svg = computed(() => TYPE_SVG[props.type])
</script>

<template>
  <svg v-if="svg" class="gi" viewBox="0 0 512 512" fill="currentColor" role="img" :aria-label="TYPES[type]?.label" v-html="svg.body" />
  <template v-else>{{ TYPES[type]?.icon }}</template>
</template>
