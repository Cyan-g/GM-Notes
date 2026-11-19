<script setup lang="ts">
// A player's own notes on a person or place shared by their DM: kept apart from the entry, so updates from the DM
// never touch them. Read here, written with ✎.
import { computed, ref } from 'vue'
import type { Entry } from '../model/types'
import { state } from '../store'
import { setPlayerNote } from '../sync'
import MarkdownView from './MarkdownView.vue'
import BodyEditor from './edit/BodyEditor.vue'

const props = defineProps<{ entry: Entry }>()
const writing = ref(false)
const text = computed(() => state.db?.playerNotes?.[props.entry.id] ?? '')
</script>

<template>
  <section class="player-notes">
    <h4>Your notes
      <button v-if="!state.readOnly" class="link-btn" @click="writing = !writing">{{ writing ? '✓ Done' : '✎ Write' }}</button>
    </h4>
    <BodyEditor v-if="writing" :model-value="text" :hint="entry.name" @update:model-value="v => setPlayerNote(entry.id, v)" />
    <MarkdownView v-else-if="text.trim()" :source="text" />
    <p v-else class="muted small">Only you see these, and updates from your DM leave them alone.</p>
  </section>
</template>
