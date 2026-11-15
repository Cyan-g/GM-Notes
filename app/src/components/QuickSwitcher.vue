<script setup lang="ts">
// Ctrl+K: jump to any entry by name or alias.
import { computed, nextTick, ref, watch } from 'vue'
import { search } from '../search'
import { TYPES } from '../model/schema'
import { go, hrefEntry } from '../router'
import { describe } from '../describe'

const open = defineModel<boolean>({ required: true })
const q = ref('')
const sel = ref(0)
const input = ref<HTMLInputElement>()
const results = computed(() => search(q.value, 12))
watch(results, () => { sel.value = 0 })
watch(open, async v => { if (v) { q.value = ''; await nextTick(); input.value?.focus() } })

function pick(i = sel.value) {
  const e = results.value[i]
  if (!e) return
  go(hrefEntry(e.id))
  open.value = false
}
function key(ev: KeyboardEvent) {
  if (ev.key === 'ArrowDown') { sel.value = Math.min(sel.value + 1, results.value.length - 1); ev.preventDefault() }
  else if (ev.key === 'ArrowUp') { sel.value = Math.max(sel.value - 1, 0); ev.preventDefault() }
  else if (ev.key === 'Enter') pick()
  else if (ev.key === 'Escape') open.value = false
}
</script>

<template>
  <div v-if="open" class="qs-backdrop" @mousedown.self="open = false">
    <div class="qs" role="dialog" aria-label="Go to entry">
      <input ref="input" v-model="q" placeholder="Go to… (name or alias)" @keydown="key" />
      <ul v-if="results.length">
        <li v-for="(e, i) in results" :key="e.id" :class="{ sel: i === sel }" @mousemove="sel = i" @click="pick(i)">
          <span class="icon">{{ TYPES[e.type].icon }}</span>
          <span class="qs-name">{{ e.name }}</span>
          <span class="qs-alias">{{ describe(e) || e.aliases.slice(0, 2).join(', ') }}</span>
          <span class="qs-type">{{ TYPES[e.type].label }}</span>
        </li>
      </ul>
      <p v-else-if="q" class="muted pad">No match.</p>
      <p v-else class="muted pad">Type to search. ↑↓ to choose, Enter to open.</p>
    </div>
  </div>
</template>
