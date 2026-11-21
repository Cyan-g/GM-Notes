<script setup lang="ts">
// What a deity's text names but its relations don't have yet, each a click away from being a real link
// (then it shows in the relation cards, on both pages). Nothing is linked without that click.
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { playerMode, state } from '../store'
import { addRelation } from '../edit'
import { linkSuggestions, type LinkSuggestion } from '../deity'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ e: Entry }>()
const list = computed(() => (state.readOnly || playerMode.value ? [] : linkSuggestions(props.e)))
const link = (k: LinkSuggestion['kinds'][number]) => addRelation(k.a, k.b, k.kind)
</script>

<template>
  <div v-if="list.length" class="card deity-links">
    <h3>Named in the text</h3>
    <p class="muted small">Not linked yet. A click links them, and they show on both pages.</p>
    <div v-for="s in list" :key="s.id" class="deity-link-row">
      <EntryLink :id="s.id" icon /> <span class="muted small">{{ s.why }}</span>
      <span class="deity-link-btns"><button v-for="k in s.kinds" :key="k.kind + k.a" type="button" class="chip-btn" @click="link(k)">＋ {{ k.label }}</button></span>
    </div>
  </div>
</template>
