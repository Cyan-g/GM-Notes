<script setup lang="ts">
// An entry's earlier versions (kept by the database at most every 10 minutes of editing, the last 40):
// see what it said, and go back to one. Going back is itself a change, so it can be undone the same way.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { Entry } from '../model/types'
import type { Version } from '../storage/backend'
import { db, keepVersion, save, state, touch } from '../store'
import { describe, excerpt } from '../describe'

const props = defineProps<{ entry: Entry }>()
const emit = defineEmits<{ close: [] }>()
const versions = ref<Version[] | null>(null)
const picked = ref(0)
const error = ref('')
const shown = computed(() => versions.value?.[picked.value])

onMounted(async () => {
  try {
    await save()
    versions.value = await state.backend!.history(props.entry.id)
  } catch (e) { error.value = (e as Error).message }
})

/** What differs from the entry as it is now, in words. */
function diff(v: Entry): string[] {
  const now = props.entry, out: string[] = []
  if (v.name !== now.name) out.push(`name was “${v.name}”`)
  if (v.body !== now.body) out.push('text was different')
  const keys = new Set([...Object.keys(v.fields), ...Object.keys(now.fields)])
  const changed = [...keys].filter(k => JSON.stringify((v.fields as Record<string, unknown>)[k]) !== JSON.stringify((now.fields as Record<string, unknown>)[k]))
  if (changed.length) out.push(`${changed.length} field${changed.length === 1 ? '' : 's'} differed (${changed.slice(0, 4).join(', ')}${changed.length > 4 ? ', …' : ''})`)
  if (JSON.stringify(v.aliases) !== JSON.stringify(now.aliases) || JSON.stringify(v.tags) !== JSON.stringify(now.tags)) out.push('aliases or tags differed')
  if (v.image !== now.image) out.push('picture differed')
  return out.length ? out : ['same as now']
}

function restore() {
  const v = shown.value
  if (!v || state.readOnly) return
  if (!confirm(`Go back to the version of ${new Date(v.saved).toLocaleString()}?\n\nThe current version is kept in the history, so this can be undone.`)) return
  keepVersion.add(props.entry.id)
  db().entries[props.entry.id] = { ...JSON.parse(JSON.stringify(v.entry)), id: props.entry.id, updated: new Date().toISOString() }
  touch()
  emit('close')
}

const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); emit('close') } }
onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="modal-back" @mousedown.self="emit('close')">
    <div class="modal history-modal" role="dialog" :aria-label="`Earlier versions of ${entry.name}`">
      <header class="modal-head">
        <h2>🕘 {{ entry.name }}: earlier versions</h2>
        <span class="spacer" />
        <button class="x" title="Close (Esc)" @click="emit('close')">×</button>
      </header>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-else-if="!versions" class="muted">Loading…</p>
      <p v-else-if="!versions.length" class="muted">No earlier versions yet. One is kept each time the entry is changed, at most every 10 minutes.</p>
      <div v-else class="history-grid">
        <ol class="history-list">
          <li v-for="(v, i) in versions" :key="v.saved + i" :class="{ on: i === picked }">
            <button class="link-btn" @click="picked = i">{{ new Date(v.saved).toLocaleString() }}</button>
          </li>
        </ol>
        <div v-if="shown" class="history-show">
          <p class="small muted">Saved over on {{ new Date(shown.saved).toLocaleString() }}: {{ diff(shown.entry).join('; ') }}.</p>
          <h3>{{ shown.entry.name }} <span class="muted small">{{ describe(shown.entry) }}</span></h3>
          <p class="history-text">{{ excerpt(shown.entry, 900) || '(no text)' }}</p>
          <button class="primary" :disabled="!!state.readOnly" @click="restore">Go back to this version</button>
        </div>
      </div>
    </div>
  </div>
</template>
