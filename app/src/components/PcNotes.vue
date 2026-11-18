<script setup lang="ts">
// A character's notes (the entry's text) under the sheet: read in play, and written right here with ✎, since the
// character's Edit page is for building the sheet.
import { ref } from 'vue'
import type { Entry } from '../model/types'
import { state } from '../store'
import { changed } from '../edit'
import MarkdownView from './MarkdownView.vue'
import BodyEditor from './edit/BodyEditor.vue'

const props = defineProps<{ pc: Entry }>()
const writing = ref(false)
function setBody(v: string) {
  if (state.readOnly) return
  props.pc.body = v
  changed(props.pc)
}
</script>

<template>
  <section class="pc-notes">
    <h4>Notes
      <button v-if="!state.readOnly" class="link-btn" :title="writing ? 'Show the notes' : 'Write in the notes'" @click="writing = !writing">{{ writing ? '✓ Done' : '✎ Write' }}</button>
    </h4>
    <BodyEditor v-if="writing" :model-value="pc.body" :hint="pc.name" @update:model-value="setBody" />
    <MarkdownView v-else-if="pc.body.trim()" :source="pc.body" />
    <p v-else class="muted small">Quests, background, anything to remember.</p>
  </section>
</template>
