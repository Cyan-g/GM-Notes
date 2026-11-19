<script setup lang="ts">
// Publish for players: write what players may know into the shared folder, after showing what would change.
import TypeIcon from './TypeIcon.vue'
import { computed, ref, watch } from 'vue'
import { SCHEMA } from '../model/schema'
import { desktop } from '../storage/desktop'
import { db } from '../store'
import { planPublish, publish, type PublishPlan } from '../sync'

const open = defineModel<boolean>({ required: true })
const folder = ref<string | null>(null)
const plan = ref<PublishPlan | null>(null)
const busy = ref(''), error = ref(''), done = ref('')

async function prepare() {
  error.value = ''; done.value = ''; plan.value = null
  folder.value = await desktop!.publish.folder()
  if (!folder.value) return
  busy.value = 'Looking at what would be shared…'
  try { plan.value = await planPublish() } catch (e) { error.value = (e as Error).message } finally { busy.value = '' }
}
watch(open, v => { if (v) prepare() }, { immediate: true })
async function choose() { if (await desktop!.publish.pick()) await prepare() }

const icon = (t: string) => SCHEMA.find(s => s.type === t)?.icon ?? ''
const byType = computed(() => {
  const m = new Map<string, number>()
  for (const e of plan.value?.pub.entries ?? []) m.set(e.type, (m.get(e.type) ?? 0) + 1)
  return SCHEMA.filter(s => m.has(s.type)).map(s => ({ s, n: m.get(s.type)! }))
})
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString() : 'never')
const nothingNew = computed(() => !!plan.value?.previous && !plan.value.added.length && !plan.value.changed.length && !plan.value.removed.length)

async function go() {
  if (!plan.value) return
  error.value = ''
  busy.value = 'Publishing…'
  try {
    await publish(plan.value, (n, total) => { busy.value = `Copying pictures and files… ${n} / ${total}` })
    done.value = `Published at ${new Date().toLocaleTimeString()}. Your players' apps pick it up once Google Drive has synced it.`
    plan.value = null
  } catch (e) { error.value = (e as Error).message } finally { busy.value = '' }
}
</script>

<template>
  <div v-if="open" class="qs-backdrop" @mousedown.self="open = false" @keydown.esc="open = false">
    <div class="qs transfer publish">
      <h3>Publish for players</h3>
      <p class="muted small">Writes what players may know into a shared folder (e.g. a Google Drive folder shared with them as <i>Viewer</i>). Their DnDesk follows it and updates itself. Nothing ever comes back from it.</p>
      <template v-if="!folder">
        <p>Choose the shared folder first. DnDesk remembers it for this world.</p>
        <div class="actions"><button type="button" @click="open = false">Cancel</button><button class="primary" @click="choose">Choose folder…</button></div>
      </template>
      <template v-else>
        <p class="small">To <b>{{ folder }}</b> <button class="link-btn small" @click="choose">Change…</button><br />
          <span class="muted">Last published: {{ when(db().meta.lastPublished) }}</span></p>
        <p v-if="busy" class="muted">{{ busy }}</p>
        <template v-else-if="plan">
          <p class="muted small">Shared: every entry marked <b>Known to players</b>, without DM-only text, with the dropdown lists, the calendar and today's date. Never: characters, campaigns, sessions, encounters, creatures, or anything <b>DM only</b>.</p>
          <p class="small">{{ plan.pub.entries.length }} entries · {{ plan.pub.relations.length }} connections · {{ plan.blobs.size }} pictures and files</p>
          <p class="publish-types small"><span v-for="t in byType" :key="t.s.type"><TypeIcon :type="t.s.type" /> {{ t.n }} {{ t.n === 1 ? t.s.label : t.s.plural }}</span></p>
          <template v-if="plan.previous">
            <p v-if="nothingNew" class="muted">Nothing changed since the last publish.</p>
            <template v-else>
              <h4>Since the last publish</h4>
              <details v-if="plan.added.length" class="small"><summary>{{ plan.added.length }} new</summary>
                <p class="transfer-list"><span v-for="e in plan.added" :key="e.id"><TypeIcon :type="e.type" /> {{ e.name }}</span></p></details>
              <details v-if="plan.changed.length" class="small"><summary>{{ plan.changed.length }} changed</summary>
                <p class="transfer-list"><span v-for="e in plan.changed" :key="e.id"><TypeIcon :type="e.type" /> {{ e.name }}</span></p></details>
              <details v-if="plan.removed.length" class="small" open><summary>{{ plan.removed.length }} no longer shared (players lose them)</summary>
                <p class="transfer-list"><span v-for="e in plan.removed" :key="e.id">{{ e.name }}</span></p></details>
            </template>
          </template>
          <p v-else class="small">This is the first publish of this world. Check that your secrets are marked <b>DM only</b> first.</p>
        </template>
        <p v-if="done" class="ok">{{ done }}</p>
        <p v-if="error" class="error">{{ error }}</p>
        <div class="actions">
          <button type="button" @click="open = false">{{ done ? 'Close' : 'Cancel' }}</button>
          <button v-if="plan" class="primary" :disabled="!!busy" @click="go">Publish now</button>
        </div>
      </template>
    </div>
  </div>
</template>
