<script setup lang="ts">
// Bring in entries someone exported: shows what the file holds and what already exists here, then adds it.
import { SCHEMA } from '../model/schema'
import { applyImport, type ImportPlan } from '../transfer'
import { go, hrefEntry } from '../router'
import { state } from '../store'
import { ref } from 'vue'
import EntryLink from './EntryLink.vue'

const plan = defineModel<ImportPlan | null>({ required: true })
const busy = ref(false), error = ref('')
const icon = (t: string) => SCHEMA.find(s => s.type === t)?.icon ?? ''
const when = (iso: string) => { const d = new Date(iso); return isNaN(+d) ? '' : d.toLocaleDateString() }

async function run() {
  if (!plan.value) return
  busy.value = true; error.value = ''
  try {
    const id = await applyImport(plan.value)
    plan.value = null
    if (id) go(hrefEntry(id))
  } catch (e) { error.value = (e as Error).message }
  finally { busy.value = false }
}
const close = () => { plan.value = null }
</script>

<template>
  <div v-if="plan" class="qs-backdrop" @mousedown.self="close" @keydown.esc="close">
    <form class="qs transfer" @submit.prevent="run">
      <h3>Import</h3>
      <p class="muted small">From “{{ plan.from }}”<template v-if="when(plan.exported)">, exported {{ when(plan.exported) }}</template>.</p>
      <ul class="transfer-items">
        <li v-for="it in plan.items" :key="it.entry.id" :class="{ part: !it.main }">
          <span class="name">{{ icon(it.entry.type) }} {{ it.entry.name }}<span v-if="!it.main" class="muted small"> needed</span></span>
          <template v-if="it.existing">
            <select v-model="it.action" :title="`You already have ${it.existing.name}`">
              <option value="keep">Already here: keep yours</option>
              <option value="replace">Replace yours with this one</option>
              <option value="copy">Add as a second one</option>
            </select>
          </template>
          <span v-else class="muted small">new</span>
        </li>
      </ul>
      <template v-if="plan.found.length">
        <h4>Links reconnected to your entries</h4>
        <p class="transfer-list"><span v-for="f in plan.found" :key="f.here.id"><EntryLink :id="f.here.id" icon /></span></p>
      </template>
      <template v-if="plan.missing.length">
        <h4>Links left out (not in your world)</h4>
        <p class="transfer-list muted"><span v-for="m in plan.missing" :key="m.type + m.name">{{ icon(m.type) }} {{ m.name }}</span></p>
      </template>
      <p v-if="state.readOnly" class="error">This tab isn't saving, so nothing can be imported here.</p>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="actions">
        <button type="button" @click="close">Cancel</button>
        <button type="submit" class="primary" :disabled="busy || !!state.readOnly || plan.items.every(i => i.existing && i.action === 'keep')">{{ busy ? 'Importing…' : 'Import' }}</button>
      </div>
    </form>
  </div>
</template>
