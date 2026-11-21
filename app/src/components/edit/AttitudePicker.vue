<script setup lang="ts">
// How an NPC or organization stands with the party: Friendly, Indifferent or Hostile (the options of the type's
// Attitude list). Clicking the one picked clears it.
import { computed } from 'vue'
import { TYPES } from '../../model/schema'
import { fieldOptions } from '../../store'

const props = defineProps<{ type: 'npc' | 'organization' }>()
const model = defineModel<string>()
const options = computed(() => fieldOptions(TYPES[props.type].fields.find(x => x.key === 'attitude')))
</script>

<template>
  <div class="seg">
    <button v-for="o in options" :key="o.id" type="button" :class="['att-' + o.id.toLowerCase(), { on: model === o.id }]" @click="model = model === o.id ? undefined : o.id">{{ o.label }}</button>
  </div>
</template>
