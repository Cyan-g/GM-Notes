<script setup lang="ts">
// Bring in a spell, item or map someone exported: shows what the file holds and what's already here, then adds it.
import { ref } from 'vue'
import { SCHEMA } from '../model/schema'
import { applyImport, type ImportPlan } from '../transfer'
import { go, hrefEntry } from '../router'
import { state } from '../store'

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
    go(hrefEntry(id))
  } catch (e) { error.value = (e as Error).message }
  finally { busy.value = false }
}
const close = () => { plan.value = null }
</script>

<template>
  <div v-if="plan" class="qs-backdrop" @mousedown.self="close" @keydown.esc="close">
    <form class="qs transfer" @submit.prevent="run">
      <h3>Import {{ icon(plan.main.type) }} {{ plan.main.name }}</h3>
      <p class="muted small">From “{{ plan.from }}”<template v-if="when(plan.exported)">, exported {{ when(plan.exported) }}</template>.</p>
      <template v-if="plan.existing">
        <p>You already have {{ plan.main.type === 'place' ? 'a place' : 'one' }} called <b>{{ plan.existing.name }}</b>.</p>
        <label class="check"><input v-model="plan.replace" type="radio" :value="false" /> Keep yours</label>
        <label class="check"><input v-model="plan.replace" type="radio" :value="true" />
          {{ plan.main.type === 'place' ? 'Use the new map picture (your text and pins stay)' : 'Replace yours with this one' }}</label>
      </template>
      <template v-if="plan.parts.length && (!plan.existing || plan.replace)">
        <h4>Comes along</h4>
        <ul class="transfer-items">
          <li v-for="p in plan.parts" :key="p.entry.id">
            <span class="name">{{ icon(p.entry.type) }} {{ p.entry.name }}</span>
            <span class="muted small">{{ p.here ? 'you have it, yours is used' : 'new' }}</span>
          </li>
        </ul>
      </template>
      <p v-if="state.readOnly" class="error">This tab isn't saving, so nothing can be imported here.</p>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="actions">
        <button type="button" @click="close">Cancel</button>
        <button type="submit" class="primary" :disabled="busy || !!state.readOnly">{{ busy ? 'Importing…' : plan.existing && !plan.replace ? 'Open yours' : 'Import' }}</button>
      </div>
    </form>
  </div>
</template>
