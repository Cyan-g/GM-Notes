<script setup lang="ts">
// The note after a rest or a removed spell (undoNote.ts): what happened, Undo, and ×.
import { closeNote, undoNote } from '../undoNote'

function undo() { undoNote.undo?.(); closeNote() }
</script>

<template>
  <div v-if="undoNote.text" :key="undoNote.n" class="undo-note" role="status">
    <span class="small">{{ undoNote.text }}</span>
    <button v-if="undoNote.undo" type="button" class="chip-btn" @click="undo">Undo</button>
    <button type="button" class="x" title="Close" aria-label="Close" @click="closeNote">×</button>
  </div>
</template>
