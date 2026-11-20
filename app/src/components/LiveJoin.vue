<script setup lang="ts">
// Find a DM's live session on this network (or type its address), then check the code. Used to join a world live
// (the world list) and to connect a world that already follows the DM's world, e.g. through Drive (⚙).
import { onMounted, ref } from 'vue'
import { desktop, type FoundSession } from '../storage/desktop'

const props = defineProps<{ /** Only this DM world (connecting a world that already follows it). */ worldId?: string }>()
const emit = defineEmits<{ chosen: [s: FoundSession, code: string]; cancel: [] }>()

const found = ref<FoundSession[] | null>(null)
const searching = ref(false)
const picked = ref<FoundSession | null>(null)
const address = ref(''), code = ref(''), error = ref(''), checking = ref(false)

async function search() {
  searching.value = true; error.value = ''
  try {
    const all = await desktop!.live.discover()
    found.value = props.worldId ? all.filter(s => s.worldId === props.worldId) : all
    if (found.value.length === 1 && !picked.value) picked.value = found.value[0]
  } finally { searching.value = false }
}
onMounted(search)

async function connect() {
  error.value = ''
  // a plain object: Vue's reactive copy can't be sent to the main process
  const target = picked.value ? { host: picked.value.host, port: picked.value.port } : address.value.trim()
  if (!target || !code.value.trim()) return
  checking.value = true
  try {
    const r = await desktop!.live.check(target, code.value.trim())
    if (!r.ok) { error.value = r.error; return }
    if (props.worldId && r.worldId !== props.worldId) { error.value = `That session is “${r.title}”, not the world this one follows.`; return }
    emit('chosen', { host: r.host, port: r.port, worldId: r.worldId, title: r.title }, code.value.trim().toUpperCase())
  } catch (e) { error.value = (e as Error).message } finally { checking.value = false }
}
</script>

<template>
  <form class="live-join" @submit.prevent="connect">
    <p v-if="searching" class="muted small">Looking for sessions on this network…</p>
    <template v-else-if="found">
      <ul v-if="found.length" class="live-found">
        <li v-for="s in found" :key="s.worldId + s.host">
          <label><input v-model="picked" type="radio" :value="s" name="live-session" /> <b>{{ s.title || 'A GM Notes world' }}</b> <span class="muted small">at {{ s.host }}</span></label>
        </li>
      </ul>
      <p v-else class="muted small">No session found{{ worldId ? ' for this world' : '' }}. Is your DM hosting (⚙ → Share with players), and are you on the same network?</p>
    </template>
    <p v-if="!picked" class="small"><label>Or the address your DM sees: <input v-model="address" class="live-address" placeholder="192.168.1.20" /></label></p>
    <p v-else class="small"><button type="button" class="link-btn small" @click="picked = null">Type an address instead</button></p>
    <p class="small"><label>Code: <input v-model="code" class="live-code-input" placeholder="K7QM-4XPT" autocomplete="off" spellcheck="false" /></label></p>
    <p v-if="error" class="error small">{{ error }}</p>
    <div class="world-actions">
      <button type="submit" class="primary" :disabled="checking || !code.trim() || !(picked || address.trim())">{{ checking ? 'Connecting…' : 'Connect' }}</button>
      <button type="button" :disabled="searching" @click="search">Search again</button>
      <button type="button" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>
