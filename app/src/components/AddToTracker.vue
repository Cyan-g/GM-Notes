<script setup lang="ts">
// A creature's or NPC's button to add it to the initiative tracker as an enemy, with how many times it was added.
import { ref, watch } from 'vue'
import { addEntryToTracker } from '../tracker'

const props = defineProps<{ id: string }>()
const added = ref(0)
function toTracker() { addEntryToTracker(props.id); added.value++ }
watch(() => props.id, () => { added.value = 0 })
</script>

<template>
  <div class="copy-row">
    <button type="button" class="chip-btn" title="Add to the initiative tracker as an enemy" @click="toTracker">⚔ Add to tracker</button>
    <span v-if="added" class="muted small">Added{{ added > 1 ? ` (${added})` : '' }} · <a href="#/tracker">open the tracker</a></span>
  </div>
</template>
