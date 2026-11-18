<script setup lang="ts">
// Create an entry: pick a type, give it a name, then it opens in edit mode.
import { nextTick, ref, watch } from 'vue'
import type { EntryType } from '../model/types'
import { SCHEMA } from '../model/schema'
import { createEntry } from '../edit'
import { go, hrefEntry } from '../router'
import { pickImport } from '../ui'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ type?: EntryType; fields?: Record<string, unknown> }>()
const type = ref<EntryType>('npc')
const name = ref('')
const input = ref<HTMLInputElement>()
watch(open, async v => {
  if (!v) return
  name.value = ''
  if (props.type) type.value = props.type
  await nextTick()
  input.value?.focus()
})
function create() {
  if (!name.value.trim()) return
  const e = createEntry(type.value, name.value, JSON.parse(JSON.stringify(props.fields ?? {})))
  open.value = false
  go(hrefEntry(e.id, true))
}
</script>

<template>
  <div v-if="open" class="qs-backdrop" @mousedown.self="open = false" @keydown.esc="open = false">
    <form class="qs new-entry" @submit.prevent="create">
      <h3>New entry</h3>
      <label><span>Type</span>
        <select v-model="type">
          <option v-for="t in SCHEMA" :key="t.type" :value="t.type">{{ t.icon }} {{ t.label }}</option>
        </select>
      </label>
      <label><span>Name</span><input ref="input" v-model="name" placeholder="Name" /></label>
      <div class="actions">
        <button type="button" class="link-btn import-btn" title="Add a spell, item or map that someone exported" @click="open = false; pickImport()">⇪ Import from a file…</button>
        <button type="button" @click="open = false">Cancel</button>
        <button type="submit" class="primary" :disabled="!name.trim()">Create</button>
      </div>
    </form>
  </div>
</template>
