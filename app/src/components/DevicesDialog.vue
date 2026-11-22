<script setup lang="ts">
// "My devices": this world kept in sync with the user's other computers (devicesync/, electron/devices.cjs). This
// device's name, the paired devices (reachable or not, last sync, a clock that's off), "Sync now" and "Forget", and
// adding a device: a code shown here for ten minutes, typed in on the other one (world list → Join from my other
// device…), which then gets a copy of the world.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { devices, forgetDevice, refreshDevices, setDeviceName, startPairing, stopPairing, syncNow } from '../devicesync/devices'
import { state } from '../store'
import AppIcon from './AppIcon.vue'

const emit = defineEmits<{ close: [] }>()
const s = computed(() => devices.status)
const name = ref('')
const error = ref('')
const now = ref(Date.now())
let timer: number | undefined
onMounted(async () => {
  await refreshDevices()
  name.value = s.value?.me.name ?? ''
  timer = window.setInterval(() => { now.value = Date.now() }, 1000)
  window.addEventListener('keydown', onKey, true)
})
onUnmounted(() => { clearInterval(timer); window.removeEventListener('keydown', onKey, true) })
const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); emit('close') } }

const left = computed(() => {
  const u = s.value?.pairing?.until
  if (!u) return ''
  const sec = Math.max(0, Math.round((u - now.value) / 1000))
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
})
function ago(iso: string | null) {
  if (!iso) return 'not yet'
  const m = Math.round((now.value - Date.parse(iso)) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString()
}
const STATE = { connected: 'connected', connecting: 'looking…', away: 'not reachable' } as const
async function run(job: () => Promise<unknown>) {
  error.value = ''
  try { await job() } catch (e) { error.value = (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }
}
const rename = () => run(() => setDeviceName(name.value))
const pair = () => run(startPairing)
const forget = (id: string, n: string) => { if (confirm(`Forget ${n}?\n\nIt stops syncing with this world until it's paired again. Its own copy of the world stays as it is.`)) void run(() => forgetDevice(id)) }
</script>

<template>
  <Teleport to="body">
    <div class="modal-back" @mousedown.self="emit('close')">
      <div class="modal devices-dialog" role="dialog" aria-label="My devices">
        <header class="modal-head">
          <h2>My devices</h2>
          <span class="spacer" />
          <button class="x" title="Close (Esc)" @click="emit('close')">×</button>
        </header>
        <p class="small muted">{{ state.db?.meta.title }} stays the same on your other computers: changes made on one show up on the others while both have it open, and a device that was off catches up when it's on again. Changed on two devices before they talked: the newer change wins, and the other one is kept in the entry's History.</p>

        <label class="dev-me small">This device is called <input v-model="name" maxlength="60" aria-label="This device's name" @change="rename" /></label>

        <h4>Paired devices</h4>
        <ul v-if="s?.devices.length" class="dev-list">
          <li v-for="d in s.devices" :key="d.id">
            <span class="dev-dot" :class="d.state" :title="STATE[d.state]" />
            <span class="dev-name"><b>{{ d.name }}</b>
              <span class="muted small">{{ STATE[d.state] }} · last synced {{ ago(d.lastSync) }}<template v-if="d.host"> · {{ d.host }}{{ d.port && d.port !== 47110 ? `:${d.port}` : '' }}</template></span>
              <span v-if="Math.abs(d.clockOff) > 60" class="warn-text small">Its clock is {{ Math.round(Math.abs(d.clockOff) / 60) }} min {{ d.clockOff > 0 ? 'behind' : 'ahead of' }} this one's: set both to the right time, or the wrong change may win.</span>
            </span>
            <button type="button" class="chip-btn" :disabled="d.state !== 'connected' || devices.busy" title="Get its latest changes now" @click="run(() => syncNow(d.id))">Sync now</button>
            <button type="button" class="link-btn small" @click="forget(d.id, d.name)">Forget</button>
          </li>
        </ul>
        <p v-else class="muted small">None yet.</p>
        <p v-if="devices.busy" class="muted small">Syncing…</p>
        <p v-if="devices.error" class="warn-text small">Last sync: {{ devices.error }}</p>

        <h4>Add a device</h4>
        <div v-if="s?.pairing" class="dev-pairing">
          <p class="small">On the other computer, in GM Notes: click the world's name at the top left, then <b>Join from my other device…</b>, and enter this code:</p>
          <p class="dev-code">{{ s.pairing.code }}</p>
          <p class="muted small">Open for {{ left }}. If it isn't found by itself, enter this computer's address there: {{ s.addresses.map(a => s!.port && s!.port !== 47110 ? `${a}:${s!.port}` : a).join(' or ') }}.</p>
          <button type="button" @click="run(stopPairing)">Stop</button>
        </div>
        <template v-else>
          <p class="small">Both computers need GM Notes, on the same network (or connected through something like Tailscale). The other one gets a full copy of this world, pictures included.</p>
          <button type="button" class="primary" @click="pair"><AppIcon ui="link" /> Add a device…</button>
        </template>
        <p v-if="error" class="warn-text small">{{ error }}</p>
        <p class="muted small">Windows may ask whether GM Notes may accept connections: allow it for private networks. Not synced: the look (theme, card style), DM or player mode, sharing set-up and backups; each device keeps its own.</p>
      </div>
    </div>
  </Teleport>
</template>
