<script setup lang="ts">
// An entry's icon (game-icons.net, drawn in the text colour): a character's class icon, else its type's icon.
import TypeIcon from './TypeIcon.vue'
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { classIcon } from '../model/classes'

const props = defineProps<{ e: Entry }>()
const svg = computed(() => classIcon(props.e))
</script>

<template>
  <svg v-if="svg" class="gi" viewBox="0 0 512 512" fill="currentColor" role="img" :aria-label="svg.label" v-html="svg.body" />
  <TypeIcon v-else :type="e.type" />
</template>
