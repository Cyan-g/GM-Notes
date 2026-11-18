<script setup lang="ts">
// Bring in an exported entry or world: shows what's new, what it updates and what's already the same, then imports.
import { computed, ref } from 'vue'
import { SCHEMA } from '../model/schema'
import { applyImport, importChanges, type ImportItem, type ImportPlan } from '../transfer'
import { go, hrefEntry } from '../router'
import { state } from '../store'

const plan = defineModel<ImportPlan | null>({ required: true })
const busy = ref(false), error = ref('')
const when = (iso: string) => { const d = new Date(iso); return isNaN(+d) ? '' : d.toLocaleDateString() }
const main = computed(() => plan.value?.items.find(i => i.entry.id === plan.value?.main))
const of = (s: ImportItem['status']) => plan.value?.items.filter(i => i.status === s) ?? []
/** Per type: how many are new, changed and the same. */
const table = computed(() => SCHEMA.map(t => {
  const list = plan.value?.items.filter(i => i.entry.type === t.type) ?? []
  return { t, new: list.filter(i => i.status === 'new').length, changed: list.filter(i => i.status === 'changed').length, same: list.filter(i => i.status === 'same').length }
}).filter(r => r.new + r.changed + r.same))
const icon = (t: string) => SCHEMA.find(s => s.type === t)?.icon ?? ''
const anything = computed(() => !!plan.value && importChanges(plan.value))
const allTaken = computed({
  get: () => of('changed').every(i => i.take),
  set: v => { for (const i of of('changed')) i.take = v },
})

async function run() {
  if (!plan.value) return
  busy.value = true; error.value = ''
  try {
    const id = anything.value ? await applyImport(plan.value) : main.value?.here?.id
    plan.value = null
    go(id ? hrefEntry(id) : '#/')
  } catch (e) { error.value = (e as Error).message }
  finally { busy.value = false }
}
const close = () => { plan.value = null }
</script>

<template>
  <div v-if="plan" class="qs-backdrop" @mousedown.self="close" @keydown.esc="close">
    <form class="qs transfer" @submit.prevent="run">
      <h3 v-if="main">Import {{ icon(main.entry.type) }} {{ main.entry.name }}</h3>
      <h3 v-else>Import the world “{{ plan.from }}”</h3>
      <p class="muted small">From “{{ plan.from }}”<template v-if="when(plan.exported)">, exported {{ when(plan.exported) }}</template>.
        Entries you already have (the same one, or the same type and name) are updated; the rest are added.</p>

      <table class="grid transfer-table">
        <thead><tr><th></th><th>New</th><th>Updated</th><th>Already the same</th></tr></thead>
        <tbody>
          <tr v-for="r in table" :key="r.t.type">
            <td>{{ r.t.icon }} {{ r.t.plural }}</td>
            <td>{{ r.new || '' }}</td><td>{{ r.changed || '' }}</td><td class="muted">{{ r.same || '' }}</td>
          </tr>
        </tbody>
      </table>

      <template v-if="of('changed').length">
        <h4>Updated <label class="check inline"><input v-model="allTaken" type="checkbox" /> all</label></h4>
        <p class="muted small">Untick one to keep yours as it is.</p>
        <ul class="transfer-items">
          <li v-for="i in of('changed')" :key="i.ready.id">
            <input v-model="i.take" type="checkbox" :aria-label="`Update ${i.here!.name}`" />
            <span class="name">{{ icon(i.entry.type) }} <a :href="hrefEntry(i.here!.id)" target="_blank">{{ i.here!.name }}</a></span>
            <span v-if="i.here!.name !== i.ready.name" class="muted small">becomes “{{ i.ready.name }}”</span>
          </li>
        </ul>
      </template>
      <details v-if="of('new').length" class="small">
        <summary>{{ of('new').length }} new</summary>
        <p class="transfer-list"><span v-for="i in of('new')" :key="i.ready.id">{{ icon(i.entry.type) }} {{ i.ready.name }}</span></p>
      </details>

      <ul class="transfer-notes small">
        <li v-if="plan.relations.add.length || plan.relations.change.length">
          Connections: {{ plan.relations.add.length }} new<template v-if="plan.relations.change.length">, {{ plan.relations.change.length }} updated</template>
        </li>
        <li v-if="plan.lists.added || plan.lists.renamed">
          Dropdown lists: <template v-if="plan.lists.added">{{ plan.lists.added }} new option(s)</template><template v-if="plan.lists.added && plan.lists.renamed">, </template><template v-if="plan.lists.renamed">{{ plan.lists.renamed }} renamed</template>
        </li>
      </ul>
      <label v-if="plan.world?.changed" class="check"><input v-model="plan.world.take" type="checkbox" /> Update the calendar and today's date</label>

      <details v-if="plan.warnings.length" class="small">
        <summary class="muted">{{ plan.warnings.length }} thing(s) in the file this app doesn't take, left out</summary>
        <ul><li v-for="w in plan.warnings" :key="w">{{ w }}</li></ul>
      </details>
      <p v-if="!anything" class="muted">Everything in the file is already here, the same.</p>
      <p v-if="state.readOnly && anything" class="error">Nothing is being saved right now, so nothing can be imported.</p>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="actions">
        <button type="button" @click="close">Cancel</button>
        <button type="submit" class="primary" :disabled="busy || (anything && !!state.readOnly)">{{ busy ? 'Importing…' : anything ? 'Import' : main ? 'Open it' : 'Close' }}</button>
      </div>
    </form>
  </div>
</template>
