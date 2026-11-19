<script setup lang="ts">
// A condition's game-icons.net picture (icons/conditions.ts) in the text colour; nothing for an unknown condition.
import { computed } from 'vue'
import { CONDITION_SVG, conditionKey } from '../icons/conditions'

const props = defineProps<{ name: string }>()
const svg = computed(() => CONDITION_SVG[conditionKey(props.name) ?? ''])
</script>

<template>
  <svg v-if="svg" class="gi cond-gi" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true" v-html="svg.body" />
</template>
