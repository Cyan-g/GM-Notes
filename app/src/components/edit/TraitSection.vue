<script setup lang="ts">
// One part of a feature on its Edit page (effects, proficiencies, spells, the player's choice, uses…): a title, what's
// set in a few words, and × to take the part off the feature. Every part looks the same (TraitsInput, TraitOptionFields).
defineProps<{ title: string; /** What's set, in a few words. */ summary?: string }>()
const emit = defineEmits<{ remove: [] }>()
</script>

<template>
  <section class="fsec">
    <header class="fsec-head">
      <b>{{ title }}</b>
      <span v-if="summary" class="fsec-sum">{{ summary }}</span>
      <button type="button" class="link-btn fsec-x" :title="`Take ${title.toLowerCase()} off this feature`" :aria-label="`Remove ${title.toLowerCase()}`" @click="emit('remove')">×</button>
    </header>
    <div class="fsec-body"><slot /></div>
  </section>
</template>
