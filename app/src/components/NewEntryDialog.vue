<script setup lang="ts">
// Create an entry: pick a type, give it a name, then it opens in edit mode.
import TypeIcon from './TypeIcon.vue'
import { nextTick, ref, watch } from 'vue'
import type { EntryType } from '../model/types'
import { SCHEMA } from '../model/schema'
import { createEntry } from '../edit'
import { get, playerMode } from '../store'
import { carryOver } from '../checklist'
import { sessionNo, sessionsOf } from '../sessions'
import { computed } from 'vue'
import { go, hrefEntry } from '../router'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ type?: EntryType; fields?: Record<string, unknown> }>()
/** Player mode creates only what it shows: characters, campaigns and session notes, places and events, spells and items. */
const types = computed(() => (playerMode.value ? SCHEMA.filter(t => ['pc', 'campaign', 'session', 'note', 'place', 'event', 'spell', 'item'].includes(t.type)) : SCHEMA))
const type = ref<EntryType>('npc')
const name = ref('')
const input = ref<HTMLInputElement>()
watch(open, async v => {
  if (!v) return
  name.value = ''
  if (props.type) type.value = props.type
  if (!types.value.some(t => t.type === type.value)) type.value = types.value[0].type
  await nextTick()
  input.value?.focus()
})
function create() {
  if (!name.value.trim()) return
  const fields = JSON.parse(JSON.stringify(props.fields ?? {}))
  const e = createEntry(type.value, name.value, fields)
  // a campaign's next session starts with the last one's headings and open checklist items
  if (e.type === 'session' && fields.campaign) {
    const before = sessionsOf(fields.campaign).filter(s => s.id !== e.id && (fields.number == null || sessionNo(s) < fields.number)).at(-1)
    if (before?.body.trim()) get(e.id)!.body = carryOver(before.body)
  }
  open.value = false
  go(hrefEntry(e.id, true))
}
</script>

<template>
  <div v-if="open" class="qs-backdrop" @mousedown.self="open = false" @keydown.esc="open = false">
    <form class="qs new-entry" @submit.prevent="create">
      <h3>New entry</h3>
      <label><span>Type</span>
        <span class="new-type"><TypeIcon v-if="type" :type="type" />
        <select v-model="type">
          <option v-for="t in types" :key="t.type" :value="t.type">{{ t.label }}</option>
        </select></span>
      </label>
      <label><span>Name</span><input ref="input" v-model="name" placeholder="Name" /></label>
      <div class="actions">
        <button type="button" @click="open = false">Cancel</button>
        <button type="submit" class="primary" :disabled="!name.trim()">Create</button>
      </div>
    </form>
  </div>
</template>
