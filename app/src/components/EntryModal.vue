<script setup lang="ts">
// Any entry in a pop-up, so the page behind it stays where it is (the character creator: a link opens this, never the
// entry's page). A spell, item or feat as its card; a class, species, background and the rest as the creator shows
// them (WizardPage). Esc or a click outside closes it.
import TypeIcon from './TypeIcon.vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Id } from '../model/types'
import { get } from '../store'
import SpellCard from './SpellCard.vue'
import ItemCard from './ItemCard.vue'
import FeatCard from './FeatCard.vue'
import WizardPage from './WizardPage.vue'
import MarkdownView from './MarkdownView.vue'

const props = defineProps<{ id: Id }>()
const emit = defineEmits<{ close: [] }>()
/** What it shows: the entry asked for, or one a link in it led to (it stays a pop-up). */
const shown = ref(props.id)
watch(() => props.id, id => { shown.value = id })
const e = computed(() => get(shown.value))
function inner(ev: MouseEvent) {
  if (ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey) return
  const a = (ev.target as HTMLElement).closest?.('a[href^="#/e/"]') as HTMLAnchorElement | null
  const id = a ? decodeURIComponent(a.getAttribute('href')!.split('/')[2] ?? '') : ''
  if (id && get(id)) { ev.preventDefault(); shown.value = id }
}
const PAGE = ['class', 'subclass', 'race', 'background']

const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); emit('close') } }
onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <div class="modal-back" @mousedown.self="emit('close')">
      <div v-if="e" class="modal entry-modal" role="dialog" :aria-label="e.name" @click="inner">
        <header class="modal-head">
          <h2><TypeIcon :type="e.type" /> {{ e.name }}</h2>
          <span class="spacer" />
          <button class="x" title="Close (Esc)" @click="emit('close')">×</button>
        </header>
        <SpellCard v-if="e.type === 'spell'" :e="e" />
        <ItemCard v-else-if="e.type === 'item'" :e="e" />
        <FeatCard v-else-if="e.type === 'feat'" :e="e" />
        <WizardPage v-else-if="PAGE.includes(e.type)" :e="e" bare />
        <template v-else>
          <p v-if="e.fields.summary" class="small">{{ e.fields.summary }}</p>
          <MarkdownView :source="e.body" />
        </template>
      </div>
    </div>
  </Teleport>
</template>
