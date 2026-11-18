<script setup lang="ts">
// An item's card in a pop-up, so the character sheet stays where it is. Esc or a click outside closes it.
import { computed, onMounted, onUnmounted } from 'vue'
import type { Id } from '../model/types'
import { get } from '../store'
import { hrefEntry } from '../router'
import ItemCard from './ItemCard.vue'
import SpellCard from './SpellCard.vue'
import MarkdownView from './MarkdownView.vue'

const props = defineProps<{ id: Id }>()
const emit = defineEmits<{ close: [] }>()
const e = computed(() => get(props.id))
/** A scroll is its spell. */
const spell = computed(() => (e.value?.fields.kind === 'Scroll' ? get(e.value.fields.spell) : undefined))

const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); emit('close') } }
onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="modal-back" @mousedown.self="emit('close')">
    <div v-if="e" class="modal spell-modal item-modal" role="dialog" :aria-label="e.name">
      <header class="modal-head">
        <h2>🗡️ {{ e.name }}</h2>
        <span class="spacer" />
        <slot name="actions" />
        <a class="button" :href="hrefEntry(e.id)" @click="emit('close')">Open page</a>
        <button class="x" title="Close (Esc)" @click="emit('close')">×</button>
      </header>
      <ItemCard :e="e" />
      <SpellCard v-if="spell" :e="spell" />
      <MarkdownView v-if="e.body" :source="e.body" class="item-modal-text" />
    </div>
  </div>
</template>
