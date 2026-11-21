<script setup lang="ts">
// An NPC's or organization's secret on its page, marked for the DM only. Nothing shows without one, or in a
// player's own world.
import { computed } from 'vue'
import { secretText } from '../npc'

const props = defineProps<{ text: unknown }>()
const secret = computed(() => secretText(props.text))
</script>

<template>
  <div v-if="secret" class="secret npc-secret-view"><span class="secret-tag">DM only</span> <b>Secret:</b> {{ secret }}</div>
</template>
