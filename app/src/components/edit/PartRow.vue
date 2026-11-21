<script setup lang="ts">
// One part of a form added on demand (see useParts): its label, the input (the default slot) and a × that removes
// it. A DM-only part (a secret) gets the badge and the secret's look; a fixed one keeps the layout without the ×.
// Given `labelFor`, the label and the input are two cells of the form grid around it, as its other rows are.
import DmOnlyBadge from '../DmOnlyBadge.vue'

defineProps<{ label: string; dmOnly?: boolean; labelTitle?: string; labelFor?: string; fixed?: boolean }>()
const emit = defineEmits<{ remove: [] }>()
</script>

<template>
  <template v-if="labelFor">
    <label :for="labelFor">{{ label }}</label>
    <div class="npc-look"><slot />
      <button type="button" class="x" :title="`Remove ${label.toLowerCase()}`" @click="emit('remove')">×</button></div>
  </template>
  <div v-else class="npc-part" :class="{ 'npc-secret': dmOnly }">
    <span class="sf-label" :title="labelTitle">{{ label }}<DmOnlyBadge v-if="dmOnly" /></span>
    <slot />
    <span v-if="fixed" />
    <button v-else type="button" class="x" :title="`Remove ${label.toLowerCase()}`" @click="emit('remove')">×</button>
  </div>
</template>
