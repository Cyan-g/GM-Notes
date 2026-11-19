<script setup lang="ts">
// An entry's icon: a character's class icon (game-icons.net, drawn in the text colour), else its type's emoji.
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { classIcon, entryIcon } from '../model/classes'

const props = defineProps<{ e: Entry }>()
const svg = computed(() => classIcon(props.e))
</script>

<template>
  <svg v-if="svg" class="gi" viewBox="0 0 512 512" fill="currentColor" role="img" :aria-label="svg.label" v-html="svg.body" />
  <template v-else>{{ entryIcon(e) }}</template>
</template>
