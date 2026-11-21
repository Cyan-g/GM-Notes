<script setup lang="ts">
// Share with players: host a live session on the local network and/or publish to a shared folder (Google Drive),
// after showing what would change. "Send now" writes to both and tells the players connected live.
import TypeIcon from './TypeIcon.vue'
import { computed, ref, watch } from 'vue'
import { SCHEMA } from '../model/schema'
import { desktop } from '../storage/desktop'
import { db } from '../store'
import { live, planPublish, publish, type PublishPlan, type PublishTarget } from '../sync'

const open = defineModel<boolean>({ required: true })
const folder = ref<string | null>(null)
const plan = ref<PublishPlan | null>(null)
const busy = ref(''), error = ref(''), done = ref(''), hostError = ref('')
const hosting = computed(() => live.host.hosting)
const host = computed(() => (live.host.hosting ? live.host : null))

async function prepare() {
  error.value = ''; plan.value = null
  folder.value = await desktop!.publish.folder()
  live.host = await desktop!.live.hostStatus()
  if (!folder.value && !hosting.value) return
  busy.value = 'Looking at what would be shared…'
  try { plan.value = await planPublish(folder.value ? 'publish' : 'live') } catch (e) { error.value = (e as Error).message } finally { busy.value = '' }
}
watch(open, v => { if (v) { done.value = ''; prepare() } }, { immediate: true })
async function choose() { if (await desktop!.publish.pick()) await prepare() }

async function startHosting() {
  hostError.value = ''
  try { live.host = await desktop!.live.start(db().meta.title) } catch (e) { hostError.value = (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }
  await prepare()
}
async function stopHosting() { await desktop!.live.stop(); live.host = { hosting: false }; await prepare() }
async function newCode() {
  if (!confirm('Make a new code? Everyone connected is dropped and needs the new code to connect again.')) return
  await desktop!.live.newCode()
  live.host = await desktop!.live.hostStatus()
}

const byType = computed(() => {
  const m = new Map<string, number>()
  for (const e of plan.value?.pub.entries ?? []) m.set(e.type, (m.get(e.type) ?? 0) + 1)
  return SCHEMA.filter(s => m.has(s.type)).map(s => ({ s, n: m.get(s.type)! }))
})
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : 'never')
const nothingNew = computed(() => !!plan.value?.previous && !plan.value.added.length && !plan.value.changed.length && !plan.value.removed.length)
/** A session that hasn't had anything sent yet still needs a first send, even when the folder is up to date. */
const liveBehind = computed(() => !!host.value && host.value.published !== plan.value?.previous)
const targets = computed<PublishTarget[]>(() => [...(hosting.value ? ['live' as const] : []), ...(folder.value ? ['publish' as const] : [])])

async function go() {
  if (!plan.value) return
  error.value = ''
  busy.value = hosting.value ? 'Sending…' : 'Publishing…'
  try {
    await publish(plan.value, (n, total) => { busy.value = `Copying pictures and files… ${n} / ${total}` }, targets.value)
    const t = new Date().toLocaleTimeString()
    const players = host.value?.players.length ?? 0
    done.value = [
      hosting.value && `Sent at ${t} to ${players === 1 ? '1 player' : `${players} players`} connected (others get it when they connect).`,
      folder.value && `${hosting.value ? 'The shared folder too' : `Published at ${t}`}: players' apps pick it up once Google Drive has synced it.`,
    ].filter(Boolean).join(' ')
    await prepare()
  } catch (e) { error.value = (e as Error).message } finally { busy.value = '' }
}
</script>

