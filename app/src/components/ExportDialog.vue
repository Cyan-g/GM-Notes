<script setup lang="ts">
// Save a spell, item or map (and what it needs) as a file someone else can import.
import { computed, ref } from 'vue'
import type { Id } from '../model/types'
import { buildExport, download, planExport } from '../transfer'
import EntryLink from './EntryLink.vue'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ id: Id }>()
const plan = computed(() => (open.value ? planExport(props.id) : null))
const secrets = ref(false)
const busy = ref(false), error = ref('')

async function save() {
  if (!plan.value) return
  busy.value = true; error.value = ''
  try {
    const { blob, name } = await buildExport(plan.value, { secrets: secrets.value })
    download(blob, name)
    open.value = false
  } catch (e) { error.value = (e as Error).message }
  finally { busy.value = false }
}
</script>

<template>
  <div v-if="open && plan" class="qs-backdrop" @mousedown.self="open = false" @keydown.esc="open = false">
    <form class="qs transfer" @submit.prevent="save">
      <h3>Export {{ plan.main.name }}</h3>
      <p v-if="plan.main.type === 'place'" class="muted small">Saves the map picture under this name, without the text, pins or where it lies.</p>
      <p v-else class="muted small">Saves a file that someone with this app can import with ＋ → Import from a file.</p>
      <template v-if="plan.parts.length">
        <h4>Comes along, because it's needed</h4>
        <p class="transfer-list"><span v-for="e in plan.parts" :key="e.id"><EntryLink :id="e.id" icon /></span></p>
      </template>
      <label v-if="plan.hasSecrets" class="check"><input v-model="secrets" type="checkbox" /> Include the DM-only parts of the text</label>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="actions">
        <button type="button" @click="open = false">Cancel</button>
        <button type="submit" class="primary" :disabled="busy">{{ busy ? 'Saving…' : '⇩ Save file' }}</button>
      </div>
    </form>
  </div>
</template>
