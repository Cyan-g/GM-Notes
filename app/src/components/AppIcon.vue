<script setup lang="ts">
// An icon for a page or table: one of the app icons (game-icons.net), an entry type's icon, or plain text (emoji).
import { computed } from 'vue'
import type { EntryType } from '../model/types'
import { UI_SVG, type UiIcon } from '../icons/ui'
import TypeIcon from './TypeIcon.vue'

const props = defineProps<{ ui?: UiIcon; type?: EntryType; text?: string }>()
const svg = computed(() => (props.ui ? UI_SVG[props.ui] : undefined))
</script>

<template>
  <svg v-if="svg" class="gi" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true" v-html="svg.body" />
  <TypeIcon v-else-if="type" :type="type" />
  <template v-else-if="text">{{ text }}</template>
</template>