<template>
  <div v-if="open" class="qs-backdrop" @mousedown.self="open = false" @keydown.esc="open = false">
    <div class="qs transfer publish">
      <h3>Share with players</h3>
      <p class="muted small">Sends what players may know to their GM Notes: live to the players at your table (same network), and/or into a shared folder (e.g. a Google Drive folder shared with them as <i>Viewer</i>). Nothing ever comes back.</p>

      <section class="live-box" :class="{ on: hosting }">
        <h4>Live session <span v-if="host" class="live-dot">● hosting</span></h4>
        <template v-if="host">
          <p class="small">Players on this network find it under <b>Join a live session</b> (or type <b>{{ host.addresses[0] ?? 'this computer\'s address' }}{{ host.port === 47100 ? '' : `:${host.port}` }}</b>{{ host.addresses.length > 1 ? `; also ${host.addresses.slice(1).join(', ')}` : '' }}), then the code:</p>
          <p class="live-code"><code>{{ host.code }}</code> <button class="link-btn small" title="Players need the new code; everyone connected is dropped" @click="newCode">New code</button></p>
          <p class="small">{{ host.players.length ? `Connected: ${host.players.join(', ')}` : 'No players connected yet.' }}
            <span class="muted"> · last sent {{ when(host.published) }}</span></p>
          <div class="actions"><button type="button" @click="stopHosting">Stop hosting</button></div>
        </template>
        <template v-else>
          <p class="small">Players at your table on the same network (Wi-Fi) get the world straight from this app while you host. The code stays the same for this world, so they type it once.</p>
          <p v-if="hostError" class="error">{{ hostError }}</p>
          <div class="actions"><button type="button" class="primary" @click="startHosting">Start hosting</button></div>
          <p class="muted small">The first time, Windows asks whether GM Notes may accept connections: allow it on private networks.</p>
        </template>
      </section>

      <p class="small"><b>Shared folder:</b> <template v-if="folder">{{ folder }} <button class="link-btn small" @click="choose">Change…</button></template>
        <template v-else><span class="muted">none</span> <button class="link-btn small" @click="choose">Choose folder…</button></template><br />
        <span class="muted">Last published: {{ when(db().meta.lastPublished) }}</span></p>

      <p v-if="busy" class="muted">{{ busy }}</p>
      <template v-else-if="plan">
        <p class="muted small">Shared: every entry marked <b>Known to players</b>, without DM-only text, with the dropdown lists, the calendar and today's date. Never: characters, campaigns, sessions, encounters, or anything <b>DM only</b> (creatures go when known to players, e.g. companions).</p>
        <p class="small">{{ plan.pub.entries.length }} entries · {{ plan.pub.relations.length }} connections · {{ plan.blobs.size }} pictures and files</p>
        <p class="publish-types small"><span v-for="t in byType" :key="t.s.type"><TypeIcon :type="t.s.type" /> {{ t.n }} {{ t.n === 1 ? t.s.label : t.s.plural }}</span></p>
        <template v-if="plan.previous">
          <p v-if="nothingNew" class="muted">Nothing changed since the last {{ folder ? 'publish' : 'send' }}.</p>
          <template v-else>
            <h4>Since the last {{ folder ? 'publish' : 'send' }}</h4>
            <details v-if="plan.added.length" class="small"><summary>{{ plan.added.length }} new</summary>
              <p class="transfer-list"><span v-for="e in plan.added" :key="e.id"><TypeIcon :type="e.type" /> {{ e.name }}</span></p></details>
            <details v-if="plan.changed.length" class="small"><summary>{{ plan.changed.length }} changed</summary>
              <p class="transfer-list"><span v-for="e in plan.changed" :key="e.id"><TypeIcon :type="e.type" /> {{ e.name }}</span></p></details>
            <details v-if="plan.removed.length" class="small" open><summary>{{ plan.removed.length }} no longer shared (players lose them)</summary>
              <p class="transfer-list"><span v-for="e in plan.removed" :key="e.id">{{ e.name }}</span></p></details>
          </template>
        </template>
        <p v-else class="small">This is the first time this world is shared. Check that your secrets are marked <b>DM only</b> first.</p>
      </template>
      <p v-else-if="!error" class="muted small">Start hosting or choose a shared folder to share the world.</p>
      <p v-if="done" class="ok">{{ done }}</p>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="actions">
        <button type="button" @click="open = false">Close</button>
        <button v-if="plan" class="primary" :disabled="!!busy" :title="targets.length === 2 ? 'To the live session and the shared folder' : undefined" @click="go">
          {{ hosting ? 'Send now' : 'Publish now' }}<template v-if="hosting && nothingNew && !liveBehind"> again</template>
        </button>
      </div>
    </div>
  </div>
</template>
