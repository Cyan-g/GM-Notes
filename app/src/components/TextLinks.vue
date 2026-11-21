<script setup lang="ts">
// What an entry's text names but its relations (or, for an organization, its places) don't have yet, each a click
// away from being a real link that shows on both pages. Nothing is linked without that click (deity.ts).
import { computed } from 'vue'
import type { Entry, Id } from '../model/types'
import { playerMode, state } from '../store'
import { addRelation, changed } from '../edit'
import { linkSuggestions, type LinkAction } from '../deity'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ e: Entry }>()
const list = computed(() => (state.readOnly || playerMode.value ? [] : linkSuggestions(props.e)))
function act(k: LinkAction) {
  if (k.rel) addRelation(k.rel.a, k.rel.b, k.rel.kind)
  else if (k.presence) {
    const p = (props.e.fields.presence as Id[] | undefined) ?? []
    props.e.fields.presence = [...p, k.presence]
    changed(props.e)
  }
}
</script>

<template>
  <div v-if="list.length" class="card deity-links">
    <h3>Named in the text</h3>
    <p class="muted small">Not linked yet. A click links them, and they show on both pages.</p>
    <div v-for="s in list" :key="s.id" class="deity-link-row">
      <EntryLink :id="s.id" icon /> <span class="muted small">{{ s.why }}</span>
      <span class="deity-link-btns"><button v-for="k in s.kinds" :key="k.label" type="button" class="chip-btn" @click="act(k)">＋ {{ k.label }}</button></span>
    </div>
  </div>
</template>
