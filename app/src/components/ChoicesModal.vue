<script setup lang="ts">
// The choices a character still has to make (an invocation, Expertise, a weapon mastery), in a small window on the
// sheet: the "N to pick" links open it, so the player stays on the sheet.
import { onBeforeUnmount, onMounted } from 'vue'
import type { CharacterSheet, Entry } from '../model/types'
import FeatureChoices from './FeatureChoices.vue'

defineProps<{ pc: Entry; s: CharacterSheet }>()
const emit = defineEmits<{ close: [] }>()
const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); emit('close') } }
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <div class="modal-back" @mousedown.self="emit('close')">
      <div class="modal choices-modal" role="dialog" aria-label="Choices to make">
        <header class="modal-head">
          <h2>Choices to make</h2>
          <span class="spacer" />
          <button class="x" title="Close (Esc)" @click="emit('close')">×</button>
        </header>
        <FeatureChoices :pc="pc" :s="s" />
        <footer class="lu-foot"><span class="spacer" /><button class="primary" @click="emit('close')">Done</button></footer>
      </div>
    </div>
  </Teleport>
</template>
