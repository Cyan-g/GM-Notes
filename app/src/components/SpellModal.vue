<script setup lang="ts">
// A spell's card in a pop-up, so the spellbook stays where it is. Esc or a click outside closes it.
import TypeIcon from './TypeIcon.vue'
import { computed, onMounted, onUnmounted } from 'vue'
import type { Id } from '../model/types'
import { get, playerMode } from '../store'
import { hrefEntry } from '../router'
import SpellCard from './SpellCard.vue'

const props = defineProps<{ id: Id }>()
const emit = defineEmits<{ close: [] }>()
const e = computed(() => get(props.id))

const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); emit('close') } }
onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="modal-back" @mousedown.self="emit('close')">
    <div v-if="e" class="modal spell-modal" role="dialog" :aria-label="e.name">
      <header class="modal-head">
        <h2><TypeIcon type="spell" /> {{ e.name }}</h2>
        <span class="spacer" />
        <slot name="actions" />
        <a class="button" :href="hrefEntry(e.id)" @click="emit('close')">Open page</a>
        <a v-if="!playerMode" class="button" :href="hrefEntry(e.id, true)" title="Edit" @click="emit('close')">✎</a>
        <button class="x" title="Close (Esc)" @click="emit('close')">×</button>
      </header>
      <SpellCard :e="e" />
    </div>
  </div>
</template>
