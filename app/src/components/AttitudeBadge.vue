<script setup lang="ts">
// How an NPC or organization stands with the party, as a coloured badge. Only the DM sees it.
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { optionLabel, playerMode } from '../store'

const props = defineProps<{ e: Entry }>()
const value = computed(() => ((props.e.type === 'npc' || props.e.type === 'organization') && !playerMode.value ? String(props.e.fields.attitude ?? '') : ''))
</script>

<template>
  <span v-if="value" class="badge" :class="'att-' + value.toLowerCase()">{{ optionLabel(`${e.type}.attitude`, value) }}</span>
</template>
