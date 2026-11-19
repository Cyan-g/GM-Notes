<script setup lang="ts">
// Save an entry and everything it points at (or the whole world) as a file someone else can import.
import TypeIcon from './TypeIcon.vue'
import { computed, reactive, ref } from 'vue'
import type { EntryType, Id } from '../model/types'
import { SCHEMA } from '../model/schema'
import { buildExport, download, planExport } from '../transfer'
import EntryLink from './EntryLink.vue'

const open = defineModel<boolean>({ required: true })
/** The entry to start at; none for the whole world. */
const props = defineProps<{ id?: Id }>()
const opts = reactive({ dmText: false, hidden: true, textLinks: false, skip: [] as EntryType[] })
const plan = computed(() => (open.value ? planExport(props.id ?? null, opts) : null))
const busy = ref(false), error = ref('')

/** The types in the export (with nothing left out), in the schema's order, the start's own type not offered. */
const types = computed(() => SCHEMA.filter(t => plan.value?.counts[t.type] && t.type !== plan.value.start?.type))
const byType = computed(() => SCHEMA.map(t => ({ t, list: (plan.value?.entries ?? []).filter(e => e.type === t.type && e.id !== props.id) })).filter(g => g.list.length))
const toggle = (t: EntryType) => { opts.skip = opts.skip.includes(t) ? opts.skip.filter(x => x !== t) : [...opts.skip, t] }

async function save() {
  if (!plan.value) return
  busy.value = true; error.value = ''
  try {
    const { blob, name } = await buildExport(plan.value)
    download(blob, name)
    open.value = false
  } catch (e) { error.value = (e as Error).message }
  finally { busy.value = false }
}
</script>

<template>
  <div v-if="open && plan" class="qs-backdrop" @mousedown.self="open = false" @keydown.esc="open = false">
    <form class="qs transfer" @submit.prevent="save">
      <h3>{{ plan.start ? `Export ${plan.start.name}` : 'Export the world' }}</h3>
      <p class="muted small">
        <template v-if="plan.start">Saves it with everything it points at, and what those point at.</template>
        <template v-else>Saves every entry with their connections, the dropdown lists, the calendar and today's date.</template>
        Campaigns, sessions, encounters and creatures stay here. Importing the file again later updates what's already there.
      </p>
      <label class="check"><input v-model="opts.dmText" type="checkbox" /> Include the DM-only parts of the text</label>
      <label class="check"><input v-model="opts.hidden" type="checkbox" /> Include entries hidden from the players <span class="muted small">({{ plan.hiddenCount }})</span></label>
      <label v-if="plan.start" class="check"><input v-model="opts.textLinks" type="checkbox" /> Also what its text links to</label>
      <template v-if="types.length">
        <h4>Take along</h4>
        <div class="chips">
          <button v-for="t in types" :key="t.type" type="button" class="chip-btn" :class="{ on: !opts.skip.includes(t.type) }" @click="toggle(t.type)">
            <TypeIcon :type="t.type" /> {{ t.plural }} <span class="muted">{{ plan.counts[t.type] }}</span>
          </button>
        </div>
      </template>
      <h4>In the file</h4>
      <p class="muted small">
        {{ plan.entries.length }} {{ plan.entries.length === 1 ? 'entry' : 'entries' }}<template v-if="plan.relations.length">, {{ plan.relations.length }} connection(s)</template>
      </p>
      <details v-for="g in byType" :key="g.t.type" class="small">
        <summary><TypeIcon :type="g.t.type" /> {{ g.list.length }} {{ g.list.length === 1 ? g.t.label : g.t.plural }}</summary>
        <p class="transfer-list"><span v-for="e in g.list.slice(0, 200)" :key="e.id"><EntryLink :id="e.id" /></span><span v-if="g.list.length > 200" class="muted">… and {{ g.list.length - 200 }} more</span></p>
      </details>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="actions">
        <button type="button" @click="open = false">Cancel</button>
        <button type="submit" class="primary" :disabled="busy">{{ busy ? 'Saving…' : '⇩ Save file' }}</button>
      </div>
    </form>
  </div>
</template>
